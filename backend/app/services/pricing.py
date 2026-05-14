"""Reglas de precio y envío.

Para B2C se cobra el `base_price`. Para B2B el motor aplica un descuento
mayorista parametrizable (default 12%).

Tarifas de envío fijas por ciudad destino (BOB) — configurable más adelante.
"""
from decimal import Decimal

from app.models.customer import CustomerType
from app.models.product import Product

B2B_DISCOUNT_PCT = Decimal("0.12")  # 12% mayorista por defecto

SHIPPING_RATES_BOB: dict[str, Decimal] = {
    "LA_PAZ": Decimal("25.00"),
    "COCHABAMBA": Decimal("40.00"),
    "SANTA_CRUZ": Decimal("55.00"),
}
DEFAULT_SHIPPING_BOB = Decimal("60.00")


def shipping_cost(destination_city: str | None) -> Decimal:
    if not destination_city:
        return DEFAULT_SHIPPING_BOB
    return SHIPPING_RATES_BOB.get(destination_city.upper(), DEFAULT_SHIPPING_BOB)


def unit_price_for(product: Product, customer_type: CustomerType) -> Decimal:
    if customer_type == CustomerType.B2B:
        return (product.base_price * (Decimal("1") - B2B_DISCOUNT_PCT)).quantize(
            Decimal("0.01")
        )
    return product.base_price.quantize(Decimal("0.01"))
