from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.order import PaymentMethod
from app.schemas.cart import OrderItemPublic, OrderInvoiceSummary


class POSItemRequest(BaseModel):
    sku: str = Field(min_length=1, max_length=64)
    quantity: int = Field(gt=0)


class POSCheckoutRequest(BaseModel):
    warehouse_id: int
    customer_nit: str = Field(min_length=1, max_length=20)
    customer_name: str = Field(min_length=2, max_length=255)
    payment_method: PaymentMethod = Field(
        default=PaymentMethod.CASH,
        description="CASH o CARD para venta presencial",
    )
    items: list[POSItemRequest] = Field(min_length=1)
    notes: str | None = Field(default=None, max_length=500)


class POSReceiptResponse(BaseModel):
    order_id: int
    order_number: str
    seller_id: int
    subtotal: Decimal
    tax: Decimal
    total: Decimal
    items: list[OrderItemPublic]
    invoice: OrderInvoiceSummary | None

    model_config = ConfigDict(from_attributes=True)
