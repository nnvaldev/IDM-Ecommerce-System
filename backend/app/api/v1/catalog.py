from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_active_seller, get_current_user, require_roles
from app.models.product import Product, ProductCategory, ProductType
from app.models.seller import Seller, SellerStatus
from app.models.user import User, UserRole
from app.models.warehouse import Warehouse
from app.schemas.catalog import (
    CategoryCreate,
    CategoryPublic,
    ProductCreate,
    ProductListItem,
    ProductPublic,
    ProductUpdate,
    StockByWarehouse,
)
from app.services.inventory import (
    get_inventory_rows,
    get_stock_summaries_bulk,
    get_stock_summary,
)

router = APIRouter(prefix="/catalog", tags=["catalog"])


# ---------- Categories ----------
@router.get("/categories", response_model=list[CategoryPublic])
async def list_categories(
    product_type: ProductType | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[ProductCategory]:
    stmt = select(ProductCategory).order_by(ProductCategory.name)
    if product_type is not None:
        stmt = stmt.where(ProductCategory.product_type == product_type)
    return list((await db.execute(stmt)).scalars().all())


@router.post(
    "/categories",
    response_model=CategoryPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_category(
    payload: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
) -> ProductCategory:
    cat = ProductCategory(**payload.model_dump())
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


# ---------- Products ----------
async def _build_public(db: AsyncSession, product: Product) -> ProductPublic:
    summary = await get_stock_summary(db, product.id)
    rows = await get_inventory_rows(db, product.id)
    wh_ids = [r.warehouse_id for r in rows]
    wh_map = {}
    if wh_ids:
        wh_stmt = select(Warehouse).where(Warehouse.id.in_(wh_ids))
        for wh in (await db.execute(wh_stmt)).scalars().all():
            wh_map[wh.id] = wh

    stock_by_wh = [
        StockByWarehouse(
            warehouse_id=r.warehouse_id,
            warehouse_code=wh_map[r.warehouse_id].code,
            warehouse_city=wh_map[r.warehouse_id].city,
            quantity=r.quantity,
            reserved=r.reserved,
            available=r.quantity - r.reserved,
            min_stock=r.min_stock,
        )
        for r in rows
        if r.warehouse_id in wh_map
    ]

    seller = (
        await db.execute(select(Seller).where(Seller.id == product.seller_id))
    ).scalar_one_or_none()

    base = ProductPublic.model_validate(product)
    base.seller_id = product.seller_id
    base.seller_name = seller.name if seller else None
    base.seller_slug = seller.slug if seller else None
    base.total_quantity = summary.total_quantity
    base.total_available = summary.total_available
    base.is_sold_out = summary.is_sold_out
    base.stock_by_warehouse = stock_by_wh
    return base


@router.get("/products", response_model=list[ProductListItem])
async def list_products(
    q: str | None = Query(default=None, description="Búsqueda por nombre o SKU"),
    product_type: ProductType | None = None,
    category_id: int | None = None,
    seller_id: int | None = Query(default=None, description="Filtrar por empresa vendedora"),
    seller_slug: str | None = Query(default=None, description="Filtrar por slug de empresa"),
    only_active: bool = True,
    include_sold_out: bool = True,
    only_approved_sellers: bool = Query(
        default=True,
        description="Si True, sólo muestra productos de sellers APPROVED (público).",
    ),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[ProductListItem]:
    stmt = select(Product, Seller).join(Seller, Seller.id == Product.seller_id)
    if only_active:
        stmt = stmt.where(Product.is_active.is_(True))
    if only_approved_sellers:
        stmt = stmt.where(Seller.status == SellerStatus.APPROVED)
    if product_type is not None:
        stmt = stmt.where(Product.product_type == product_type)
    if category_id is not None:
        stmt = stmt.where(Product.category_id == category_id)
    if seller_id is not None:
        stmt = stmt.where(Product.seller_id == seller_id)
    if seller_slug:
        stmt = stmt.where(Seller.slug == seller_slug)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(Product.name.ilike(like), Product.sku.ilike(like))
        )

    stmt = stmt.order_by(Product.name).limit(limit).offset(offset)
    rows = list((await db.execute(stmt)).all())
    products = [r[0] for r in rows]
    sellers_by_pid = {p.id: r[1] for p, r in zip(products, rows, strict=True)}
    summaries = await get_stock_summaries_bulk(db, [p.id for p in products])

    items: list[ProductListItem] = []
    for p in products:
        s = summaries[p.id]
        if not include_sold_out and s.is_sold_out:
            continue
        seller = sellers_by_pid[p.id]
        items.append(
            ProductListItem(
                id=p.id,
                sku=p.sku,
                name=p.name,
                product_type=p.product_type,
                base_price=p.base_price,
                currency=p.currency,
                is_active=p.is_active,
                total_available=s.total_available,
                is_sold_out=s.is_sold_out,
                seller_id=p.seller_id,
                seller_name=seller.name if seller else None,
                seller_slug=seller.slug if seller else None,
            )
        )
    return items


@router.get("/products/{product_id}", response_model=ProductPublic)
async def get_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
) -> ProductPublic:
    product = (
        await db.execute(
            select(Product)
            .options(selectinload(Product.category))
            .where(Product.id == product_id)
        )
    ).scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return await _build_public(db, product)


@router.get("/products/by-sku/{sku}", response_model=ProductPublic)
async def get_product_by_sku(
    sku: str,
    db: AsyncSession = Depends(get_db),
) -> ProductPublic:
    product = (
        await db.execute(select(Product).where(Product.sku == sku))
    ).scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return await _build_public(db, product)


# ---------- Admin: crear/editar productos del seller raíz (IDM) ----------
@router.post(
    "/products",
    response_model=ProductPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_product(
    payload: ProductCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.ADMIN)),
) -> ProductPublic:
    existing = await db.execute(select(Product).where(Product.sku == payload.sku))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="SKU ya existe")
    # ADMIN crea productos de la empresa raíz (IDM, id=1).
    house = (
        await db.execute(select(Seller).where(Seller.is_house.is_(True)))
    ).scalar_one()
    product = Product(**payload.model_dump(), seller_id=house.id)
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return await _build_public(db, product)


