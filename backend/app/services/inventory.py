"""Servicio de inventario multidiversificador.

Cubre CUE-03:
- Stock consolidado nacional (suma de todas las sucursales).
- Bloqueo automático cuando stock = 0 (estado Agotado).
- Reservas temporales (cuenta como ocupado pero no descontado).
- Movimientos auditables (entrada, salida, ajuste, reserva, liberación).
- Alertas de stock bajo / agotado.

Concurrencia: SELECT ... FOR UPDATE sobre la fila Inventory antes de mutar
para impedir overselling bajo carga.
"""
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import Inventory, InventoryMovement, MovementType
from app.models.product import Product


class InventoryError(Exception):
    pass


class InsufficientStock(InventoryError):
    pass


@dataclass
class StockSummary:
    product_id: int
    total_quantity: int
    total_reserved: int
    total_available: int
    is_sold_out: bool


async def get_stock_summary(db: AsyncSession, product_id: int) -> StockSummary:
    stmt = select(
        func.coalesce(func.sum(Inventory.quantity), 0),
        func.coalesce(func.sum(Inventory.reserved), 0),
    ).where(Inventory.product_id == product_id)
    qty, reserved = (await db.execute(stmt)).one()
    available = int(qty) - int(reserved)
    return StockSummary(
        product_id=product_id,
        total_quantity=int(qty),
        total_reserved=int(reserved),
        total_available=available,
        is_sold_out=available <= 0,
    )


async def get_stock_summaries_bulk(
    db: AsyncSession, product_ids: Sequence[int]
) -> dict[int, StockSummary]:
    if not product_ids:
        return {}
    stmt = (
        select(
            Inventory.product_id,
            func.coalesce(func.sum(Inventory.quantity), 0).label("qty"),
            func.coalesce(func.sum(Inventory.reserved), 0).label("reserved"),
        )
        .where(Inventory.product_id.in_(product_ids))
        .group_by(Inventory.product_id)
    )
    out: dict[int, StockSummary] = {}
    for pid, qty, reserved in (await db.execute(stmt)).all():
        avail = int(qty) - int(reserved)
        out[int(pid)] = StockSummary(
            product_id=int(pid),
            total_quantity=int(qty),
            total_reserved=int(reserved),
            total_available=avail,
            is_sold_out=avail <= 0,
        )
    # Productos sin filas de inventario quedan en 0
    for pid in product_ids:
        out.setdefault(
            pid,
            StockSummary(
                product_id=pid,
                total_quantity=0,
                total_reserved=0,
                total_available=0,
                is_sold_out=True,
            ),
        )
    return out


async def get_inventory_rows(
    db: AsyncSession, product_id: int
) -> list[Inventory]:
    stmt = select(Inventory).where(Inventory.product_id == product_id)
    return list((await db.execute(stmt)).scalars().all())


async def _get_or_create_row(
    db: AsyncSession, product_id: int, warehouse_id: int, *, lock: bool = False
) -> Inventory:
    stmt = select(Inventory).where(
        Inventory.product_id == product_id,
        Inventory.warehouse_id == warehouse_id,
    )
    if lock:
        stmt = stmt.with_for_update()
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        row = Inventory(
            product_id=product_id,
            warehouse_id=warehouse_id,
            quantity=0,
            reserved=0,
            min_stock=0,
        )
        db.add(row)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            # carrera: re-leer
            row = (
                await db.execute(
                    stmt.with_for_update() if lock else stmt
                )
            ).scalar_one()
    return row


async def adjust_stock(
    db: AsyncSession,
    *,
    product_id: int,
    warehouse_id: int,
    delta: int,
    user_id: int | None,
    notes: str | None = None,
    reference_type: str | None = None,
    reference_id: int | None = None,
) -> Inventory:
    """Ajuste manual o entrada/salida operativa. Registra movimiento auditable."""
    if delta == 0:
        raise InventoryError("delta no puede ser cero")

    row = await _get_or_create_row(db, product_id, warehouse_id, lock=True)
    new_qty = row.quantity + delta
    if new_qty < 0:
        raise InsufficientStock(
            f"Stock insuficiente en almacén {warehouse_id}: actual={row.quantity}, delta={delta}"
        )

    row.quantity = new_qty

    movement_type = MovementType.IN if delta > 0 else MovementType.OUT
    if reference_type:
        if reference_type == "ADJUSTMENT":
            movement_type = MovementType.ADJUSTMENT
        elif reference_type == "TRANSFER_OUT":
            movement_type = MovementType.TRANSFER_OUT
        elif reference_type == "TRANSFER_IN":
            movement_type = MovementType.TRANSFER_IN

    db.add(
        InventoryMovement(
            product_id=product_id,
            warehouse_id=warehouse_id,
            movement_type=movement_type,
            quantity=abs(delta),
            reference_type=reference_type,
            reference_id=reference_id,
            notes=notes,
            user_id=user_id,
        )
    )
    return row


