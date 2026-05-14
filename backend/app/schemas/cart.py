from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.invoice import InvoiceStatus
from app.models.order import OrderStatus, PaymentMethod, SalesChannel


class CartAddRequest(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    preferred_city: str | None = Field(default=None, max_length=50)
    warehouse_id: int | None = None


class CartItemPublic(BaseModel):
    id: int
    product_id: int
    product_name: str | None = None
    sku: str | None = None
    warehouse_id: int
    warehouse_code: str | None = None
    quantity: int
    unit_price: Decimal
    subtotal: Decimal
    reserved_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CartPublic(BaseModel):
    id: int
    user_id: int
    expires_at: datetime | None
    items: list[CartItemPublic]
    subtotal: Decimal


class CheckoutB2CRequest(BaseModel):
    destination_city: str = Field(min_length=2, max_length=50)
    payment_method: PaymentMethod
    payment_reference: str = ""


class OrderItemPublic(BaseModel):
    product_id: int
    warehouse_id: int
    quantity: int
    unit_price: Decimal
    discount: Decimal
    subtotal: Decimal

    model_config = ConfigDict(from_attributes=True)


class OrderInvoiceSummary(BaseModel):
    id: int
    invoice_number: str
    status: InvoiceStatus
    cuf: str | None
    total: Decimal

    model_config = ConfigDict(from_attributes=True)


class OrderPublic(BaseModel):
    id: int
    order_number: str
    seller_id: int | None = None
    customer_id: int
    status: OrderStatus
    channel: SalesChannel
    payment_method: PaymentMethod | None
    subtotal: Decimal
    tax: Decimal
    total: Decimal
    currency: str
    notes: str | None
    items: list[OrderItemPublic] = []
    invoice: OrderInvoiceSummary | None = None

    model_config = ConfigDict(from_attributes=True)
