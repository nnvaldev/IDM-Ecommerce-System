from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import require_roles
from app.core.security import hash_password
from app.models.customer import CreditLine, Customer, CustomerType
from app.models.user import User, UserRole
from app.schemas.auth import (
    AdminCreateB2BRequest,
    AdminCreateUserRequest,
    AdminUpdateUserRequest,
    B2BAccountResponse,
    CreditLinePublic,
    CustomerPublic,
    UserPublic,
)

router = APIRouter(prefix="/users", tags=["users"])


def _to_credit_public(cl: CreditLine | None) -> CreditLinePublic | None:
    if cl is None:
        return None
    return CreditLinePublic(
        limit_amount=float(cl.limit_amount),
        balance=float(cl.balance),
        available=float(cl.limit_amount - cl.balance),
        is_active=cl.is_active,
    )


@router.get("", response_model=list[UserPublic])
async def list_users(
    role: UserRole | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
) -> list[User]:
    stmt = select(User).order_by(User.id.desc())
    if role is not None:
        stmt = stmt.where(User.role == role)
    if is_active is not None:
        stmt = stmt.where(User.is_active == is_active)
    return list((await db.execute(stmt)).scalars().all())


@router.post("", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: AdminCreateUserRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
) -> User:
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Email ya registrado")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        is_active=payload.is_active,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserPublic)
async def update_user(
    user_id: int,
    payload: AdminUpdateUserRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
) -> User:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.new_password is not None:
        user.password_hash = hash_password(payload.new_password)

    await db.commit()
    await db.refresh(user)
    return user


@router.post(
    "/b2b",
    response_model=B2BAccountResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_b2b_account(
    payload: AdminCreateB2BRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.SALES)),
) -> B2BAccountResponse:
    """Crea cuenta B2B completa: User + Customer + CreditLine. (Soporta CUE-02)"""
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Email ya registrado")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=UserRole.CLIENT_B2B,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    customer = Customer(
        user_id=user.id,
        customer_type=CustomerType.B2B,
        business_name=payload.business_name,
        tax_id=payload.tax_id,
        phone=payload.phone,
        address=payload.address,
        city=payload.city,
    )
    db.add(customer)
    await db.flush()

    credit = CreditLine(
        customer_id=customer.id,
        limit_amount=Decimal(str(payload.credit_limit)),
        balance=Decimal("0.00"),
        is_active=True,
    )
    db.add(credit)
    await db.commit()
    await db.refresh(user)
    await db.refresh(customer)
    await db.refresh(credit)

    return B2BAccountResponse(
        user=UserPublic.model_validate(user),
        customer=CustomerPublic.model_validate(customer),
        credit_line=_to_credit_public(credit),
    )


@router.get("/b2b/{customer_id}", response_model=B2BAccountResponse)
async def get_b2b_account(
    customer_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.SALES)),
) -> B2BAccountResponse:
    stmt = (
        select(Customer)
        .options(selectinload(Customer.user), selectinload(Customer.credit_line))
        .where(Customer.id == customer_id)
    )
    customer = (await db.execute(stmt)).scalar_one_or_none()
    if customer is None or customer.customer_type != CustomerType.B2B:
        raise HTTPException(status_code=404, detail="Cliente B2B no encontrado")

    return B2BAccountResponse(
        user=UserPublic.model_validate(customer.user),
        customer=CustomerPublic.model_validate(customer),
        credit_line=_to_credit_public(customer.credit_line),
    )
