from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.models.invoice import InvoiceStatus


class InvoicePublic(BaseModel):
    id: int
    order_id: int
    invoice_number: str
    cuf: str | None
    cdc: str | None
    authorization_code: str | None
    issue_date: datetime
    customer_nit: str
    customer_name: str
    subtotal: Decimal
    tax: Decimal
    total: Decimal
    status: InvoiceStatus
    siat_response: str | None

    model_config = ConfigDict(from_attributes=True)


class EmitInvoiceRequest(BaseModel):
    order_id: int
    force_fail: bool = False  # solo para pruebas del modo contingencia
