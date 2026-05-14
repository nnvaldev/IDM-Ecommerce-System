from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.models.customer import Customer, CustomerType
from app.models.user import User, UserRole
from app.schemas.auth import (
    RegisterB2CRequest,
    TokenResponse,
    UserPublic,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    # OAuth2PasswordRequestForm usa "username" — acá lo tratamos como email
    result = await db.execute(select(User).where(User.email == form.username))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(form.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Usuario inactivo"
        )

    token = create_access_token(
        subject=user.id, extra_claims={"role": user.role.value, "email": user.email}
    )
    return TokenResponse(
        access_token=token,
        expires_in=settings.jwt_access_token_expire_minutes * 60,
    )


@router.get("/me", response_model=UserPublic)
async def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register_b2c(
    payload: RegisterB2CRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Registro público para clientes minoristas (ACT-01 Cliente B2C)."""
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un usuario con ese email",
        )

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=UserRole.CLIENT_B2C,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    customer = Customer(
        user_id=user.id,
        customer_type=CustomerType.B2C,
        business_name=payload.full_name,
        tax_id=payload.tax_id,
        phone=payload.phone,
        city=payload.city,
    )
    db.add(customer)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(
        subject=user.id, extra_claims={"role": user.role.value, "email": user.email}
    )
    return TokenResponse(
        access_token=token,
        expires_in=settings.jwt_access_token_expire_minutes * 60,
    )
