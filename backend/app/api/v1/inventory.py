from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_active_seller, get_current_user, require_roles
from app.models.inventory import Inventory, InventoryMovement
from app.models.product import Product
from app.models.seller import Seller
from app.models.user import User, UserRole
from app.models.warehouse import Warehouse
from app.schemas.catalog import (
    InventoryMovementPublic,
    StockAdjustRequest,
    StockAlert,
)
from app.services.inventory import (
    InsufficientStock,
    InventoryError,
    adjust_stock,
    list_low_or_out_alerts,
)

router = APIRouter(prefix="/inventory", tags=["inventory"])


async def _seller_for_user(db: AsyncSession, user: User) -> Seller | None:
    if user.role != UserRole.SELLER:
        return None
    return (
        await db.execute(select(Seller).where(Seller.owner_user_id == user.id))
    ).scalar_one_or_none()


async def _validate_seller_owns(
    db: AsyncSession, user: User, product_id: int, warehouse_id: int
) -> None:
    """Si el usuario es SELLER, valida que product y warehouse pertenezcan a su empresa."""
    if user.role != UserRole.SELLER:
        return
    seller = await _seller_for_user(db, user)
    if seller is None:
        raise HTTPException(status_code=403, detail="No tienes una empresa registrada")
    prod = (
        await db.execute(select(Product).where(Product.id == product_id))
    ).scalar_one_or_none()
    wh = (
        await db.execute(select(Warehouse).where(Warehouse.id == warehouse_id))
    ).scalar_one_or_none()
    if prod is None or wh is None:
        raise HTTPException(status_code=404, detail="Producto o almacén no encontrado")
    if prod.seller_id != seller.id or wh.seller_id != seller.id:
        raise HTTPException(
            status_code=403, detail="Producto o almacén no pertenece a tu empresa"
        )


@router.post("/adjust", response_model=InventoryMovementPublic)
async def adjust(
    payload: StockAdjustRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.SELLER)),
) -> InventoryMovement:
    """CUE-03 paso 1: registrar movimiento físico (entrada/ajuste) en sucursal."""
    await _validate_seller_owns(db, user, payload.product_id, payload.warehouse_id)
    try:
        await adjust_stock(
            db,
            product_id=payload.product_id,
            warehouse_id=payload.warehouse_id,
            delta=payload.delta,
            user_id=user.id,
            notes=payload.notes,
            reference_type="ADJUSTMENT",
        )
    except InsufficientStock as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except InventoryError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    await db.commit()
    last = (
        await db.execute(
            select(InventoryMovement)
            .where(
                InventoryMovement.product_id == payload.product_id,
                InventoryMovement.warehouse_id == payload.warehouse_id,
            )
            .order_by(InventoryMovement.id.desc())
            .limit(1)
        )
    ).scalar_one()
    return last


@router.get("/movements", response_model=list[InventoryMovementPublic])
async def list_movements(
    product_id: int | None = None,
    warehouse_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(
        require_roles(
            UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.SALES, UserRole.SELLER
        )
    ),
) -> list[InventoryMovement]:
    stmt = select(InventoryMovement).order_by(InventoryMovement.id.desc()).limit(limit)
    if product_id:
        stmt = stmt.where(InventoryMovement.product_id == product_id)
    if warehouse_id:
        stmt = stmt.where(InventoryMovement.warehouse_id == warehouse_id)
    # Scope para sellers
    if user.role == UserRole.SELLER:
        seller = await _seller_for_user(db, user)
        if seller is None:
            return []
        # join con products para filtrar por seller_id
        stmt = stmt.join(Product, Product.id == InventoryMovement.product_id).where(
            Product.seller_id == seller.id
        )
    return list((await db.execute(stmt)).scalars().all())


@router.get("/by-warehouse/{warehouse_id}", response_model=list[dict])
async def stock_by_warehouse(
    warehouse_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    # SELLER sólo puede ver almacenes propios.
    if user.role == UserRole.SELLER:
        seller = await _seller_for_user(db, user)
        wh = (
            await db.execute(select(Warehouse).where(Warehouse.id == warehouse_id))
        ).scalar_one_or_none()
        if seller is None or wh is None or wh.seller_id != seller.id:
            raise HTTPException(status_code=403, detail="Almacén no pertenece a tu empresa")
    rows = (
        await db.execute(
            select(Inventory).where(Inventory.warehouse_id == warehouse_id)
        )
    ).scalars().all()
    return [
        {
            "product_id": r.product_id,
            "quantity": r.quantity,
            "reserved": r.reserved,
            "available": r.quantity - r.reserved,
            "min_stock": r.min_stock,
        }
        for r in rows
    ]


@router.get("/alerts", response_model=list[StockAlert])
async def alerts(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(
        require_roles(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.SELLER)
    ),
) -> list[dict]:
    """CUE-03 alerta 'Requiere Importación'. SELLER ve solo alertas de su catálogo."""
    seller_id = None
    if user.role == UserRole.SELLER:
        seller = await _seller_for_user(db, user)
        if seller is None:
            return []
        seller_id = seller.id
    return await list_low_or_out_alerts(db, seller_id=seller_id)
