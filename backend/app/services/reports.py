"""Reportes inteligentes (CUE-06).

Consultas SQL agregadas: ventas por sucursal, ventas por canal, movimientos
de almacén, evolución diaria. Devuelven tablas dinámicas listas para
renderizar en el dashboard.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.inventory import Inventory, InventoryMovement
from app.models.invoice import Invoice, InvoiceStatus
from app.models.order import Order, OrderItem, OrderStatus, SalesChannel
from app.models.product import Product
from app.models.warehouse import Warehouse


async def dashboard_summary(db: AsyncSession) -> dict:
    """KPIs principales del Dashboard."""
    total_orders = (
        await db.execute(select(func.count(Order.id)))
    ).scalar_one()
    paid_orders = (
        await db.execute(
            select(func.count(Order.id)).where(
                Order.status.in_([OrderStatus.PAID, OrderStatus.CONFIRMED, OrderStatus.SHIPPED, OrderStatus.DELIVERED])
            )
        )
    ).scalar_one()
    revenue = (
        await db.execute(
            select(func.coalesce(func.sum(Order.total), 0)).where(
                Order.status.in_([OrderStatus.PAID, OrderStatus.CONFIRMED, OrderStatus.SHIPPED, OrderStatus.DELIVERED])
            )
        )
    ).scalar_one()
    pending_b2b = (
        await db.execute(
            select(func.count(Order.id)).where(Order.status == OrderStatus.PENDING_APPROVAL)
        )
    ).scalar_one()
    invoices_authorized = (
        await db.execute(
            select(func.count(Invoice.id)).where(Invoice.status == InvoiceStatus.AUTHORIZED)
        )
    ).scalar_one()
    invoices_pending = (
        await db.execute(
            select(func.count(Invoice.id)).where(Invoice.status == InvoiceStatus.PENDING)
        )
    ).scalar_one()
    customers = (
        await db.execute(select(func.count(Customer.id)))
    ).scalar_one()
    products_active = (
        await db.execute(
            select(func.count(Product.id)).where(Product.is_active.is_(True))
        )
    ).scalar_one()
    stock_total = (
        await db.execute(select(func.coalesce(func.sum(Inventory.quantity), 0)))
    ).scalar_one()

    return {
        "orders": {
            "total": int(total_orders),
            "paid": int(paid_orders),
            "pending_b2b": int(pending_b2b),
        },
        "revenue_bob": float(revenue or 0),
        "invoices": {
            "authorized": int(invoices_authorized),
            "in_contingency": int(invoices_pending),
        },
        "customers": int(customers),
        "products_active": int(products_active),
        "stock_units": int(stock_total),
    }


async def sales_by_warehouse(
    db: AsyncSession, *, date_from: datetime | None, date_to: datetime | None
) -> list[dict]:
    stmt = (
        select(
            Warehouse.id,
            Warehouse.code,
            Warehouse.city,
            func.coalesce(func.sum(OrderItem.subtotal), 0).label("revenue"),
            func.coalesce(func.sum(OrderItem.quantity), 0).label("units"),
        )
        .join(OrderItem, OrderItem.warehouse_id == Warehouse.id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Order.status.in_(
                [OrderStatus.PAID, OrderStatus.CONFIRMED, OrderStatus.SHIPPED, OrderStatus.DELIVERED]
            )
        )
        .group_by(Warehouse.id, Warehouse.code, Warehouse.city)
        .order_by(func.sum(OrderItem.subtotal).desc())
    )
    if date_from:
        stmt = stmt.where(Order.created_at >= date_from)
    if date_to:
        stmt = stmt.where(Order.created_at <= date_to)

    rows = (await db.execute(stmt)).all()
    return [
        {
            "warehouse_id": r.id,
            "warehouse_code": r.code,
            "city": r.city,
            "units": int(r.units),
            "revenue_bob": float(r.revenue),
        }
        for r in rows
    ]


async def sales_by_channel(
    db: AsyncSession, *, date_from: datetime | None, date_to: datetime | None
) -> list[dict]:
    stmt = (
        select(
            Order.channel,
            func.count(Order.id).label("orders"),
            func.coalesce(func.sum(Order.total), 0).label("revenue"),
        )
        .where(
            Order.status.in_(
                [OrderStatus.PAID, OrderStatus.CONFIRMED, OrderStatus.SHIPPED, OrderStatus.DELIVERED]
            )
        )
        .group_by(Order.channel)
    )
    if date_from:
        stmt = stmt.where(Order.created_at >= date_from)
    if date_to:
        stmt = stmt.where(Order.created_at <= date_to)

    rows = (await db.execute(stmt)).all()
    return [
        {
            "channel": r.channel.value if hasattr(r.channel, "value") else str(r.channel),
            "orders": int(r.orders),
            "revenue_bob": float(r.revenue),
        }
        for r in rows
    ]


async def daily_sales(
    db: AsyncSession, *, date_from: datetime | None, date_to: datetime | None
) -> list[dict]:
    day = func.date_trunc("day", Order.created_at).label("day")
    stmt = (
        select(
            day,
            func.count(Order.id).label("orders"),
            func.coalesce(func.sum(Order.total), 0).label("revenue"),
        )
        .where(
            Order.status.in_(
                [OrderStatus.PAID, OrderStatus.CONFIRMED, OrderStatus.SHIPPED, OrderStatus.DELIVERED]
            )
        )
        .group_by(day)
        .order_by(day)
    )
    if date_from:
        stmt = stmt.where(Order.created_at >= date_from)
    if date_to:
        stmt = stmt.where(Order.created_at <= date_to)

    rows = (await db.execute(stmt)).all()
    return [
        {
            "day": r.day.date().isoformat() if r.day else None,
            "orders": int(r.orders),
            "revenue_bob": float(r.revenue),
        }
        for r in rows
    ]


async def warehouse_movements_report(
    db: AsyncSession,
    *,
    warehouse_id: int | None,
    date_from: datetime | None,
    date_to: datetime | None,
) -> list[dict]:
    stmt = (
        select(
            InventoryMovement.warehouse_id,
            InventoryMovement.movement_type,
            func.count(InventoryMovement.id).label("ops"),
            func.coalesce(func.sum(InventoryMovement.quantity), 0).label("units"),
        )
        .group_by(InventoryMovement.warehouse_id, InventoryMovement.movement_type)
        .order_by(InventoryMovement.warehouse_id)
    )
    if warehouse_id:
        stmt = stmt.where(InventoryMovement.warehouse_id == warehouse_id)
    if date_from:
        stmt = stmt.where(InventoryMovement.created_at >= date_from)
    if date_to:
        stmt = stmt.where(InventoryMovement.created_at <= date_to)

    rows = (await db.execute(stmt)).all()
    return [
        {
            "warehouse_id": r.warehouse_id,
            "movement_type": r.movement_type.value if hasattr(r.movement_type, "value") else str(r.movement_type),
            "operations": int(r.ops),
            "units": int(r.units),
        }
        for r in rows
    ]


async def top_products(
    db: AsyncSession,
    *,
    date_from: datetime | None,
    date_to: datetime | None,
    limit: int = 10,
) -> list[dict]:
    stmt = (
        select(
            Product.id,
            Product.sku,
            Product.name,
            func.sum(OrderItem.quantity).label("units"),
            func.sum(OrderItem.subtotal).label("revenue"),
        )
        .join(OrderItem, OrderItem.product_id == Product.id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Order.status.in_(
                [OrderStatus.PAID, OrderStatus.CONFIRMED, OrderStatus.SHIPPED, OrderStatus.DELIVERED]
            )
        )
        .group_by(Product.id, Product.sku, Product.name)
        .order_by(func.sum(OrderItem.subtotal).desc())
        .limit(limit)
    )
    if date_from:
        stmt = stmt.where(Order.created_at >= date_from)
    if date_to:
        stmt = stmt.where(Order.created_at <= date_to)

    rows = (await db.execute(stmt)).all()
    return [
        {
            "product_id": r.id,
            "sku": r.sku,
            "name": r.name,
            "units": int(r.units or 0),
            "revenue_bob": float(r.revenue or 0),
        }
        for r in rows
    ]


def to_csv(rows: list[dict]) -> str:
    if not rows:
        return ""
    headers = list(rows[0].keys())
    lines = [",".join(headers)]
    for r in rows:
        lines.append(
            ",".join(
                str(r.get(h, "")).replace(",", ";") if r.get(h) is not None else ""
                for h in headers
            )
        )
    return "\n".join(lines) + "\n"
