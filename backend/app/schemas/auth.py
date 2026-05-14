from pydantic import BaseModel, EmailStr, Field

from app.models.customer import CustomerType
from app.models.user import UserRole


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserPublic(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool

    model_config = {"from_attributes": True}


class RegisterB2CRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=64)
    full_name: str = Field(min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    city: str | None = Field(default=None, max_length=100)
    tax_id: str | None = Field(default=None, max_length=20)


class AdminCreateUserRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=64)
    full_name: str = Field(min_length=2, max_length=200)
    role: UserRole
    is_active: bool = True


class AdminUpdateUserRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=200)
    role: UserRole | None = None
    is_active: bool | None = None
    new_password: str | None = Field(default=None, min_length=8, max_length=64)


class AdminCreateB2BRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=64)
    full_name: str = Field(min_length=2, max_length=200)
    business_name: str = Field(min_length=2, max_length=255)
    tax_id: str = Field(min_length=4, max_length=20)
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    credit_limit: float = Field(default=0.0, ge=0)


class CustomerPublic(BaseModel):
    id: int
    customer_type: CustomerType
    business_name: str
    tax_id: str | None
    phone: str | None
    address: str | None
    city: str | None

    model_config = {"from_attributes": True}


class CreditLinePublic(BaseModel):
    limit_amount: float
    balance: float
    available: float
    is_active: bool


class B2BAccountResponse(BaseModel):
    user: UserPublic
    customer: CustomerPublic
    credit_line: CreditLinePublic | None = None
