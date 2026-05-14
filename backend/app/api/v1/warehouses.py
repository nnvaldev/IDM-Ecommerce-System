from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_active_seller, get_current_user, require_roles
from app.models.seller import Seller
from app.models.user import User, UserRole
from app.models.warehouse import Warehouse
from app.schemas.catalog import WarehouseCreate, WarehousePublic, WarehouseUpdate

router = APIRouter(prefix="/warehouses", tags=["warehouses"])


@router.get("", response_model=list[WarehousePublic])
async def list_warehouses(
    only_active: bool = True,
    seller_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Warehouse]:
    stmt = select(Warehouse).order_by(Warehouse.code)
    if only_active:
        stmt = stmt.where(Warehouse.is_active.is_(True))
    # Si el usuario es SELLER, sólo ve sus propios almacenes.
    if current_user.role == UserRole.SELLER:
        seller_row = (
            await db.execute(select(Seller).where(Seller.owner_user_id == current_user.id))
        ).scalar_one_or_none()
        if seller_row is None:
            return []
        stmt = stmt.where(Warehouse.seller_id == seller_row.id)
    elif seller_id is not None:
        stmt = stmt.where(Warehouse.seller_id == seller_id)
    return list((await db.execute(stmt)).scalars().all())


@router.post("", response_model=WarehousePublic, status_code=status.HTTP_201_CREATED)
async def create_warehouse(
    payload: WarehouseCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
) -> Warehouse:
    """ADMIN crea almacén de la empresa raíz (IDM)."""
    existing = await db.execute(select(Warehouse).where(Warehouse.code == payload.code))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Código de almacén ya existe")
    house = (await db.execute(select(Seller).where(Seller.is_house.is_(True)))).scalar_one()
    wh = Warehouse(**payload.model_dump(), seller_id=house.id)
    db.add(wh)
    await db.commit()
    await db.refresh(wh)
    return wh


@router.post("/my", response_model=WarehousePublic, status_code=status.HTTP_201_CREATED)
async def create_my_warehouse(
    payload: WarehouseCreate,
    db: AsyncSession = Depends(get_db),
    seller: Seller = Depends(get_active_seller),
) -> Warehouse:
    existing = await db.execute(select(Warehouse).where(Warehouse.code == payload.code))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Código de almacén ya existe")
    wh = Warehouse(**payload.model_dump(), seller_id=seller.id)
    db.add(wh)
    await db.commit()
    await db.refresh(wh)
    return wh


@router.patch("/{warehouse_id}", response_model=WarehousePublic)
async def update_warehouse(
    warehouse_id: int,
    payload: WarehouseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Warehouse:
    wh = (
        await db.execute(select(Warehouse).where(Warehouse.id == warehouse_id))
    ).scalar_one_or_none()
    if wh is None:
        raise HTTPException(status_code=404, detail="Almacén no encontrado")
    if current_user.role == UserRole.SELLER:
        seller = (
            await db.execute(select(Seller).where(Seller.owner_user_id == current_user.id))
        ).scalar_one_or_none()
        if seller is None or wh.seller_id != seller.id:
            raise HTTPException(status_code=403, detail="Almacén no pertenece a tu empresa")
    elif current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Sin permiso")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(wh, k, v)
    await db.commit()
    await db.refresh(wh)
    return wh
