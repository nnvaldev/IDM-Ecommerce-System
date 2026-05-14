from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.transfer import TransferStatus


class TransferItemRequest(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)


class TransferCreateRequest(BaseModel):
    origin_warehouse_id: int
    destination_warehouse_id: int
    items: list[TransferItemRequest] = Field(min_length=1)
    notes: str | None = None


class TransferRejectRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class TransferReceiveRequest(BaseModel):
    qr_token: str | None = None  # alterna a {transfer_id} en URL


class TransferItemPublic(BaseModel):
    product_id: int
    quantity: int

    model_config = ConfigDict(from_attributes=True)


class TransferPublic(BaseModel):
    id: int
    transfer_number: str
    origin_warehouse_id: int
    destination_warehouse_id: int
    status: TransferStatus
    qr_token: str | None
    requested_by: int | None
    picked_by: int | None
    received_by: int | None
    dispatched_at: datetime | None
    received_at: datetime | None
    notes: str | None
    items: list[TransferItemPublic] = []

    model_config = ConfigDict(from_attributes=True)
