from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.cart import Cart, CartItem
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.user import User, UserRole
from app.models.warehouse import Warehouse
from app.schemas.cart import (
    CartAddRequest,
    CartItemPublic,
    CartPublic,
    CheckoutB2CRequest,
    OrderInvoiceSummary,
    OrderItemPublic,
    OrderPublic,
)
from app.services.cart import (
    CartError,
    add_item,
    checkout_b2c,
    cleanup_expired,
    clear_cart,
    get_cart,
    remove_item,
)
from app.services.inventory import InsufficientStock
from app.services.siat import SIATError, emit_invoice

router = APIRouter(prefix="/cart", tags=["cart"])


async def _load_invoice_summary(
    db: AsyncSession, order_id: int
) -> OrderInvoiceSummary | None:
    inv = (
        await db.execute(select(Invoice).where(Invoice.order_id == order_id))
    ).scalar_one_or_none()
    if inv is None:
        return None
    return OrderInvoiceSummary.model_validate(inv)


async def _try_auto_emit_invoice(db: AsyncSession, order_id: int) -> None:
    """Auto-emite factura tras checkout/aprobación; absorbe SIATError (queda PENDING)."""
    try:
        await emit_invoice(db, order_id=order_id)
    except SIATError:
        pass


async def _serialize_cart(db: AsyncSession, cart: Cart) -> CartPublic:
    items_full = (
        await db.execute(
            select(CartItem)
            .options(selectinload(CartItem.product), selectinload(CartItem.warehouse))
            .where(CartItem.cart_id == cart.id)
        )
    ).scalars().all()

    out_items: list[CartItemPublic] = []
    subtotal = Decimal("0.00")
    for it in items_full:
        line = (it.unit_price * it.quantity).quantize(Decimal("0.01"))
        subtotal += line
        out_items.append(
            CartItemPublic(
                id=it.id,
                product_id=it.product_id,
                product_name=it.product.name if it.product else None,
                sku=it.product.sku if it.product else None,
                warehouse_id=it.warehouse_id,
                warehouse_code=it.warehouse.code if it.warehouse else None,
                quantity=it.quantity,
                unit_price=it.unit_price,
                subtotal=line,
                reserved_at=it.reserved_at,
            )
        )
    return CartPublic(
        id=cart.id,
        user_id=cart.user_id,
        expires_at=cart.expires_at,
        items=out_items,
        subtotal=subtotal,
    )


@router.get("", response_model=CartPublic)
async def get_my_cart(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CartPublic:
    cart = await get_cart(db, user)
    await db.commit()
    return await _serialize_cart(db, cart)


@router.post("/items", response_model=CartPublic, status_code=status.HTTP_201_CREATED)
async def add(
    payload: CartAddRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CartPublic:
    try:
        await add_item(
            db,
            user,
            product_id=payload.product_id,
            quantity=payload.quantity,
            preferred_city=payload.preferred_city,
            warehouse_id=payload.warehouse_id,
        )
    except InsufficientStock as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except CartError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    cart = await get_cart(db, user)
    return await _serialize_cart(db, cart)


@router.delete("/items/{item_id}", response_model=CartPublic)
async def remove(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CartPublic:
    try:
        await remove_item(db, user, item_id)
    except CartError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    cart = await get_cart(db, user)
    return await _serialize_cart(db, cart)


@router.post("/clear", response_model=CartPublic)
async def clear(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CartPublic:
    await clear_cart(db, user)
    cart = await get_cart(db, user)
    return await _serialize_cart(db, cart)


@router.post("/checkout", response_model=OrderPublic, status_code=status.HTTP_201_CREATED)
async def checkout(
    payload: CheckoutB2CRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OrderPublic:
    try:
        order = await checkout_b2c(
            db,
            user,
            destination_city=payload.destination_city,
            payment_method=payload.payment_method,
            payment_reference=payload.payment_reference,
        )
    except CartError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except InsufficientStock as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

    await _try_auto_emit_invoice(db, order.id)

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


@router.post("/cleanup-expired")
async def cleanup(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
) -> dict[str, int]:
    """Job barredor: libera reservas de carritos expirados (CUE-01 A1)."""
    n = await cleanup_expired(db)
    return {"released_carts": n}


@router.get("/my-orders", response_model=list[OrderPublic])
async def my_orders(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[OrderPublic]:
    """Historial de órdenes del cliente autenticado (B2C o B2B)."""
    customer = (
        await db.execute(select(Customer).where(Customer.user_id == user.id))
    ).scalar_one_or_none()
    if customer is None:
        return []
    orders = (
        await db.execute(
            select(Order)
            .where(Order.customer_id == customer.id)
            .order_by(Order.id.desc())
        )
    ).scalars().all()

    out: list[OrderPublic] = []
    for o in orders:
        its = (
            await db.execute(select(OrderItem).where(OrderItem.order_id == o.id))
        ).scalars().all()
        invoice = await _load_invoice_summary(db, o.id)
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
                items=[OrderItemPublic.model_validate(i) for i in its],
                invoice=invoice,
            )
        )
    return out
