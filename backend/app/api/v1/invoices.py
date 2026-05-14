from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.customer import Customer
from app.models.invoice import Invoice, InvoiceStatus
from app.models.order import Order
from app.models.user import User, UserRole
from app.schemas.invoice import EmitInvoiceRequest, InvoicePublic
from app.services.siat import (
    SIATError,
    emit_invoice,
    render_pdf_bytes,
    retry_pending,
)

router = APIRouter(prefix="/invoices", tags=["invoices"])

STAFF_ROLES = (UserRole.ADMIN, UserRole.SALES, UserRole.WAREHOUSE_MANAGER)


def _is_staff(user: User) -> bool:
    return user.role in STAFF_ROLES


async def _require_invoice_access(
    db: AsyncSession, invoice: Invoice, user: User
) -> None:
    """Permite acceso si el usuario es staff o es el cliente dueño de la orden."""
    if _is_staff(user):
        return
    owns = (
        await db.execute(
            select(Order.id)
            .join(Customer, Customer.id == Order.customer_id)
            .where(Order.id == invoice.order_id, Customer.user_id == user.id)
        )
    ).scalar_one_or_none()
    if owns is None:
        raise HTTPException(status_code=403, detail="No autorizado")


@router.post("", response_model=InvoicePublic, status_code=status.HTTP_201_CREATED)
async def emit(
    payload: EmitInvoiceRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*STAFF_ROLES)),
) -> Invoice:
    try:
        invoice = await emit_invoice(
            db, order_id=payload.order_id, force_fail=payload.force_fail
        )
    except SIATError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return invoice


@router.get("", response_model=list[InvoicePublic])
async def list_invoices(
    status_filter: InvoiceStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*STAFF_ROLES)),
) -> list[Invoice]:
    stmt = select(Invoice).order_by(Invoice.id.desc()).limit(limit)
    if status_filter is not None:
        stmt = stmt.where(Invoice.status == status_filter)
    return list((await db.execute(stmt)).scalars().all())


@router.get("/{invoice_id}", response_model=InvoicePublic)
async def get_invoice(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Invoice:
    inv = (
        await db.execute(select(Invoice).where(Invoice.id == invoice_id))
    ).scalar_one_or_none()
    if inv is None:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    await _require_invoice_access(db, inv, user)
    return inv


@router.get("/{invoice_id}/xml", response_class=Response)
async def download_xml(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    inv = (
        await db.execute(select(Invoice).where(Invoice.id == invoice_id))
    ).scalar_one_or_none()
    if inv is None or not inv.xml_content:
        raise HTTPException(status_code=404, detail="XML no disponible")
    await _require_invoice_access(db, inv, user)
    return Response(
        content=inv.xml_content,
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="{inv.invoice_number}.xml"'
        },
    )


@router.get("/{invoice_id}/pdf", response_class=Response)
async def download_pdf(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Representación gráfica oficial (PDF A4) generada con fpdf2."""
    inv = (
        await db.execute(select(Invoice).where(Invoice.id == invoice_id))
    ).scalar_one_or_none()
    if inv is None:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    await _require_invoice_access(db, inv, user)
    pdf = render_pdf_bytes(inv)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{inv.invoice_number}.pdf"'
        },
    )


@router.post("/contingency/retry")
async def retry_contingency(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
) -> dict:
    """CUE-05 A1: vacía la cola de facturas en contingencia."""
    return await retry_pending(db)
