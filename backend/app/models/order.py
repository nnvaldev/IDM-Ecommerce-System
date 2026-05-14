import enum
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models._mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.invoice import Invoice, RemissionNote
    from app.models.payment import Payment
    from app.models.product import Product
    from app.models.warehouse import Warehouse


class OrderStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"  # B2B en espera del Ejecutivo de Ventas
    CONFIRMED = "CONFIRMED"
    PAID = "PAID"
    SHIPPED = "SHIPPED"
    DELIVERED = "DELIVERED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class SalesChannel(str, enum.Enum):
    WEB = "WEB"
    B2B_PORTAL = "B2B_PORTAL"
    POS = "POS"


class PaymentMethod(str, enum.Enum):
    QR = "QR"
    CASH = "CASH"
    TRANSFER = "TRANSFER"
    CREDIT = "CREDIT"
    CARD = "CARD"


class Order(Base, TimestampMixin):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    seller_id: Mapped[int] = mapped_column(
        ForeignKey("sellers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status"),
        nullable=False,
        default=OrderStatus.DRAFT,
        index=True,
    )
    channel: Mapped[SalesChannel] = mapped_column(
        Enum(SalesChannel, name="sales_channel"), nullable=False
    )
    payment_method: Mapped[PaymentMethod | None] = mapped_column(
        Enum(PaymentMethod, name="payment_method")
    )
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    tax: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="BOB", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    customer: Mapped["Customer"] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )
    invoice: Mapped["Invoice | None"] = relationship(back_populates="order", uselist=False)
    remission_note: Mapped["RemissionNote | None"] = relationship(
        back_populates="order", uselist=False
    )
    payments: Mapped[list["Payment"]] = relationship(back_populates="order")


class OrderItem(Base, TimestampMixin):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"), nullable=False
    )
    warehouse_id: Mapped[int] = mapped_column(
        ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    order: Mapped[Order] = relationship(back_populates="items")
    product: Mapped["Product"] = relationship()
    warehouse: Mapped["Warehouse"] = relationship()
