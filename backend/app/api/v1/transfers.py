from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.transfer import StockTransfer, StockTransferItem, TransferStatus
from app.models.user import User, UserRole
from app.schemas.transfer import (
    TransferCreateRequest,
    TransferItemPublic,
    TransferPublic,
    TransferReceiveRequest,
    TransferRejectRequest,
)
from app.services.inventory import InsufficientStock
from app.services.transfer import (
    TransferError,
    cancel_transfer,
    create_transfer,
    mark_in_transit,
    receive_transfer,
    reject_merma,
    start_picking,
)

router = APIRouter(prefix="/transfers", tags=["transfers"])
WAREHOUSE_ROLES = (UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER)


async def _serialize(db: AsyncSession, t: StockTransfer) -> TransferPublic:
    items = (
        await db.execute(
            select(StockTransferItem).where(StockTransferItem.transfer_id == t.id)
        )
    ).scalars().all()
    return TransferPublic(
        id=t.id,
        transfer_number=t.transfer_number,
        origin_warehouse_id=t.origin_warehouse_id,
        destination_warehouse_id=t.destination_warehouse_id,
        status=t.status,
        qr_token=t.qr_token,
        requested_by=t.requested_by,
        picked_by=t.picked_by,
        received_by=t.received_by,
        dispatched_at=t.dispatched_at,
        received_at=t.received_at,
        notes=t.notes,
        items=[TransferItemPublic.model_validate(i) for i in items],
    )


@router.get("", response_model=list[TransferPublic])
async def list_transfers(
    status_filter: TransferStatus | None = Query(default=None, alias="status"),
    warehouse_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*WAREHOUSE_ROLES, UserRole.SALES)),
) -> list[TransferPublic]:
    stmt = (
        select(StockTransfer)
        .options(selectinload(StockTransfer.items))
        .order_by(StockTransfer.id.desc())
    )
    if status_filter is not None:
        stmt = stmt.where(StockTransfer.status == status_filter)
    if warehouse_id is not None:
        stmt = stmt.where(
            (StockTransfer.origin_warehouse_id == warehouse_id)
            | (StockTransfer.destination_warehouse_id == warehouse_id)
        )
    rows = (await db.execute(stmt)).scalars().all()
    return [await _serialize(db, t) for t in rows]


@router.get("/{transfer_id}", response_model=TransferPublic)
async def get_transfer(
    transfer_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*WAREHOUSE_ROLES, UserRole.SALES)),
) -> TransferPublic:
    t = (
        await db.execute(
            select(StockTransfer)
            .options(selectinload(StockTransfer.items))
            .where(StockTransfer.id == transfer_id)
        )
    ).scalar_one_or_none()
    if t is None:
        raise HTTPException(status_code=404, detail="Traspaso no encontrado")
    return await _serialize(db, t)


@router.post("", response_model=TransferPublic, status_code=status.HTTP_201_CREATED)
async def create(
    payload: TransferCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(*WAREHOUSE_ROLES)),
) -> TransferPublic:
    try:
        t = await create_transfer(
            db,
            origin_warehouse_id=payload.origin_warehouse_id,
            destination_warehouse_id=payload.destination_warehouse_id,
            items=[i.model_dump() for i in payload.items],
            requested_by=user,
            notes=payload.notes,
        )
    except InsufficientStock as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except TransferError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return await _serialize(db, t)


@router.post("/{transfer_id}/start-picking", response_model=TransferPublic)
async def picking(
    transfer_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(*WAREHOUSE_ROLES)),
) -> TransferPublic:
    try:
        t = await start_picking(db, transfer_id=transfer_id, user=user)
    except TransferError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return await _serialize(db, t)


@router.post("/{transfer_id}/dispatch", response_model=TransferPublic)
async def dispatch(
    transfer_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(*WAREHOUSE_ROLES)),
) -> TransferPublic:
    """CUE-04 paso 4: marca como IN_TRANSIT y emite Nota de Remisión."""
    try:
        t = await mark_in_transit(db, transfer_id=transfer_id, user=user)
    except (TransferError, InsufficientStock) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return await _serialize(db, t)


@router.post("/{transfer_id}/receive", response_model=TransferPublic)
async def receive(
    transfer_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(*WAREHOUSE_ROLES)),
) -> TransferPublic:
    """CUE-04 paso 6-7: destino recibe (manual)."""
    try:
        t = await receive_transfer(db, transfer_id=transfer_id, user=user)
    except TransferError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return await _serialize(db, t)


@router.post("/scan-receive", response_model=TransferPublic)
async def receive_by_qr(
    payload: TransferReceiveRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(*WAREHOUSE_ROLES)),
) -> TransferPublic:
    """Recepción escaneando el QR de la Nota de Remisión."""
    if not payload.qr_token:
        raise HTTPException(status_code=400, detail="qr_token requerido")
    try:
        t = await receive_transfer(db, qr_token=payload.qr_token, user=user)
    except TransferError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return await _serialize(db, t)


@router.post("/{transfer_id}/reject-merma", response_model=TransferPublic)
async def merma(
    transfer_id: int,
    payload: TransferRejectRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(*WAREHOUSE_ROLES)),
) -> TransferPublic:
    try:
        t = await reject_merma(
            db, transfer_id=transfer_id, user=user, reason=payload.reason
        )
    except TransferError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return await _serialize(db, t)


@router.post("/{transfer_id}/cancel", response_model=TransferPublic)
async def cancel(
    transfer_id: int,
    payload: TransferRejectRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(*WAREHOUSE_ROLES)),
) -> TransferPublic:
    try:
        t = await cancel_transfer(
            db, transfer_id=transfer_id, user=user, reason=payload.reason
        )
    except TransferError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return await _serialize(db, t)
