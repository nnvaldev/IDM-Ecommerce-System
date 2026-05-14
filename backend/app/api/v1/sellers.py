import re
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_active_seller, get_current_user, require_roles
from app.core.security import hash_password
from app.models.invoice import Invoice
from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product
from app.models.seller import Seller, SellerStatus
from app.models.user import User, UserRole
from app.schemas.cart import OrderInvoiceSummary, OrderItemPublic, OrderPublic
from app.schemas.seller import (
    SellerPublic,
    SellerRegisterRequest,
    SellerRegisterResponse,
    SellerRejectRequest,
    SellerSummary,
    SellerUpdateRequest,
    SellerWithOwner,
)

router = APIRouter(prefix="/sellers", tags=["sellers"])


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[áàä]", "a", text)
    text = re.sub(r"[éèë]", "e", text)
    text = re.sub(r"[íìï]", "i", text)
    text = re.sub(r"[óòö]", "o", text)
    text = re.sub(r"[úùü]", "u", text)
    text = re.sub(r"[ñ]", "n", text)
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = text.strip("-")
    return text[:60] or "empresa"


async def _unique_slug(db: AsyncSession, base: str) -> str:
    slug = _slugify(base)
    suffix = 0
    while True:
        candidate = slug if suffix == 0 else f"{slug}-{suffix}"
        existing = await db.execute(select(Seller).where(Seller.slug == candidate))
        if existing.scalar_one_or_none() is None:
            return candidate
        suffix += 1


@router.post(
    "/register",
    response_model=SellerRegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_seller(
    payload: SellerRegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> SellerRegisterResponse:
    """Registro público de empresa vendedora. Queda en estado PENDING hasta aprobación del admin."""
    # Validar email del owner único
    existing_user = await db.execute(select(User).where(User.email == payload.owner_email))
    if existing_user.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un usuario con ese email",
        )

    # Validar NIT único
    existing_nit = await db.execute(select(Seller).where(Seller.nit == payload.nit))
    if existing_nit.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una empresa registrada con ese NIT",
        )

    owner = User(
        email=payload.owner_email,
        password_hash=hash_password(payload.owner_password),
        full_name=payload.owner_full_name,
        role=UserRole.SELLER,
        is_active=True,
    )
    db.add(owner)
    await db.flush()

    slug = await _unique_slug(db, payload.name)
    seller = Seller(
        name=payload.name,
        slug=slug,
        nit=payload.nit,
        contact_email=payload.contact_email,
        phone=payload.phone,
        address=payload.address,
        city=payload.city,
        description=payload.description,
        logo_url=payload.logo_url,
        status=SellerStatus.PENDING,
        owner_user_id=owner.id,
    )
    db.add(seller)
    await db.commit()
    await db.refresh(seller)

    return SellerRegisterResponse(
        seller=SellerPublic.model_validate(seller),
        message="Empresa registrada. Espera la aprobación del administrador para empezar a vender.",
    )


@router.get("/me", response_model=SellerPublic)
async def get_my_seller(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Seller:
    if current_user.role != UserRole.SELLER:
        raise HTTPException(status_code=403, detail="Solo usuarios con rol SELLER")
    result = await db.execute(select(Seller).where(Seller.owner_user_id == current_user.id))
    seller = result.scalar_one_or_none()
    if seller is None:
        raise HTTPException(status_code=404, detail="No tienes una empresa registrada")
    return seller


@router.get("", response_model=list[SellerWithOwner])
async def list_sellers(
    status_filter: SellerStatus | None = Query(default=None, alias="status"),
    q: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
) -> list[Seller]:
    stmt = select(Seller).options(selectinload(Seller.owner))
    if status_filter is not None:
        stmt = stmt.where(Seller.status == status_filter)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(Seller.name.ilike(like), Seller.slug.ilike(like), Seller.nit.ilike(like))
        )
    stmt = stmt.order_by(Seller.created_at.desc()).limit(limit).offset(offset)
    return list((await db.execute(stmt)).scalars().all())


@router.get("/public", response_model=list[SellerSummary])
async def list_public_sellers(
    db: AsyncSession = Depends(get_db),
) -> list[Seller]:
    """Listado público de empresas aprobadas (para filtrar el catálogo)."""
    stmt = (
        select(Seller)
        .where(Seller.status == SellerStatus.APPROVED)
        .order_by(Seller.name)
    )
    return list((await db.execute(stmt)).scalars().all())


@router.get("/{seller_id}", response_model=SellerWithOwner)
async def get_seller(
    seller_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
) -> Seller:
    seller = (
        await db.execute(
            select(Seller).options(selectinload(Seller.owner)).where(Seller.id == seller_id)
        )
    ).scalar_one_or_none()
    if seller is None:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    return seller


