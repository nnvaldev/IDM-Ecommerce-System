"""Cliente y generador de facturación electrónica SIAT (CUE-05).

Estrategia:
- Generamos un XML estructurado conforme al estándar de SIAT (campos
  fundamentales). Para producción se debe firmar con el certificado real;
  acá usamos un hash determinístico que cumple la forma.
- El "envío" es un mock que respeta el timeout configurado.
- Si el envío falla (timeout o respuesta no-OK) se devuelve modo CONTINGENCIA:
  factura local válida + cola para reintento posterior.
"""
from __future__ import annotations

import asyncio
import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from xml.sax.saxutils import escape

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.customer import Customer
from app.models.invoice import Invoice, InvoiceStatus
from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product

SIAT_TIMEOUT_SECONDS = 5  # CUE-05 A1: 5s → contingencia


class SIATError(Exception):
    pass


class SIATTimeout(SIATError):
    pass


class SIATRejected(SIATError):
    pass


@dataclass
class SIATResponse:
    cuf: str
    cdc: str
    authorization_code: str
    raw_message: str


def _build_xml(order: Order, items: list[OrderItem], products: dict[int, Product], customer: Customer) -> str:
    """Construye XML simplificado (formato compatible con plantilla SIAT)."""
    issued = datetime.now(tz=UTC).isoformat()
    nit = escape(customer.tax_id or "0")
    business = escape(customer.business_name)
    detail_xml = ""
    for it in items:
        prod = products.get(it.product_id)
        name = escape(prod.name if prod else f"item-{it.product_id}")
        sku = escape(prod.sku if prod else "")
        detail_xml += (
            f"  <detalle>\n"
            f"    <sku>{sku}</sku>\n"
            f"    <descripcion>{name}</descripcion>\n"
            f"    <cantidad>{it.quantity}</cantidad>\n"
            f"    <precioUnitario>{it.unit_price}</precioUnitario>\n"
            f"    <subTotal>{it.subtotal}</subTotal>\n"
            f"  </detalle>\n"
        )

    siat_nit = escape(settings.siat_nit or "EMISOR-NIT-DEMO")

    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<facturaElectronica>\n'
        f'  <cabecera>\n'
        f'    <nitEmisor>{siat_nit}</nitEmisor>\n'
        f'    <numeroFactura>{order.order_number}</numeroFactura>\n'
        f'    <fechaEmision>{issued}</fechaEmision>\n'
        f'    <nitCliente>{nit}</nitCliente>\n'
        f'    <razonSocialCliente>{business}</razonSocialCliente>\n'
        f'    <subtotal>{order.subtotal}</subtotal>\n'
        f'    <iva>{order.tax}</iva>\n'
        f'    <total>{order.total}</total>\n'
        f'    <moneda>{order.currency}</moneda>\n'
        f'  </cabecera>\n'
        f'  <detalles>\n{detail_xml}'
        f'  </detalles>\n'
        f'</facturaElectronica>\n'
    )


def _sign_xml(xml: str) -> str:
    """Firma simplificada: hash SHA-256 sobre el contenido (placeholder)."""
    return hashlib.sha256(xml.encode("utf-8")).hexdigest()


async def _post_to_siat(xml: str, *, force_fail: bool = False) -> SIATResponse:
    """Mock de POST a SIAT con timeout simulado."""
    if force_fail:
        raise SIATTimeout("SIAT no respondió (mock)")

    async def _call() -> SIATResponse:
        # Latencia artificial mínima para simular red
        await asyncio.sleep(0.1)
        cdc = hashlib.sha1(xml.encode()).hexdigest()[:24].upper()
        cuf = (cdc + secrets.token_hex(20)).upper()
        return SIATResponse(
            cuf=cuf,
            cdc=cdc,
            authorization_code=f"AUT-{cdc[:10]}",
            raw_message="OK",
        )

    try:
        return await asyncio.wait_for(_call(), timeout=SIAT_TIMEOUT_SECONDS)
    except TimeoutError as e:
        raise SIATTimeout("Timeout SIAT") from e


