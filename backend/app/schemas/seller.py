from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.seller import SellerStatus
from app.schemas.auth import UserPublic


class SellerRegisterRequest(BaseModel):
    # Datos de la empresa
    name: str = Field(min_length=2, max_length=200, description="Razón social de la empresa")
    nit: str = Field(min_length=4, max_length=20)
    contact_email: EmailStr
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=2000)
    logo_url: str | None = Field(default=None, max_length=500)

    # Datos del usuario dueño (representante de la empresa)
    owner_email: EmailStr
    owner_password: str = Field(min_length=8, max_length=64)
    owner_full_name: str = Field(min_length=2, max_length=200)


class SellerPublic(BaseModel):
    id: int
    name: str
    slug: str
    nit: str
    contact_email: str
    phone: str | None
    address: str | None
    city: str | None
    description: str | None
    logo_url: str | None
    status: SellerStatus
    rejection_reason: str | None
    is_house: bool
    owner_user_id: int | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SellerSummary(BaseModel):
    id: int
    name: str
    slug: str
    status: SellerStatus

    model_config = ConfigDict(from_attributes=True)


class SellerWithOwner(SellerPublic):
    owner: UserPublic | None = None


class SellerUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    contact_email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=2000)
    logo_url: str | None = Field(default=None, max_length=500)


class SellerRejectRequest(BaseModel):
    reason: str = Field(min_length=2, max_length=500)


class SellerRegisterResponse(BaseModel):
    seller: SellerPublic
    message: str