async def reserve_stock(
    db: AsyncSession,
    *,
    product_id: int,
    warehouse_id: int,
    quantity: int,
    user_id: int | None,
    reference_type: str | None = None,
    reference_id: int | None = None,
) -> Inventory:
    """Reserva temporal sin descontar: bloquea unidades disponibles."""
    if quantity <= 0:
        raise InventoryError("quantity debe ser > 0")

    row = await _get_or_create_row(db, product_id, warehouse_id, lock=True)
    available = row.quantity - row.reserved
    if available < quantity:
        raise InsufficientStock(
            f"Sin stock disponible: solicitado={quantity}, disponible={available}"
        )

    row.reserved += quantity
    db.add(
        InventoryMovement(
            product_id=product_id,
            warehouse_id=warehouse_id,
            movement_type=MovementType.RESERVATION,
            quantity=quantity,
            reference_type=reference_type,
            reference_id=reference_id,
            user_id=user_id,
        )
    )
    return row


async def release_reservation(
    db: AsyncSession,
    *,
    product_id: int,
    warehouse_id: int,
    quantity: int,
    user_id: int | None,
    reference_type: str | None = None,
    reference_id: int | None = None,
) -> Inventory:
    """Libera unidades previamente reservadas (abandono / cancelación)."""
    if quantity <= 0:
        raise InventoryError("quantity debe ser > 0")

    row = await _get_or_create_row(db, product_id, warehouse_id, lock=True)
    if row.reserved < quantity:
        # No abortamos: corregimos a cero para no quedar en inconsistencia
        quantity = row.reserved

    if quantity == 0:
        return row

    row.reserved -= quantity
    db.add(
        InventoryMovement(
            product_id=product_id,
            warehouse_id=warehouse_id,
            movement_type=MovementType.RELEASE,
            quantity=quantity,
            reference_type=reference_type,
            reference_id=reference_id,
            user_id=user_id,
        )
    )
    return row


async def consume_reservation(
    db: AsyncSession,
    *,
    product_id: int,
    warehouse_id: int,
    quantity: int,
    user_id: int | None,
    reference_type: str | None = None,
    reference_id: int | None = None,
) -> Inventory:
    """Convierte reserva en salida definitiva (venta confirmada)."""
    if quantity <= 0:
        raise InventoryError("quantity debe ser > 0")

    row = await _get_or_create_row(db, product_id, warehouse_id, lock=True)
    if row.reserved < quantity or row.quantity < quantity:
        raise InsufficientStock(
            f"Inconsistencia al consumir reserva (qty={row.quantity}, reserved={row.reserved})"
        )

    row.reserved -= quantity
    row.quantity -= quantity
    db.add(
        InventoryMovement(
            product_id=product_id,
            warehouse_id=warehouse_id,
            movement_type=MovementType.OUT,
            quantity=quantity,
            reference_type=reference_type,
            reference_id=reference_id,
            user_id=user_id,
        )
    )
    return row


async def list_low_or_out_alerts(
    db: AsyncSession, *, seller_id: int | None = None
) -> list[dict]:
    """CUE-03 A1: productos con stock cero o por debajo del mínimo nacional.

    Si seller_id se especifica, solo lista productos de esa empresa.
    """
    stmt = (
        select(
            Product.id,
            Product.sku,
            Product.name,
            func.coalesce(func.sum(Inventory.quantity), 0).label("qty"),
            func.coalesce(func.sum(Inventory.min_stock), 0).label("min_total"),
        )
        .join(Inventory, Inventory.product_id == Product.id, isouter=True)
        .where(Product.is_active.is_(True))
        .group_by(Product.id, Product.sku, Product.name)
    )
    if seller_id is not None:
        stmt = stmt.where(Product.seller_id == seller_id)
    out: list[dict] = []
    for pid, sku, name, qty, min_total in (await db.execute(stmt)).all():
        qty = int(qty)
        min_total = int(min_total)
        if qty == 0:
            out.append(
                {
                    "product_id": pid,
                    "sku": sku,
                    "name": name,
                    "total_quantity": qty,
                    "min_stock_total": min_total,
                    "severity": "OUT_OF_STOCK",
                }
            )
        elif min_total > 0 and qty < min_total:
            out.append(
                {
                    "product_id": pid,
                    "sku": sku,
                    "name": name,
                    "total_quantity": qty,
                    "min_stock_total": min_total,
                    "severity": "LOW_STOCK",
                }
            )
    return out
