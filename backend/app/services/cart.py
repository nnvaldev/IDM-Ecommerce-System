"""Servicio de carrito + compra (CUE-01 / CUE-02).

Responsabilidades:
- add/remove items con reserva temporal de stock.
- selección automática de almacén (greedy: prioriza la sucursal con más stock
  o la de la ciudad destino del cliente cuando esté indicada).
- checkout: cálculo total + envío, llamada a pasarela mock o a línea de
  crédito, persistencia de Order/OrderItem, conversión de reservas a salida.
- liberación de reservas al limpiar / abandonar.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.cart import Cart, CartItem
from app.models.customer import CreditLine, Customer, CustomerType
from app.models.inventory import Inventory
from app.models.order import (
    Order,
    OrderItem,
    OrderStatus,
    PaymentMethod,
    SalesChannel,
)
from app.models.payment import Payment, PaymentStatus
from app.models.product import Product
from app.models.user import User
from app.models.warehouse import Warehouse
from app.services.inventory import (
    InsufficientStock,
    consume_reservation,
    release_reservation,
    reserve_stock,
)
from app.services.payment_gateway import charge
from app.services.pricing import shipping_cost, unit_price_for

CART_TTL = timedelta(minutes=15)  # CUE-01 A1: abandono >15min libera


class CartError(Exception):
    pass


# ---------- helpers ----------
async def _get_customer(db: AsyncSession, user: User) -> Customer:
    cust = (
        await db.execute(select(Customer).where(Customer.user_id == user.id))
    ).scalar_one_or_none()
    if cust is None:
        # autocreación de Customer B2C para usuarios que solo tenían User
        cust = Customer(
            user_id=user.id,
            customer_type=CustomerType.B2C,
            business_name=user.full_name,
        )
        db.add(cust)
        await db.flush()
    return cust


async def _get_or_create_cart(db: AsyncSession, user: User) -> Cart:
    cart = (
        await db.execute(
            select(Cart).options(selectinload(Cart.items)).where(Cart.user_id == user.id)
        )
    ).scalar_one_or_none()
    if cart is None:
        cart = Cart(user_id=user.id, expires_at=datetime.now(tz=UTC) + CART_TTL)
        db.add(cart)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            cart = (
                await db.execute(
                    select(Cart).options(selectinload(Cart.items)).where(Cart.user_id == user.id)
                )
            ).scalar_one()
    return cart


def _is_expired(cart: Cart) -> bool:
    return cart.expires_at is not None and cart.expires_at < datetime.now(tz=UTC)


def _refresh_ttl(cart: Cart) -> None:
    cart.expires_at = datetime.now(tz=UTC) + CART_TTL


async def _pick_warehouse(
    db: AsyncSession, product_id: int, qty: int, preferred_city: str | None
) -> tuple[Warehouse, Inventory]:
    """Selecciona almacén: ciudad preferida si tiene stock, si no la fila con más disponible."""
    rows = (
        await db.execute(
            select(Inventory, Warehouse)
            .join(Warehouse, Warehouse.id == Inventory.warehouse_id)
            .where(Inventory.product_id == product_id, Warehouse.is_active.is_(True))
        )
    ).all()
    candidates = [(inv, wh) for inv, wh in rows if (inv.quantity - inv.reserved) >= qty]
    if not candidates:
        raise InsufficientStock(
            f"Sin stock suficiente en ninguna sucursal para producto {product_id}"
        )

    if preferred_city:
        for inv, wh in candidates:
            if wh.city.upper() == preferred_city.upper():
                return wh, inv

    # mayor disponibilidad primero
    candidates.sort(key=lambda t: t[0].quantity - t[0].reserved, reverse=True)
    inv, wh = candidates[0]
    return wh, inv


# ---------- API service ----------
async def get_cart(db: AsyncSession, user: User) -> Cart:
    cart = await _get_or_create_cart(db, user)
    if _is_expired(cart):
        await _release_all_items(db, cart, user)
        await db.flush()
    return cart


async def add_item(
    db: AsyncSession,
    user: User,
    *,
    product_id: int,
    quantity: int,
    preferred_city: str | None,
    warehouse_id: int | None = None,
) -> CartItem:
    if quantity <= 0:
        raise CartError("quantity debe ser > 0")

    customer = await _get_customer(db, user)
    cart = await _get_or_create_cart(db, user)

    if _is_expired(cart):
        await _release_all_items(db, cart, user)

    product = (
        await db.execute(select(Product).where(Product.id == product_id))
    ).scalar_one_or_none()
    if product is None or not product.is_active:
        raise CartError("Producto no encontrado o inactivo")

    # Single-seller cart: si ya hay items, deben ser del mismo seller.
    existing_items = (
        await db.execute(
            select(CartItem)
            .join(Product, Product.id == CartItem.product_id)
            .where(CartItem.cart_id == cart.id)
            .limit(1)
        )
    ).all()
    if existing_items:
        first_item = existing_items[0][0]
        existing_product = (
            await db.execute(select(Product).where(Product.id == first_item.product_id))
        ).scalar_one()
        if existing_product.seller_id != product.seller_id:
            raise CartError(
                "El carrito solo puede contener productos de una misma empresa. "
                "Vacía el carrito antes de agregar productos de otra empresa."
            )

    if warehouse_id:
        wh = (
            await db.execute(select(Warehouse).where(Warehouse.id == warehouse_id))
        ).scalar_one_or_none()
        if wh is None:
            raise CartError("Almacén no válido")
    else:
        wh, _ = await _pick_warehouse(db, product_id, quantity, preferred_city)

    await reserve_stock(
        db,
        product_id=product_id,
        warehouse_id=wh.id,
        quantity=quantity,
        user_id=user.id,
        reference_type="CART",
        reference_id=cart.id,
    )

    existing = (
        await db.execute(
            select(CartItem).where(
                CartItem.cart_id == cart.id,
                CartItem.product_id == product_id,
                CartItem.warehouse_id == wh.id,
            )
        )
    ).scalar_one_or_none()

    unit_price = unit_price_for(product, customer.customer_type)
    if existing:
        existing.quantity += quantity
        existing.unit_price = unit_price
        item = existing
    else:
        item = CartItem(
            cart_id=cart.id,
            product_id=product_id,
            warehouse_id=wh.id,
            quantity=quantity,
            unit_price=unit_price,
            reserved_at=datetime.now(tz=UTC),
        )
        db.add(item)

    _refresh_ttl(cart)
    await db.commit()
    await db.refresh(item)
    return item


async def remove_item(db: AsyncSession, user: User, item_id: int) -> None:
    cart = await _get_or_create_cart(db, user)
    item = (
        await db.execute(
            select(CartItem).where(CartItem.id == item_id, CartItem.cart_id == cart.id)
        )
    ).scalar_one_or_none()
    if item is None:
        raise CartError("Item no encontrado")

    await release_reservation(
        db,
        product_id=item.product_id,
        warehouse_id=item.warehouse_id,
        quantity=item.quantity,
        user_id=user.id,
        reference_type="CART",
        reference_id=cart.id,
    )
    await db.delete(item)
    await db.commit()


async def _release_all_items(db: AsyncSession, cart: Cart, user: User) -> None:
    items = list(cart.items)
    for it in items:
        await release_reservation(
            db,
            product_id=it.product_id,
            warehouse_id=it.warehouse_id,
            quantity=it.quantity,
            user_id=user.id,
            reference_type="CART",
            reference_id=cart.id,
        )
        await db.delete(it)


async def clear_cart(db: AsyncSession, user: User) -> None:
    cart = await _get_or_create_cart(db, user)
    await _release_all_items(db, cart, user)
    await db.commit()


async def cleanup_expired(db: AsyncSession) -> int:
    """Job barredor: libera reservas de carritos expirados.

    Retorna cantidad de carritos liberados.
    """
    now = datetime.now(tz=UTC)
    expired = (
        await db.execute(
            select(Cart)
            .options(selectinload(Cart.items).selectinload(CartItem.product))
            .where(Cart.expires_at.is_not(None), Cart.expires_at < now)
        )
    ).scalars().all()
    count = 0
    for cart in expired:
        if not cart.items:
            continue
        # No tenemos User cargado, usamos cart.user_id
        for it in list(cart.items):
            await release_reservation(
                db,
                product_id=it.product_id,
                warehouse_id=it.warehouse_id,
                quantity=it.quantity,
                user_id=cart.user_id,
                reference_type="CART_EXPIRED",
                reference_id=cart.id,
            )
            await db.delete(it)
        count += 1
    await db.commit()
    return count


# ---------- Checkout ----------
async def _next_order_number(db: AsyncSession) -> str:
    last = (
        await db.execute(select(Order.id).order_by(Order.id.desc()).limit(1))
    ).scalar_one_or_none()
    n = (last or 0) + 1
    return f"ORD-{n:06d}"


async def checkout_b2c(
    db: AsyncSession,
    user: User,
    *,
    destination_city: str,
    payment_method: PaymentMethod,
    payment_reference: str = "",
) -> Order:
    """CUE-01: cierra el carrito B2C, cobra vía pasarela y crea la orden."""
    cart = await _get_or_create_cart(db, user)
    if _is_expired(cart):
        await _release_all_items(db, cart, user)
        await db.commit()
        raise CartError("Carrito expirado, por favor vuelva a agregar productos")
    if not cart.items:
        raise CartError("Carrito vacío")

    customer = await _get_customer(db, user)

    subtotal = Decimal("0.00")
    items_snapshot: list[CartItem] = list(cart.items)
    for it in items_snapshot:
        subtotal += (it.unit_price * it.quantity).quantize(Decimal("0.01"))

    ship = shipping_cost(destination_city)
    # Asumimos IVA 13% incluido en base_price (típico Bolivia); reportamos como subtotal+envío
    tax = (subtotal * Decimal("0.13") / Decimal("1.13")).quantize(Decimal("0.01"))
    total = (subtotal + ship).quantize(Decimal("0.01"))

    if payment_method == PaymentMethod.CREDIT:
        raise CartError("B2C no soporta pago a crédito; use B2B")

    pay_ref = payment_reference or f"USER-{user.id}-CART-{cart.id}"
    result = charge(amount=total, method=payment_method.value, reference=pay_ref)
    if not result.approved:
        # CUE-01 A2: cancelar y liberar
        await _release_all_items(db, cart, user)
        await db.commit()
        raise CartError(result.message)

    # Resolver seller_id desde cualquier producto del carrito (cart es single-seller).
    first_product = (
        await db.execute(select(Product).where(Product.id == items_snapshot[0].product_id))
    ).scalar_one()
    seller_id = first_product.seller_id

    order = Order(
        order_number=await _next_order_number(db),
        seller_id=seller_id,
        customer_id=customer.id,
        status=OrderStatus.PAID,
        channel=SalesChannel.WEB,
        payment_method=payment_method,
        subtotal=subtotal,
        tax=tax,
        total=total,
        currency="BOB",
        notes=f"Envio a {destination_city}",
        created_by=user.id,
    )
    db.add(order)
    await db.flush()

    for it in items_snapshot:
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=it.product_id,
                warehouse_id=it.warehouse_id,
                quantity=it.quantity,
                unit_price=it.unit_price,
                subtotal=(it.unit_price * it.quantity).quantize(Decimal("0.01")),
            )
        )
        await consume_reservation(
            db,
            product_id=it.product_id,
            warehouse_id=it.warehouse_id,
            quantity=it.quantity,
            user_id=user.id,
            reference_type="ORDER",
            reference_id=order.id,
        )
        await db.delete(it)

    db.add(
        Payment(
            order_id=order.id,
            amount=total,
            method=payment_method,
            status=PaymentStatus.COMPLETED,
            qr_reference=result.token if payment_method == PaymentMethod.QR else None,
            gateway_reference=result.gateway_reference,
        )
    )

    cart.expires_at = None
    await db.commit()
    await db.refresh(order)
    return order


# ---------- B2B ----------
async def _get_credit_line(db: AsyncSession, customer: Customer) -> CreditLine:
    cl = (
        await db.execute(select(CreditLine).where(CreditLine.customer_id == customer.id))
    ).scalar_one_or_none()
    if cl is None or not cl.is_active:
        raise CartError("El cliente no tiene línea de crédito activa")
    return cl


async def checkout_b2b_credit(
    db: AsyncSession,
    user: User,
    *,
    destination_city: str,
) -> Order:
    """CUE-02 paso 1-5: cliente B2B confirma compra a crédito.

    - Valida saldo: si crédito insuficiente, A1 → cancela y libera reservas.
    - Si OK: crea Order en PENDING_APPROVAL, queda esperando al Ejecutivo
      de Ventas (CUE-02 paso 6-7 los maneja approve_b2b_order).
    """
    cart = await _get_or_create_cart(db, user)
    if _is_expired(cart):
        await _release_all_items(db, cart, user)
        await db.commit()
        raise CartError("Carrito expirado")
    if not cart.items:
        raise CartError("Carrito vacío")

    customer = await _get_customer(db, user)
    if customer.customer_type != CustomerType.B2B:
        raise CartError("Esta operación está reservada a clientes B2B")

    credit = await _get_credit_line(db, customer)

    subtotal = Decimal("0.00")
    items_snapshot: list[CartItem] = list(cart.items)
    for it in items_snapshot:
        subtotal += (it.unit_price * it.quantity).quantize(Decimal("0.01"))
    ship = shipping_cost(destination_city)
    total = (subtotal + ship).quantize(Decimal("0.01"))
    tax = (subtotal * Decimal("0.13") / Decimal("1.13")).quantize(Decimal("0.01"))

    available_credit = credit.limit_amount - credit.balance
    if total > available_credit:
        # CUE-02 A1: bloquea pero NO libera reservas (cliente puede reducir
        # el carrito y volver a intentar).
        raise CartError(
            f"Crédito Insuficiente. Saldo disponible: Bs. {available_credit:.2f}. "
            "Reduzca el volumen del pedido o solicite una ampliación."
        )

    first_product = (
        await db.execute(select(Product).where(Product.id == items_snapshot[0].product_id))
    ).scalar_one()
    seller_id = first_product.seller_id

    order = Order(
        order_number=await _next_order_number(db),
        seller_id=seller_id,
        customer_id=customer.id,
        status=OrderStatus.PENDING_APPROVAL,
        channel=SalesChannel.B2B_PORTAL,
        payment_method=PaymentMethod.CREDIT,
        subtotal=subtotal,
        tax=tax,
        total=total,
        currency="BOB",
        notes=f"Despacho a {destination_city}",
        created_by=user.id,
    )
    db.add(order)
    await db.flush()

    for it in items_snapshot:
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=it.product_id,
                warehouse_id=it.warehouse_id,
                quantity=it.quantity,
                unit_price=it.unit_price,
                subtotal=(it.unit_price * it.quantity).quantize(Decimal("0.01")),
            )
        )
        # NO consumimos reserva todavía: queda viva hasta que apruebe el ejecutivo.
        await db.delete(it)

    cart.expires_at = None
    await db.commit()
    await db.refresh(order)
    return order


async def approve_b2b_order(
    db: AsyncSession,
    *,
    order_id: int,
    sales_user: User,
) -> Order:
    """CUE-02 paso 6-7: Ejecutivo aprueba → descuenta crédito y stock."""
    order = (
        await db.execute(
            select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
        )
    ).scalar_one_or_none()
    if order is None:
        raise CartError("Orden no encontrada")
    if order.status != OrderStatus.PENDING_APPROVAL:
        raise CartError(f"La orden no está pendiente de aprobación (estado={order.status.value})")
    if order.payment_method != PaymentMethod.CREDIT:
        raise CartError("Solo órdenes a crédito pasan por este flujo")

    customer = (
        await db.execute(select(Customer).where(Customer.id == order.customer_id))
    ).scalar_one()
    credit = await _get_credit_line(db, customer)

    available = credit.limit_amount - credit.balance
    if order.total > available:
        raise CartError("El crédito disponible cambió: ya no alcanza para esta orden")

    for it in order.items:
        await consume_reservation(
            db,
            product_id=it.product_id,
            warehouse_id=it.warehouse_id,
            quantity=it.quantity,
            user_id=sales_user.id,
            reference_type="ORDER",
            reference_id=order.id,
        )

    credit.balance += order.total
    order.status = OrderStatus.CONFIRMED

    db.add(
        Payment(
            order_id=order.id,
            amount=order.total,
            method=PaymentMethod.CREDIT,
            status=PaymentStatus.COMPLETED,
            gateway_reference=f"CREDIT-{credit.id}",
        )
    )

    await db.commit()
    await db.refresh(order)
    return order


async def reject_b2b_order(
    db: AsyncSession,
    *,
    order_id: int,
    sales_user: User,
    reason: str | None = None,
) -> Order:
    order = (
        await db.execute(
            select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
        )
    ).scalar_one_or_none()
    if order is None:
        raise CartError("Orden no encontrada")
    if order.status != OrderStatus.PENDING_APPROVAL:
        raise CartError("Solo se rechazan órdenes pendientes")

    for it in order.items:
        await release_reservation(
            db,
            product_id=it.product_id,
            warehouse_id=it.warehouse_id,
            quantity=it.quantity,
            user_id=sales_user.id,
            reference_type="ORDER_REJECTED",
            reference_id=order.id,
        )

    order.status = OrderStatus.REJECTED
    if reason:
        order.notes = (order.notes or "") + f" | RECHAZO: {reason}"

    await db.commit()
    await db.refresh(order)
    return order