async def _next_invoice_number(db: AsyncSession) -> str:
    last = (
        await db.execute(select(Invoice.id).order_by(Invoice.id.desc()).limit(1))
    ).scalar_one_or_none()
    n = (last or 0) + 1
    return f"FAC-{n:08d}"


async def emit_invoice(
    db: AsyncSession,
    *,
    order_id: int,
    force_fail: bool = False,  # útil para tests del flujo de contingencia
) -> Invoice:
    """CUE-05: genera XML, lo envía al SIAT y persiste la Invoice + CUF.

    Si el SIAT no responde dentro del timeout, persiste la factura en estado
    PENDING (modo contingencia) y la deja encolada para reintento.
    """
    order = (
        await db.execute(
            select(Order)
            .options(selectinload(Order.items), selectinload(Order.invoice))
            .where(Order.id == order_id)
        )
    ).scalar_one_or_none()
    if order is None:
        raise SIATError("Orden no encontrada")
    if order.invoice is not None:
        return order.invoice  # idempotencia
    if order.status not in (OrderStatus.PAID, OrderStatus.CONFIRMED):
        raise SIATError(
            f"Orden no facturable (estado={order.status.value}); debe estar PAID o CONFIRMED"
        )

    customer = (
        await db.execute(select(Customer).where(Customer.id == order.customer_id))
    ).scalar_one()

    pids = [it.product_id for it in order.items]
    products = {
        p.id: p
        for p in (
            await db.execute(select(Product).where(Product.id.in_(pids)))
        ).scalars().all()
    }

    xml = _build_xml(order, order.items, products, customer)
    _signature = _sign_xml(xml)  # noqa: F841

    inv_number = await _next_invoice_number(db)
    issue_date = datetime.now(tz=UTC)

    invoice = Invoice(
        order_id=order.id,
        invoice_number=inv_number,
        issue_date=issue_date,
        customer_nit=customer.tax_id or "0",
        customer_name=customer.business_name,
        subtotal=order.subtotal,
        tax=order.tax,
        total=order.total,
        xml_content=xml,
        status=InvoiceStatus.PENDING,
    )
    db.add(invoice)
    await db.flush()

    try:
        resp = await _post_to_siat(xml, force_fail=force_fail)
        invoice.cuf = resp.cuf
        invoice.cdc = resp.cdc
        invoice.authorization_code = resp.authorization_code
        invoice.siat_response = resp.raw_message
        invoice.status = InvoiceStatus.AUTHORIZED
    except SIATTimeout as e:
        # Modo contingencia: queda PENDING para reintento (CUE-05 A1)
        invoice.siat_response = f"CONTINGENCIA: {e}"
        invoice.status = InvoiceStatus.PENDING
    except SIATRejected as e:
        invoice.siat_response = f"REJECTED: {e}"
        invoice.status = InvoiceStatus.REJECTED

    await db.commit()
    await db.refresh(invoice)
    return invoice


async def retry_pending(db: AsyncSession, *, batch_size: int = 50) -> dict:
    """CUE-05 A1: reintenta facturas en contingencia (PENDING con XML)."""
    pending = (
        await db.execute(
            select(Invoice)
            .where(Invoice.status == InvoiceStatus.PENDING, Invoice.cuf.is_(None))
            .order_by(Invoice.id)
            .limit(batch_size)
        )
    ).scalars().all()

    sent = 0
    failed = 0
    for inv in pending:
        try:
            resp = await _post_to_siat(inv.xml_content or "")
            inv.cuf = resp.cuf
            inv.cdc = resp.cdc
            inv.authorization_code = resp.authorization_code
            inv.status = InvoiceStatus.AUTHORIZED
            inv.siat_response = (inv.siat_response or "") + " | RETRY OK"
            sent += 1
        except SIATError as e:
            inv.siat_response = (inv.siat_response or "") + f" | RETRY FAIL: {e}"
            failed += 1
    await db.commit()
    return {"reintentadas": sent, "fallaron": failed, "total": len(pending)}


