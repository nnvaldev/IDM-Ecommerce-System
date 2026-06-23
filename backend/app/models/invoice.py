import enum
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models._mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.order import Order
    from app.models.warehouse import Warehouse


class InvoiceStatus(str, enum.Enum):
    PENDING = "PENDING"
    AUTHORIZED = "AUTHORIZED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class RemissionStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_TRANSIT = "IN_TRANSIT"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"


class Invoice(Base, TimestampMixin):
    """Factura electrónica SIAT.

    cuf: Código Único de Facturación (generado por SIAT).
    cdc: Código de Control.
    xml_content: XML firmado enviado a SIAT (referencia legal).
    """

    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), unique=True, nullable=False
    )
    invoice_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    cuf: Mapped[str | None] = mapped_column(String(128), index=True)
    cdc: Mapped[str | None] = mapped_column(String(64))
    authorization_code: Mapped[str | None] = mapped_column(String(64))
    issue_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    customer_nit: Mapped[str] = mapped_column(String(20), nullable=False)
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)

    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    tax: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    status: Mapped[InvoiceStatus] = mapped_column(
        Enum(InvoiceStatus, name="invoice_status"),
        nullable=False,
        default=InvoiceStatus.PENDING,
        index=True,
    )
    xml_content: Mapped[str | None] = mapped_column(Text)
    siat_response: Mapped[str | None] = mapped_column(Text)

    order: Mapped["Order"] = relationship(back_populates="invoice")


class RemissionNote(Base, TimestampMixin):
    """Nota de Remisión — requerida para transporte legal de mercancía entre departamentos."""

    __tablename__ = "remission_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), unique=True, nullable=False
    )
    note_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    origin_warehouse_id: Mapped[int] = mapped_column(
        ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False
    )
    destination_city: Mapped[str] = mapped_column(String(100), nullable=False)
    carrier: Mapped[str | None] = mapped_column(String(150))
    plate_number: Mapped[str | None] = mapped_column(String(20))
    driver_name: Mapped[str | None] = mapped_column(String(150))
    issue_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[RemissionStatus] = mapped_column(
        Enum(RemissionStatus, name="remission_status"),
        nullable=False,
        default=RemissionStatus.PENDING,
    )

    order: Mapped["Order"] = relationship(back_populates="remission_note")
    origin_warehouse: Mapped["Warehouse"] = relationship()