@router.patch("/products/{product_id}", response_model=ProductPublic)
async def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
) -> ProductPublic:
    product = (
        await db.execute(select(Product).where(Product.id == product_id))
    ).scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(product, k, v)
    await db.commit()
    await db.refresh(product)
    return await _build_public(db, product)


# ---------- Endpoints scoped al seller logueado ----------
@router.get("/my/products", response_model=list[ProductListItem])
async def list_my_products(
    q: str | None = None,
    only_active: bool = True,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    seller: Seller = Depends(get_active_seller),
) -> list[ProductListItem]:
    stmt = select(Product).where(Product.seller_id == seller.id)
    if only_active:
        stmt = stmt.where(Product.is_active.is_(True))
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(Product.name.ilike(like), Product.sku.ilike(like)))
    stmt = stmt.order_by(Product.name).limit(limit).offset(offset)
    products = list((await db.execute(stmt)).scalars().all())
    summaries = await get_stock_summaries_bulk(db, [p.id for p in products])
    items: list[ProductListItem] = []
    for p in products:
        s = summaries[p.id]
        items.append(
            ProductListItem(
                id=p.id,
                sku=p.sku,
                name=p.name,
                product_type=p.product_type,
                base_price=p.base_price,
                currency=p.currency,
                is_active=p.is_active,
                total_available=s.total_available,
                is_sold_out=s.is_sold_out,
                seller_id=p.seller_id,
                seller_name=seller.name,
                seller_slug=seller.slug,
            )
        )
    return items


@router.post(
    "/my/products",
    response_model=ProductPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_my_product(
    payload: ProductCreate,
    db: AsyncSession = Depends(get_db),
    seller: Seller = Depends(get_active_seller),
) -> ProductPublic:
    existing = await db.execute(select(Product).where(Product.sku == payload.sku))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="SKU ya existe")
    product = Product(**payload.model_dump(), seller_id=seller.id)
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return await _build_public(db, product)


@router.patch("/my/products/{product_id}", response_model=ProductPublic)
async def update_my_product(
    product_id: int,
    payload: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    seller: Seller = Depends(get_active_seller),
) -> ProductPublic:
    product = (
        await db.execute(select(Product).where(Product.id == product_id))
    ).scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    if product.seller_id != seller.id:
        raise HTTPException(status_code=403, detail="Este producto no pertenece a tu empresa")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(product, k, v)
    await db.commit()
    await db.refresh(product)
    return await _build_public(db, product)
