"""Servicio de traspasos interdepartamentales (CUE-04 / CU-INV-02).

Flujo principal:
    REQUESTED → PICKING → IN_TRANSIT → RECEIVED
                          ↓ A1 (merma)
                     REJECTED_MERMA / CANCELLED

Reglas:
- Crear traspaso reserva inmediatamente el stock en origen.
- Despachar (mark_in_transit): consume reserva en origen y registra TRANSFER_OUT.
- Recibir: suma a destino y registra TRANSFER_IN.
- Rechazar por merma: libera reserva, da de baja del inventario origen y notifica admin.
"""
from __future__ import annotations

import secrets
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.transfer import StockTransfer, StockTransferItem, TransferStatus
from app.models.user import User
from app.models.warehouse import Warehouse
from app.services.inventory import (
    InsufficientStock,
    InventoryError,
    adjust_stock,
    consume_reservation,
    release_reservation,
    reserve_stock,
)


class TransferError(Exception):
    pass


async def _next_transfer_number(db: AsyncSession) -> str:
    last = (
        await db.execute(select(StockTransfer.id).order_by(StockTransfer.id.desc()).limit(1))
    ).scalar_one_or_none()
    n = (last or 0) + 1
    return f"TR-{n:06d}"


async def create_transfer(
    db: AsyncSession,
    *,
    origin_warehouse_id: int,
    destination_warehouse_id: int,
    items: list[dict],  # [{product_id, quantity}]
    requested_by: User,
    notes: str | None = None,
) -> StockTransfer:
    if origin_warehouse_id == destination_warehouse_id:
        raise TransferError("Origen y destino no pueden ser el mismo almacén")
    if not items:
        raise TransferError("Debe incluir al menos un item")

    for wh_id in (origin_warehouse_id, destination_warehouse_id):
        wh = (
            await db.execute(select(Warehouse).where(Warehouse.id == wh_id))
        ).scalar_one_or_none()
        if wh is None:
            raise TransferError(f"Almacén {wh_id} no existe")

    transfer = StockTransfer(
        transfer_number=await _next_transfer_number(db),
        origin_warehouse_id=origin_warehouse_id,
        destination_warehouse_id=destination_warehouse_id,
        status=TransferStatus.REQUESTED,
        qr_token=secrets.token_urlsafe(24),
        requested_by=requested_by.id,
        notes=notes,
    )
    db.add(transfer)
    await db.flush()

    for it in items:
        pid = int(it["product_id"])
        qty = int(it["quantity"])
        if qty <= 0:
            raise TransferError("quantity debe ser > 0")
        db.add(
            StockTransferItem(
                transfer_id=transfer.id, product_id=pid, quantity=qty
            )
        )
        await reserve_stock(
            db,
            product_id=pid,
            warehouse_id=origin_warehouse_id,
            quantity=qty,
            user_id=requested_by.id,
            reference_type="TRANSFER",
            reference_id=transfer.id,
        )

    await db.commit()
    await db.refresh(transfer)
    return transfer


async def start_picking(
    db: AsyncSession, *, transfer_id: int, user: User
) -> StockTransfer:
    t = await _get(db, transfer_id)
    if t.status != TransferStatus.REQUESTED:
        raise TransferError(
            f"Sólo se puede iniciar picking desde REQUESTED (estado actual={t.status.value})"
        )
    t.status = TransferStatus.PICKING
    t.picked_by = user.id
    await db.commit()
    await db.refresh(t)
    return t


async def mark_in_transit(
    db: AsyncSession, *, transfer_id: int, user: User
) -> StockTransfer:
    """CUE-04 paso 4: descuenta del origen y emite Nota de Remisión."""
    t = await _get(db, transfer_id)
    if t.status not in (TransferStatus.PICKING, TransferStatus.REQUESTED):
        raise TransferError("La transferencia no está lista para despacho")

    for it in t.items:
        await consume_reservation(
            db,
            product_id=it.product_id,
            warehouse_id=t.origin_warehouse_id,
            quantity=it.quantity,
            user_id=user.id,
            reference_type="TRANSFER_OUT",
            reference_id=t.id,
        )

    t.status = TransferStatus.IN_TRANSIT
    t.dispatched_at = datetime.now(tz=UTC)
    await db.commit()
    await db.refresh(t)
    return t


