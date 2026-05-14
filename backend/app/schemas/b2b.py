from pydantic import BaseModel, Field

from app.schemas.cart import OrderPublic


class CheckoutB2BRequest(BaseModel):
    destination_city: str = Field(min_length=2, max_length=50)


class B2BApproveResponse(BaseModel):
    order: OrderPublic
    new_credit_balance: float
    new_credit_available: float


class B2BRejectRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)
