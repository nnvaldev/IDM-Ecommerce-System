from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.customer import CreditLine, Customer
from app.models.invoice import Invoice
from app.models.order import Order, OrderItem, OrderStatus
from app.models.seller import Seller
from app.models.user import User, UserRole
from app.schemas.b2b import B2BApproveResponse, B2BRejectRequest, CheckoutB2BRequest
from app.schemas.cart import OrderInvoiceSummary, OrderItemPublic, OrderPublic
from app.services.cart import (
    CartError,
    approve_b2b_order,
    checkout_b2b_credit,
    reject_b2b_order,
)
from app.services.inventory import InsufficientStock
from app.services.siat import SIATError, emit_invoice

router = APIRouter(prefix="/b2b", tags=["b2b"])


async def _load_invoice_summary(
    db: AsyncSession, order_id: int
) -> OrderInvoiceSummary | None:
    inv = (
        await db.execute(select(Invoice).where(Invoice.order_id == order_id))
    ).scalar_one_or_none()
    if inv is None:
        return None
    return OrderInvoiceSummary.model_validate(inv)


async def _serialize_order(db: AsyncSession, order: Order) -> OrderPublic:
    items = (
        await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))
    ).scalars().all()
    invoice = await _load_invoice_summary(db, order.id)
    return OrderPublic(
        id=order.id,
        order_number=order.order_number,
        seller_id=order.seller_id,
        customer_id=order.customer_id,
        status=order.status,
        channel=order.channel,
        payment_method=order.payment_method,
        subtotal=order.subtotal,
        tax=order.tax,
        total=order.total,
        currency=order.currency,
        notes=order.notes,
        items=[OrderItemPublic.model_validate(i) for i in items],
        invoice=invoice,
    )


async def _ensure_can_manage_order(
    db: AsyncSession, user: User, order: Order
) -> None:
    """ADMIN/SALES manejan cualquier orden. SELLER sólo las de su empresa."""
    if user.role in (UserRole.ADMIN, UserRole.SALES):
        return
    if user.role == UserRole.SELLER:
        seller = (
            await db.execute(select(Seller).where(Seller.owner_user_id == user.id))
        ).scalar_one_or_none()
        if seller is None or order.seller_id != seller.id:
            raise HTTPException(status_code=403, detail="La orden no pertenece a tu empresa")
        return
    raise HTTPException(status_code=403, detail="Sin permiso")


@router.post(
    "/checkout-credit",
    response_model=OrderPublic,
    status_code=status.HTTP_201_CREATED,
)
async def checkout_credit(
    payload: CheckoutB2BRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.CLIENT_B2B)),
) -> OrderPublic:
    """CUE-02 paso 1-5: cliente B2B confirma compra a crédito (queda pendiente)."""
    try:
        order = await checkout_b2b_credit(
            db, user, destination_city=payload.destination_city
        )
    except CartError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except InsufficientStock as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return await _serialize_order(db, order)


@router.get("/orders/pending", response_model=list[OrderPublic])
async def list_pending(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.SALES, UserRole.ADMIN, UserRole.SELLER)),
) -> list[OrderPublic]:
    stmt = (
        select(Order)
        .where(Order.status == OrderStatus.PENDING_APPROVAL)
        .order_by(Order.id)
    )
    if user.role == UserRole.SELLER:
        seller = (
            await db.execute(select(Seller).where(Seller.owner_user_id == user.id))
        ).scalar_one_or_none()
        if seller is None:
            return []
        stmt = stmt.where(Order.seller_id == seller.id)
    rows = (await db.execute(stmt)).scalars().all()
    return [await _serialize_order(db, o) for o in rows]


@router.post("/orders/{order_id}/approve", response_model=B2BApproveResponse)
async def approve(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.SALES, UserRole.ADMIN, UserRole.SELLER)),
) -> B2BApproveResponse:
    """CUE-02 paso 6-7: Aprobador descuenta crédito y stock."""
    order = (
        await db.execute(select(Order).where(Order.id == order_id))
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    await _ensure_can_manage_order(db, user, order)

    try:
        order = await approve_b2b_order(db, order_id=order_id, sales_user=user)
    except CartError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except InsufficientStock as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

    try:
        await emit_invoice(db, order_id=order.id)
    except SIATError:
        pass

    customer = (
        await db.execute(select(Customer).where(Customer.id == order.customer_id))
    ).scalar_one()
    credit = (
        await db.execute(select(CreditLine).where(CreditLine.customer_id == customer.id))
    ).scalar_one()

    return B2BApproveResponse(
        order=await _serialize_order(db, order),
        new_credit_balance=float(credit.balance),
        new_credit_available=float(credit.limit_amount - credit.balance),
    )


@router.post("/orders/{order_id}/reject", response_model=OrderPublic)
async def reject(
    order_id: int,
    payload: B2BRejectRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.SALES, UserRole.ADMIN, UserRole.SELLER)),
) -> OrderPublic:
    order = (
        await db.execute(select(Order).where(Order.id == order_id))
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    await _ensure_can_manage_order(db, user, order)

    try:
        order = await reject_b2b_order(
            db, order_id=order_id, sales_user=user, reason=payload.reason
        )
    except CartError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return await _serialize_order(db, order)


@router.get("/my-orders", response_model=list[OrderPublic])
async def my_orders(
    status_filter: OrderStatus | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.CLIENT_B2B)),
) -> list[OrderPublic]:
    customer = (
        await db.execute(
            select(Customer)
            .options(selectinload(Customer.orders))
            .where(Customer.user_id == user.id)
        )
    ).scalar_one_or_none()
    if customer is None:
        return []
    stmt = select(Order).where(Order.customer_id == customer.id).order_by(Order.id.desc())
    if status_filter is not None:
        stmt = stmt.where(Order.status == status_filter)
    rows = (await db.execute(stmt)).scalars().all()
    return [await _serialize_order(db, o) for o in rows]