async def receive_transfer(
    db: AsyncSession,
    *,
    transfer_id: int | None = None,
    qr_token: str | None = None,
    user: User,
) -> StockTransfer:
    """CUE-04 paso 6-7: destino escanea QR → suma stock al destino."""
    t = await _get(db, transfer_id, qr_token=qr_token)
    if t.status != TransferStatus.IN_TRANSIT:
        raise TransferError("La transferencia no está IN_TRANSIT")

    for it in t.items:
        try:
            await adjust_stock(
                db,
                product_id=it.product_id,
                warehouse_id=t.destination_warehouse_id,
                delta=it.quantity,
                user_id=user.id,
                reference_type="TRANSFER_IN",
                reference_id=t.id,
                notes=f"Recepción {t.transfer_number}",
            )
        except InventoryError as e:
            raise TransferError(str(e)) from e

    t.status = TransferStatus.RECEIVED
    t.received_by = user.id
    t.received_at = datetime.now(tz=UTC)
    await db.commit()
    await db.refresh(t)
    return t


async def reject_merma(
    db: AsyncSession, *, transfer_id: int, user: User, reason: str | None
) -> StockTransfer:
    """CUE-04 A1: Producto Defectuoso → da de baja del origen y cancela."""
    t = await _get(db, transfer_id)
    if t.status not in (TransferStatus.REQUESTED, TransferStatus.PICKING):
        raise TransferError("Solo se rechaza por merma antes del despacho")

    for it in t.items:
        # libera reserva
        await release_reservation(
            db,
            product_id=it.product_id,
            warehouse_id=t.origin_warehouse_id,
            quantity=it.quantity,
            user_id=user.id,
            reference_type="TRANSFER_MERMA",
            reference_id=t.id,
        )
        # da de baja del inventario (la mercadería está dañada)
        try:
            await adjust_stock(
                db,
                product_id=it.product_id,
                warehouse_id=t.origin_warehouse_id,
                delta=-it.quantity,
                user_id=user.id,
                reference_type="ADJUSTMENT",
                reference_id=t.id,
                notes=f"Merma traspaso {t.transfer_number}: {reason or 'sin detalle'}",
            )
        except InsufficientStock:
            # si no había stock suficiente, no detenemos: el daño sigue
            pass

    t.status = TransferStatus.REJECTED_MERMA
    if reason:
        t.notes = (t.notes or "") + f" | MERMA: {reason}"
    await db.commit()
    await db.refresh(t)
    return t


async def cancel_transfer(
    db: AsyncSession, *, transfer_id: int, user: User, reason: str | None
) -> StockTransfer:
    t = await _get(db, transfer_id)
    if t.status not in (TransferStatus.REQUESTED, TransferStatus.PICKING):
        raise TransferError("Solo se cancelan traspasos no despachados")

    for it in t.items:
        await release_reservation(
            db,
            product_id=it.product_id,
            warehouse_id=t.origin_warehouse_id,
            quantity=it.quantity,
            user_id=user.id,
            reference_type="TRANSFER_CANCEL",
            reference_id=t.id,
        )

    t.status = TransferStatus.CANCELLED
    if reason:
        t.notes = (t.notes or "") + f" | CANCEL: {reason}"
    await db.commit()
    await db.refresh(t)
    return t


# ---------- helpers ----------
async def _get(
    db: AsyncSession, transfer_id: int | None = None, qr_token: str | None = None
) -> StockTransfer:
    if transfer_id is None and qr_token is None:
        raise TransferError("Debe indicar transfer_id o qr_token")

    stmt = select(StockTransfer).options(selectinload(StockTransfer.items))
    if transfer_id is not None:
        stmt = stmt.where(StockTransfer.id == transfer_id)
    else:
        stmt = stmt.where(StockTransfer.qr_token == qr_token)
    t = (await db.execute(stmt)).scalar_one_or_none()
    if t is None:
        raise TransferError("Transferencia no encontrada")
    return t
