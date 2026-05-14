import enum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models._mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User


class SellerStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    SUSPENDED = "SUSPENDED"


class Seller(Base, TimestampMixin):
    """Empresa vendedora del marketplace.

    Cada Seller administra sus productos, almacenes e inventario.
    IDM S.A. se modela como el Seller id=1 (auto-aprobado por seed).
    """

    __tablename__ = "sellers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    nit: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    contact_email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30))
    address: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(80))
    description: Mapped[str | None] = mapped_column(Text)
    logo_url: Mapped[str | None] = mapped_column(String(500))

    status: Mapped[SellerStatus] = mapped_column(
        Enum(SellerStatus, name="seller_status"),
        nullable=False,
        default=SellerStatus.PENDING,
        index=True,
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    is_house: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    owner_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    owner: Mapped["User | None"] = relationship(
        foreign_keys=[owner_user_id], back_populates="seller"
    )
