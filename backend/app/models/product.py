import enum
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models._mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.inventory import Inventory
    from app.models.seller import Seller


class ProductType(str, enum.Enum):
    REPUESTO = "REPUESTO"
    LUBRICANTE = "LUBRICANTE"
    VEHICULO = "VEHICULO"


class ProductCategory(Base, TimestampMixin):
    __tablename__ = "product_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    product_type: Mapped[ProductType] = mapped_column(
        Enum(ProductType, name="product_type"), nullable=False
    )
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("product_categories.id", ondelete="SET NULL")
    )

    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Product(Base, TimestampMixin):
    """Producto con atributos dinámicos según tipo.

    attributes (JSONB) guarda campos específicos por tipo:
    - REPUESTO: {marca, modelo, compatibilidad: [], numero_parte}
    - LUBRICANTE: {viscosidad, volumen_ml, tipo_motor, sae}
    - VEHICULO: {vin, chasis, anio, kilometraje, color, motor_cc, transmision}
    """

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    seller_id: Mapped[int] = mapped_column(
        ForeignKey("sellers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    sku: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    product_type: Mapped[ProductType] = mapped_column(
        Enum(ProductType, name="product_type"), nullable=False, index=True
    )
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("product_categories.id", ondelete="SET NULL")
    )
    base_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="BOB", nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 4), default=Decimal("0.13"), nullable=False
    )  # IVA Bolivia 13%
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    attributes: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )

    category: Mapped[ProductCategory | None] = relationship(back_populates="products")
    inventory: Mapped[list["Inventory"]] = relationship(back_populates="product")
    seller: Mapped["Seller"] = relationship()
