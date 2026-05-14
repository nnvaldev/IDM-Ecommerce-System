import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models._mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.product import Product
    from app.models.warehouse import Warehouse


class TransferStatus(str, enum.Enum):
    REQUESTED = "REQUESTED"  # creada, pendiente picking
    PICKING = "PICKING"  # en preparación
    IN_TRANSIT = "IN_TRANSIT"  # despachada
    RECEIVED = "RECEIVED"  # recibida en destino
    CANCELLED = "CANCELLED"  # cancelada por merma o decisión
    REJECTED_MERMA = "REJECTED_MERMA"  # rechazada por daño físico


class StockTransfer(Base, TimestampMixin):
    """Orden de traspaso entre sucursales (CUE-04 / CU-INV-02).

    Una transferencia mueve N items desde origen → destino. El QR de la
    Nota de Remisión codifica la URL de recepción `/transfers/{id}/receive`.
    """

    __tablename__ = "stock_transfers"

    id: Mapped[int] = mapped_column(primary_key=True)
    transfer_number: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False, index=True
    )
    origin_warehouse_id: Mapped[int] = mapped_column(
        ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    destination_warehouse_id: Mapped[int] = mapped_column(
        ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[TransferStatus] = mapped_column(
        Enum(TransferStatus, name="transfer_status"),
        nullable=False,
        default=TransferStatus.REQUESTED,
        index=True,
    )
    qr_token: Mapped[str | None] = mapped_column(String(64), unique=True)
    requested_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    picked_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    received_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)

    items: Mapped[list["StockTransferItem"]] = relationship(
        back_populates="transfer", cascade="all, delete-orphan"
    )
    origin: Mapped["Warehouse"] = relationship(foreign_keys=[origin_warehouse_id])
    destination: Mapped["Warehouse"] = relationship(foreign_keys=[destination_warehouse_id])


class StockTransferItem(Base, TimestampMixin):
    __tablename__ = "stock_transfer_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    transfer_id: Mapped[int] = mapped_column(
        ForeignKey("stock_transfers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"), nullable=False
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    transfer: Mapped[StockTransfer] = relationship(back_populates="items")
    product: Mapped["Product"] = relationship()
