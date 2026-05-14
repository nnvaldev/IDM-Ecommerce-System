from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.user import User, UserRole
from app.services.reports import (
    daily_sales,
    dashboard_summary,
    sales_by_channel,
    sales_by_warehouse,
    to_csv,
    top_products,
    warehouse_movements_report,
)

router = APIRouter(prefix="/reports", tags=["reports"])
ALLOWED = (UserRole.ADMIN, UserRole.SALES)


@router.get("/dashboard")
async def dashboard(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ALLOWED)),
) -> dict:
    return await dashboard_summary(db)


@router.get("/sales/by-warehouse")
async def by_warehouse(
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ALLOWED)),
) -> list[dict]:
    return await sales_by_warehouse(db, date_from=date_from, date_to=date_to)


@router.get("/sales/by-channel")
async def by_channel(
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ALLOWED)),
) -> list[dict]:
    return await sales_by_channel(db, date_from=date_from, date_to=date_to)


@router.get("/sales/daily")
async def daily(
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ALLOWED)),
) -> list[dict]:
    return await daily_sales(db, date_from=date_from, date_to=date_to)


@router.get("/movements")
async def movements(
    warehouse_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ALLOWED)),
) -> list[dict]:
    return await warehouse_movements_report(
        db, warehouse_id=warehouse_id, date_from=date_from, date_to=date_to
    )


@router.get("/top-products")
async def top(
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ALLOWED)),
) -> list[dict]:
    return await top_products(db, date_from=date_from, date_to=date_to, limit=limit)


@router.get("/export/sales-by-warehouse.csv", response_class=PlainTextResponse)
async def export_warehouse(
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ALLOWED)),
) -> str:
    rows = await sales_by_warehouse(db, date_from=date_from, date_to=date_to)
    return to_csv(rows)


@router.get("/export/top-products.csv", response_class=PlainTextResponse)
async def export_top(
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ALLOWED)),
) -> str:
    rows = await top_products(db, date_from=date_from, date_to=date_to, limit=limit)
    return to_csv(rows)
