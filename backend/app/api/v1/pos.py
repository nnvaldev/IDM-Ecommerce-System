"""POS de mostrador — CUE-03 Venta Rápida en Sucursal.

Endpoint para vendedores en sucursal: busca productos por SKU, registra la
venta presencial al contado, descuenta stock local y emite factura SIAT
en segundo plano (o contingencia si SIAT cae).
"""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.customer import Customer, CustomerType
from app.models.invoice import Invoice
from app.models.order import (
    Order,
    OrderItem,
    OrderStatus,
    PaymentMethod,
    SalesChannel,
)
from app.models.payment import Payment, PaymentStatus
from app.models.product import Product
from app.models.seller import Seller
from app.models.user import User, UserRole
from app.models.warehouse import Warehouse
from app.schemas.cart import OrderInvoiceSummary, OrderItemPublic
from app.schemas.pos import POSCheckoutRequest, POSReceiptResponse
from app.services.inventory import (
    InsufficientStock,
    InventoryError,
    adjust_stock,
)
from app.services.siat import SIATError, emit_invoice

router = APIRouter(prefix="/pos", tags=["pos"])


async def _next_order_number(db: AsyncSession) -> str:
    last = (
        await db.execute(select(Order.id).order_by(Order.id.desc()).limit(1))
    ).scalar_one_or_none()
    n = (last or 0) + 1
    return f"POS-{n:06d}"


async def _resolve_walkin_customer(db: AsyncSession, nit: str, name: str) -> Customer:
    """Busca/crea un Customer 'walk-in' para asociar el NIT al asiento contable.

    No requiere usuario en sistema: usamos tax_id como llave de búsqueda.
    """
    cust = (
        await db.execute(select(Customer).where(Customer.tax_id == nit))
    ).scalar_one_or_none()
    if cust is not None:
        return cust
    cust = Customer(
        user_id=None,
        customer_type=CustomerType.B2C,
        business_name=name,
        tax_id=nit,
    )
    db.add(cust)
    await db.flush()
    return cust


@router.post(
    "/checkout",
    response_model=POSReceiptResponse,
    status_code=status.HTTP_201_CREATED,
)
async def pos_checkout(
    payload: POSCheckoutRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(
        require_roles(
            UserRole.ADMIN,
            UserRole.SALES,
            UserRole.WAREHOUSE_MANAGER,
            UserRole.SELLER,
        )
    ),
) -> POSReceiptResponse:
    """CUE-03: cobra al contado en mostrador y emite factura SIAT directa."""
    if payload.payment_method not in (PaymentMethod.CASH, PaymentMethod.CARD):
        raise HTTPException(
            status_code=400,
            detail="POS solo admite pago CASH o CARD",
        )

    warehouse = (
        await db.execute(select(Warehouse).where(Warehouse.id == payload.warehouse_id))
    ).scalar_one_or_none()
    if warehouse is None:
        raise HTTPException(status_code=404, detail="Almacén no encontrado")
    if not warehouse.is_active:
        raise HTTPException(status_code=400, detail="Almacén inactivo")

    # SELLER solo puede operar en sus propios almacenes.
    if user.role == UserRole.SELLER:
        my_seller = (
            await db.execute(select(Seller).where(Seller.owner_user_id == user.id))
        ).scalar_one_or_none()
        if my_seller is None or warehouse.seller_id != my_seller.id:
            raise HTTPException(status_code=403, detail="Almacén no pertenece a tu empresa")

    # Resolver SKUs → productos y validar stock local.
    skus = [it.sku for it in payload.items]
    products = list(
        (
            await db.execute(select(Product).where(Product.sku.in_(skus)))
        ).scalars().all()
    )
    products_by_sku = {p.sku: p for p in products}
    missing = [s for s in skus if s not in products_by_sku]
    if missing:
        raise HTTPException(status_code=404, detail=f"SKU no encontrado: {', '.join(missing)}")

    # Todos los productos deben ser del seller del almacén (consistencia).
    seller_id = warehouse.seller_id
    cross_seller = [p.sku for p in products if p.seller_id != seller_id]
    if cross_seller:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Estos SKUs no pertenecen a la empresa del almacén: {', '.join(cross_seller)}. "
                "El POS sólo vende productos de la misma empresa que el almacén."
            ),
        )

    # Calcular totales
    subtotal = Decimal("0.00")
    line_items: list[tuple[Product, int, Decimal, Decimal]] = []
    for it in payload.items:
        p = products_by_sku[it.sku]
        unit = p.base_price
        line_sub = (unit * it.quantity).quantize(Decimal("0.01"))
        subtotal += line_sub
        line_items.append((p, it.quantity, unit, line_sub))

    # IVA Bolivia 13% incluido en precio base
    tax = (subtotal * Decimal("0.13") / Decimal("1.13")).quantize(Decimal("0.01"))
    total = subtotal  # POS: no hay envío

    customer = await _resolve_walkin_customer(
        db, payload.customer_nit, payload.customer_name
    )

    order = Order(
        order_number=await _next_order_number(db),
        seller_id=seller_id,
        customer_id=customer.id,
        status=OrderStatus.PAID,
        channel=SalesChannel.POS,
        payment_method=payload.payment_method,
        subtotal=subtotal,
        tax=tax,
        total=total,
        currency="BOB",
        notes=payload.notes or f"Venta mostrador {warehouse.code}",
        created_by=user.id,
    )
    db.add(order)
    await db.flush()

    # Descontar stock local + crear items
    for product, qty, unit, line_sub in line_items:
        try:
            await adjust_stock(
                db,
                product_id=product.id,
                warehouse_id=warehouse.id,
                delta=-qty,
                user_id=user.id,
                notes=f"Venta POS {order.order_number}",
                reference_type="ORDER",
                reference_id=order.id,
            )
        except InsufficientStock as e:
            # El rollback expira los objetos de la sesión: leerlos después
            # dispararía una carga perezosa fuera del contexto async (500).
            detail = f"Stock insuficiente en {warehouse.code} para SKU {product.sku}"
            await db.rollback()
            raise HTTPException(status_code=409, detail=detail) from e
        except InventoryError as e:
            await db.rollback()
            raise HTTPException(status_code=400, detail=str(e)) from e

        db.add(
            OrderItem(
                order_id=order.id,
                product_id=product.id,
                warehouse_id=warehouse.id,
                quantity=qty,
                unit_price=unit,
                subtotal=line_sub,
            )
        )

    db.add(
        Payment(
            order_id=order.id,
            amount=total,
            method=payload.payment_method,
            status=PaymentStatus.COMPLETED,
            gateway_reference=f"POS-{warehouse.code}-{order.order_number}",
        )
    )

    await db.commit()
    await db.refresh(order)

    # Emisión SIAT inmediata (con fallback a contingencia)
    try:
        await emit_invoice(db, order_id=order.id)
    except SIATError:
        pass

    # Re-leer items e invoice
    items = list(
        (
            await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))
        ).scalars().all()
    )
    inv = (
        await db.execute(select(Invoice).where(Invoice.order_id == order.id))
    ).scalar_one_or_none()

    return POSReceiptResponse(
        order_id=order.id,
        order_number=order.order_number,
        seller_id=order.seller_id,
        subtotal=order.subtotal,
        tax=order.tax,
        total=order.total,
        items=[OrderItemPublic.model_validate(i) for i in items],
        invoice=OrderInvoiceSummary.model_validate(inv) if inv else None,
    )