def render_pdf_text(invoice: Invoice) -> str:
    """Representación textual de la factura (sustituto de PDF para MVP)."""
    cuf = invoice.cuf or "EN CONTINGENCIA"
    return (
        "===================================\n"
        "    FACTURA ELECTRONICA - IDM S.A.   \n"
        "===================================\n"
        f"Nro Factura: {invoice.invoice_number}\n"
        f"Fecha: {invoice.issue_date}\n"
        f"NIT cliente: {invoice.customer_nit}\n"
        f"Razon social: {invoice.customer_name}\n"
        "-----------------------------------\n"
        f"Subtotal: Bs. {invoice.subtotal}\n"
        f"IVA:      Bs. {invoice.tax}\n"
        f"TOTAL:    Bs. {invoice.total}\n"
        "-----------------------------------\n"
        f"CUF: {cuf}\n"
        f"Estado: {invoice.status.value}\n"
        "===================================\n"
    )


def render_pdf_bytes(invoice: Invoice) -> bytes:
    """Genera un PDF real (A4) con los campos clave de la factura SIAT."""
    from fpdf import FPDF

    def _safe(s: str) -> str:
        # fpdf2 con fuente core (Helvetica) usa latin-1; reemplaza caracteres no soportados.
        return s.encode("latin-1", errors="replace").decode("latin-1")

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, _safe("FACTURA ELECTRÓNICA - IDM S.A."), ln=True, align="C")
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(
        0,
        5,
        _safe("Importadora y Distribuidora Multimotriz S.A. - Bolivia"),
        ln=True,
        align="C",
    )
    pdf.ln(4)

    pdf.set_draw_color(180, 180, 180)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, _safe(f"Nº Factura: {invoice.invoice_number}"), ln=True)

    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, _safe(f"Fecha de emisión: {invoice.issue_date:%Y-%m-%d %H:%M}"), ln=True)
    pdf.cell(0, 6, _safe(f"Estado: {invoice.status.value}"), ln=True)
    pdf.ln(2)

    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(0, 6, _safe("Datos del cliente"), ln=True)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, _safe(f"NIT: {invoice.customer_nit}"), ln=True)
    pdf.cell(0, 6, _safe(f"Razón social: {invoice.customer_name}"), ln=True)
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_fill_color(240, 240, 240)
    pdf.cell(95, 8, _safe("Concepto"), border=1, fill=True)
    pdf.cell(45, 8, _safe("Detalle"), border=1, align="C", fill=True)
    pdf.cell(50, 8, _safe("Importe (Bs.)"), border=1, align="R", fill=True)
    pdf.ln()

    pdf.set_font("Helvetica", "", 10)
    pdf.cell(95, 8, _safe(f"Orden #{invoice.order_id}"), border=1)
    pdf.cell(45, 8, _safe("Subtotal"), border=1, align="C")
    pdf.cell(50, 8, _safe(f"{invoice.subtotal}"), border=1, align="R")
    pdf.ln()

    pdf.cell(95, 8, _safe("IVA 13%"), border=1)
    pdf.cell(45, 8, _safe("Impuesto incluido"), border=1, align="C")
    pdf.cell(50, 8, _safe(f"{invoice.tax}"), border=1, align="R")
    pdf.ln()

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(140, 9, _safe("TOTAL A PAGAR"), border=1)
    pdf.cell(50, 9, _safe(f"Bs. {invoice.total}"), border=1, align="R")
    pdf.ln(14)

    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(0, 5, _safe("CUF:"), ln=True)
    pdf.set_font("Courier", "", 8)
    pdf.multi_cell(0, 4, _safe(invoice.cuf or "EN CONTINGENCIA - PENDIENTE DE AUTORIZACIÓN SIAT"))
    pdf.ln(2)

    if invoice.authorization_code:
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(
            0,
            5,
            _safe(f"Código autorización: {invoice.authorization_code}"),
            ln=True,
        )

    pdf.ln(6)
    pdf.set_font("Helvetica", "I", 8)
    pdf.multi_cell(
        0,
        4,
        _safe(
            "Esta representación gráfica corresponde a una factura electrónica "
            "emitida conforme al estándar SIAT. La validez fiscal está respaldada "
            "por el CUF y el código de autorización."
        ),
        align="C",
    )

    out = pdf.output(dest="S")
    return bytes(out) if isinstance(out, (bytes, bytearray)) else out.encode("latin-1")
