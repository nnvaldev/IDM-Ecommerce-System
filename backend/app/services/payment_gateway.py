"""Mock de pasarela de pagos (PagosNet/QR/Tarjeta).

CUE-01 paso 7-8: el sistema envía al gateway y recibe token. Esta versión
simula el comportamiento usando un sufijo del email/monto:

- Si la referencia contiene 'FAIL' → declinada (CUE-01 A2)
- Si el monto es 0 → declinada
- Caso contrario → aprobada con token determinístico
"""
from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from decimal import Decimal


@dataclass
class PaymentResult:
    approved: bool
    token: str | None
    gateway_reference: str | None
    message: str


def charge(
    *,
    amount: Decimal,
    method: str,
    reference: str,
) -> PaymentResult:
    if amount <= 0:
        return PaymentResult(False, None, None, "Monto inválido")

    if "FAIL" in reference.upper():
        return PaymentResult(
            False, None, None, "Pago rechazado por la pasarela (fondos insuficientes)"
        )

    nonce = secrets.token_hex(4)
    raw = f"{reference}:{method}:{amount}:{nonce}"
    token = hashlib.sha256(raw.encode()).hexdigest()[:32]
    return PaymentResult(
        approved=True,
        token=f"PG-{token.upper()}",
        gateway_reference=f"REF-{nonce.upper()}",
        message="Pago aprobado",
    )
