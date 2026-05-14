from collections.abc import Callable, Iterable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.models.seller import Seller, SellerStatus
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = decode_token(token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token sin subject",
        )

    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario inactivo o inexistente",
        )
    return user


def require_roles(*roles: UserRole) -> Callable[[User], User]:
    allowed: Iterable[UserRole] = roles

    def _checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Rol insuficiente para esta operación",
            )
        return current_user

    return _checker


async def get_active_seller(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Seller:
    """Devuelve el Seller del usuario logueado.
    Solo válido para rol SELLER y empresa en estado APPROVED.
    """
    if current_user.role != UserRole.SELLER:
        raise HTTPException(status_code=403, detail="Solo usuarios con rol SELLER")
    result = await db.execute(select(Seller).where(Seller.owner_user_id == current_user.id))
    seller = result.scalar_one_or_none()
    if seller is None:
        raise HTTPException(status_code=404, detail="No tienes una empresa registrada")
    if seller.status != SellerStatus.APPROVED:
        raise HTTPException(
            status_code=403,
            detail=f"Tu empresa está en estado {seller.status.value}. Aún no podés operar.",
        )
    return seller
