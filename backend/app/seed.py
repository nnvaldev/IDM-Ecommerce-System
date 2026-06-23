"""Seed de datos para desarrollo local.

Uso:
    python -m app.seed

Crea (idempotente):
- Admin: admin@idm.bo / admin123
- Cliente B2B demo: taller@demo.bo / demo1234
- Almacenes: LP-01 (La Paz), CBB-01 (Cochabamba), SCZ-01 (Santa Cruz)
- Categorías base por tipo
- Un producto por tipo, con stock inicial en los 3 almacenes
"""
import asyncio
from decimal import Decimal

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models import (
    CreditLine,
    Customer,
    CustomerType,
    Inventory,
    Product,
    ProductCategory,
    ProductType,
    User,
    UserRole,
    Warehouse,
)


async def _get_or_create_user(db, email, **defaults):
    existing = await db.execute(select(User).where(User.email == email))
    user = existing.scalar_one_or_none()
    if user:
        return user, False
    user = User(email=email, **defaults)
    db.add(user)
    await db.flush()
    return user, True


async def _get_or_create(db, model, match: dict, defaults: dict | None = None):
    stmt = select(model)
    for k, v in match.items():
        stmt = stmt.where(getattr(model, k) == v)
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        return existing, False
    obj = model(**match, **(defaults or {}))
    db.add(obj)
    await db.flush()
    return obj, True


async def run() -> None:
    async with AsyncSessionLocal() as db:
        # --- Usuarios ---
        admin, _ = await _get_or_create_user(
            db,
            "admin@idm.bo",
            password_hash=hash_password("admin123"),
            full_name="Administrador IDM",
            role=UserRole.ADMIN,
            is_active=True,
        )

        b2b_user, _ = await _get_or_create_user(
            db,
            "taller@demo.bo",
            password_hash=hash_password("demo1234"),
            full_name="Taller Mecánico Demo",
            role=UserRole.CLIENT_B2B,
            is_active=True,
        )

        # --- Cliente B2B + línea de crédito ---
        customer, created = await _get_or_create(
            db,
            Customer,
            {"user_id": b2b_user.id},
            {
                "customer_type": CustomerType.B2B,
                "tax_id": "1234567890",
                "business_name": "Taller Mecánico Demo S.R.L.",
                "phone": "+591 70000000",
                "city": "La Paz",
            },
        )
        if created:
            db.add(
                CreditLine(
                    customer_id=customer.id,
                    limit_amount=Decimal("10000.00"),
                    balance=Decimal("0.00"),
                )
            )

        # --- Almacenes ---
        warehouses: dict[str, Warehouse] = {}
        for code, name, city in [
            ("LP-01", "Almacén La Paz", "LA_PAZ"),
            ("CBB-01", "Almacén Cochabamba", "COCHABAMBA"),
            ("SCZ-01", "Almacén Santa Cruz", "SANTA_CRUZ"),
        ]:
            wh, _ = await _get_or_create(
                db, Warehouse, {"code": code}, {"name": name, "city": city}
            )
            warehouses[code] = wh

        # --- Categorías ---
        cat_rep, _ = await _get_or_create(
            db,
            ProductCategory,
            {"name": "Repuestos generales"},
            {"product_type": ProductType.REPUESTO},
        )
        cat_lub, _ = await _get_or_create(
            db,
            ProductCategory,
            {"name": "Lubricantes motor"},
            {"product_type": ProductType.LUBRICANTE},
        )
        cat_veh, _ = await _get_or_create(
            db,
            ProductCategory,
            {"name": "Vehículos nuevos"},
            {"product_type": ProductType.VEHICULO},
        )

        # --- Productos demo ---
        prod_rep, _ = await _get_or_create(
            db,
            Product,
            {"sku": "REP-0001"},
            {
                "name": "Filtro de aceite Toyota Hilux",
                "description": "Filtro OEM para motor 2.8 diésel",
                "product_type": ProductType.REPUESTO,
                "category_id": cat_rep.id,
                "base_price": Decimal("85.00"),
                "attributes": {
                    "marca": "Toyota",
                    "numero_parte": "90915-YZZD4",
                    "compatibilidad": ["Hilux 2016+", "Fortuner 2016+"],
                },
            },
        )
        prod_lub, _ = await _get_or_create(
            db,
            Product,
            {"sku": "LUB-0001"},
            {
                "name": "Aceite Mobil 1 5W-30 4L",
                "description": "Aceite sintético de alto desempeño",
                "product_type": ProductType.LUBRICANTE,
                "category_id": cat_lub.id,
                "base_price": Decimal("320.00"),
                "attributes": {
                    "viscosidad": "5W-30",
                    "volumen_ml": 4000,
                    "tipo_motor": "gasolina/diésel",
                    "sae": "5W-30",
                },
            },
        )
        prod_veh, _ = await _get_or_create(
            db,
            Product,
            {"sku": "VEH-0001"},
            {
                "name": "Toyota Hilux 2026 DX 2.4L 4x4",
                "description": "Camioneta 0 KM",
                "product_type": ProductType.VEHICULO,
                "category_id": cat_veh.id,
                "base_price": Decimal("245000.00"),
                "attributes": {
                    "vin": "MROBR3CD400123456",
                    "chasis": "BR3CD-400123",
                    "anio": 2026,
                    "kilometraje": 0,
                    "color": "Blanco",
                    "motor_cc": 2400,
                    "transmision": "Manual",
                },
            },
        )

        # --- Stock inicial ---
        stock_plan = [
            (prod_rep, warehouses["LP-01"], 50),
            (prod_rep, warehouses["CBB-01"], 30),
            (prod_rep, warehouses["SCZ-01"], 40),
            (prod_lub, warehouses["LP-01"], 100),
            (prod_lub, warehouses["CBB-01"], 80),
            (prod_lub, warehouses["SCZ-01"], 120),
            (prod_veh, warehouses["LP-01"], 2),
            (prod_veh, warehouses["SCZ-01"], 3),
        ]
        for product, wh, qty in stock_plan:
            await _get_or_create(
                db,
                Inventory,
                {"product_id": product.id, "warehouse_id": wh.id},
                {"quantity": qty, "reserved": 0, "min_stock": 5},
            )

        await db.commit()
        print("Seed completado.")
        print("  Admin: admin@idm.bo / admin123")
        print("  B2B:   taller@demo.bo / demo1234")


if __name__ == "__main__":
    asyncio.run(run())
