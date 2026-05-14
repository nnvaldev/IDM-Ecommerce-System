from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.product import ProductType


# ---------- Warehouses ----------
class WarehouseBase(BaseModel):
    code: str = Field(min_length=2, max_length=20)
    name: str = Field(min_length=2, max_length=150)
    city: str = Field(min_length=2, max_length=50)
    address: str | None = Field(default=None, max_length=255)
    is_active: bool = True


class WarehouseCreate(WarehouseBase):
    pass


class WarehouseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    city: str | None = Field(default=None, min_length=2, max_length=50)
    address: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None


class WarehousePublic(WarehouseBase):
    id: int
    seller_id: int
    model_config = ConfigDict(from_attributes=True)


# ---------- Categories ----------
class CategoryBase(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    product_type: ProductType
    parent_id: int | None = None


class CategoryCreate(CategoryBase):
    pass


class CategoryPublic(CategoryBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


# ---------- Products ----------
class ProductBase(BaseModel):
    sku: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=2, max_length=255)
    description: str | None = None
    product_type: ProductType
    category_id: int | None = None
    base_price: Decimal = Field(ge=0)
    currency: str = Field(default="BOB", min_length=3, max_length=3)
    tax_rate: Decimal = Field(default=Decimal("0.13"), ge=0, le=1)
    is_active: bool = True
    attributes: dict[str, Any] = Field(default_factory=dict)


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = None
    category_id: int | None = None
    base_price: Decimal | None = Field(default=None, ge=0)
    tax_rate: Decimal | None = Field(default=None, ge=0, le=1)
    is_active: bool | None = None
    attributes: dict[str, Any] | None = None


class StockByWarehouse(BaseModel):
    warehouse_id: int
    warehouse_code: str
    warehouse_city: str
    quantity: int
    reserved: int
    available: int
    min_stock: int


class ProductPublic(ProductBase):
    id: int
    seller_id: int
    seller_name: str | None = None
    seller_slug: str | None = None
    total_quantity: int = 0
    total_available: int = 0
    is_sold_out: bool = False
    stock_by_warehouse: list[StockByWarehouse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class ProductListItem(BaseModel):
    id: int
    sku: str
    name: str
    product_type: ProductType
    base_price: Decimal
    currency: str
    is_active: bool
    total_available: int
    is_sold_out: bool
    seller_id: int
    seller_name: str | None = None
    seller_slug: str | None = None

    model_config = ConfigDict(from_attributes=True)


# ---------- Inventory adjustments ----------
class StockAdjustRequest(BaseModel):
    product_id: int
    warehouse_id: int
    delta: int = Field(description="Positivo entra, negativo sale")
    notes: str | None = Field(default=None, max_length=500)


class InventoryMovementPublic(BaseModel):
    id: int
    product_id: int
    warehouse_id: int
    movement_type: str
    quantity: int
    reference_type: str | None
    reference_id: int | None
    notes: str | None
    user_id: int | None

    model_config = ConfigDict(from_attributes=True)


class StockAlert(BaseModel):
    product_id: int
    sku: str
    name: str
    total_quantity: int
    min_stock_total: int
    severity: str  # "OUT_OF_STOCK" | "LOW_STOCK"