@router.patch("/me", response_model=SellerPublic)
async def update_my_seller(
    payload: SellerUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Seller:
    if current_user.role not in (UserRole.SELLER, UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Sin permiso")
    if current_user.role == UserRole.SELLER:
        result = await db.execute(select(Seller).where(Seller.owner_user_id == current_user.id))
    else:
        # ADMIN editando su propio (no permitido por esta ruta, solo dueños)
        raise HTTPException(status_code=400, detail="Admin debe usar PATCH /sellers/{id}")
    seller = result.scalar_one_or_none()
    if seller is None:
        raise HTTPException(status_code=404, detail="No tienes una empresa registrada")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(seller, k, v)
    await db.commit()
    await db.refresh(seller)
    return seller


@router.post("/{seller_id}/approve", response_model=SellerPublic)
async def approve_seller(
    seller_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
) -> Seller:
    seller = (await db.execute(select(Seller).where(Seller.id == seller_id))).scalar_one_or_none()
    if seller is None:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    seller.status = SellerStatus.APPROVED
    seller.rejection_reason = None
    await db.commit()
    await db.refresh(seller)
    return seller


@router.post("/{seller_id}/reject", response_model=SellerPublic)
async def reject_seller(
    seller_id: int,
    payload: SellerRejectRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
) -> Seller:
    seller = (await db.execute(select(Seller).where(Seller.id == seller_id))).scalar_one_or_none()
    if seller is None:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    seller.status = SellerStatus.REJECTED
    seller.rejection_reason = payload.reason
    await db.commit()
    await db.refresh(seller)
    return seller


@router.get("/me/orders", response_model=list[OrderPublic])
async def list_my_orders(
    status_filter: OrderStatus | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
    seller: Seller = Depends(get_active_seller),
) -> list[OrderPublic]:
    stmt = select(Order).where(Order.seller_id == seller.id).order_by(Order.id.desc())
    if status_filter is not None:
        stmt = stmt.where(Order.status == status_filter)
    orders = list((await db.execute(stmt)).scalars().all())
    out: list[OrderPublic] = []
    for o in orders:
        items = (
            await db.execute(select(OrderItem).where(OrderItem.order_id == o.id))
        ).scalars().all()
        inv = (
            await db.execute(select(Invoice).where(Invoice.order_id == o.id))
        ).scalar_one_or_none()
        out.append(
            OrderPublic(
                id=o.id,
                order_number=o.order_number,
                seller_id=o.seller_id,
                customer_id=o.customer_id,
                status=o.status,
                channel=o.channel,
                payment_method=o.payment_method,
                subtotal=o.subtotal,
                tax=o.tax,
                total=o.total,
                currency=o.currency,
                notes=o.notes,
                items=[OrderItemPublic.model_validate(i) for i in items],
                invoice=OrderInvoiceSummary.model_validate(inv) if inv else None,
            )
        )
    return out


@router.get("/me/stats")
async def get_my_stats(
    db: AsyncSession = Depends(get_db),
    seller: Seller = Depends(get_active_seller),
) -> dict:
    total_products = (
        await db.execute(
            select(func.count(Product.id)).where(Product.seller_id == seller.id)
        )
    ).scalar_one()
    active_products = (
        await db.execute(
            select(func.count(Product.id)).where(
                Product.seller_id == seller.id, Product.is_active.is_(True)
            )
        )
    ).scalar_one()
    total_orders = (
        await db.execute(
            select(func.count(Order.id)).where(Order.seller_id == seller.id)
        )
    ).scalar_one()
    pending_orders = (
        await db.execute(
            select(func.count(Order.id)).where(
                Order.seller_id == seller.id,
                Order.status == OrderStatus.PENDING_APPROVAL,
            )
        )
    ).scalar_one()
    revenue = (
        await db.execute(
            select(func.coalesce(func.sum(Order.total), 0)).where(
                Order.seller_id == seller.id,
                Order.status.in_(
                    [OrderStatus.PAID, OrderStatus.CONFIRMED, OrderStatus.DELIVERED]
                ),
            )
        )
    ).scalar_one()
    return {
        "seller": {"id": seller.id, "name": seller.name, "status": seller.status.value},
        "total_products": int(total_products),
        "active_products": int(active_products),
        "total_orders": int(total_orders),
        "pending_orders": int(pending_orders),
        "total_revenue": float(Decimal(str(revenue))),
    }


@router.post("/{seller_id}/suspend", response_model=SellerPublic)
async def suspend_seller(
    seller_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
) -> Seller:
    seller = (await db.execute(select(Seller).where(Seller.id == seller_id))).scalar_one_or_none()
    if seller is None:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    if seller.is_house:
        raise HTTPException(status_code=400, detail="No se puede suspender la empresa raíz (IDM)")
    seller.status = SellerStatus.SUSPENDED
    await db.commit()
    await db.refresh(seller)
    return seller
