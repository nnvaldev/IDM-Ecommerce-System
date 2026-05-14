"""Seed de datos para desarrollo local.

Uso:
    python -m app.seed

Crea (idempotente):
- Admin: admin@idm.bo / admin123
- Cliente B2B demo: taller@demo.bo / demo1234
- 3 sellers: IDM S.A. (raíz, APPROVED), Lubricantes Bolivia (APPROVED),
  Repuestos Andinos (APPROVED). Cuentas demo: seller1@demo.bo / seller2@demo.bo
- Almacenes IDM: LP-01 (La Paz), CBB-01 (Cochabamba), SCZ-01 (Santa Cruz)
- 1 almacén por seller adicional
- Categorías base por tipo
- Un producto por tipo (IDM) + productos extras de cada seller, con stock inicial
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
    Seller,
    SellerStatus,
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

        # --- Seller raíz IDM ---
        idm_seller = (
            await db.execute(select(Seller).where(Seller.is_house.is_(True)))
        ).scalar_one_or_none()
        if idm_seller is None:
            idm_seller = Seller(
                id=1,
                name="IDM S.A.",
                slug="idm",
                nit="1023456789",
                contact_email="admin@idm.bo",
                phone="+591 22000000",
                address="Av. 6 de Agosto 2500, La Paz",
                city="La Paz",
                description=(
                    "Importadora y Distribuidora Multimotriz S.A. — repuestos, "
                    "lubricantes y vehículos."
                ),
                status=SellerStatus.APPROVED,
                is_house=True,
                owner_user_id=admin.id,
            )
            db.add(idm_seller)
            await db.flush()
        else:
            # Asegurar dueño y estado correctos
            idm_seller.status = SellerStatus.APPROVED
            if idm_seller.owner_user_id is None:
                idm_seller.owner_user_id = admin.id

        # --- Seller 1: Lubricantes Bolivia ---
        seller1_user, _ = await _get_or_create_user(
            db,
            "seller1@demo.bo",
            password_hash=hash_password("seller123"),
            full_name="Lubricantes Bolivia SRL",
            role=UserRole.SELLER,
            is_active=True,
        )
        seller1, _ = await _get_or_create(
            db,
            Seller,
            {"slug": "lubricantes-bolivia"},
            {
                "name": "Lubricantes Bolivia SRL",
                "nit": "2034567890",
                "contact_email": "ventas@lubribolivia.bo",
                "phone": "+591 22111222",
                "city": "Cochabamba",
                "description": "Especialistas en lubricantes y aditivos para motor.",
                "status": SellerStatus.APPROVED,
                "owner_user_id": seller1_user.id,
            },
        )

        # --- Seller 2: Repuestos Andinos ---
        seller2_user, _ = await _get_or_create_user(
            db,
            "seller2@demo.bo",
            password_hash=hash_password("seller123"),
            full_name="Repuestos Andinos S.A.",
            role=UserRole.SELLER,
            is_active=True,
        )
        seller2, _ = await _get_or_create(
            db,
            Seller,
            {"slug": "repuestos-andinos"},
            {
                "name": "Repuestos Andinos S.A.",
                "nit": "2045678901",
                "contact_email": "ventas@andinos.bo",
                "phone": "+591 33444555",
                "city": "Santa Cruz",
                "description": "Repuestos automotrices originales y alternativos.",
                "status": SellerStatus.APPROVED,
                "owner_user_id": seller2_user.id,
            },
        )

        # --- Almacenes IDM ---
        warehouses: dict[str, Warehouse] = {}
        for code, name, city in [
            ("LP-01", "Almacén La Paz", "LA_PAZ"),
            ("CBB-01", "Almacén Cochabamba", "COCHABAMBA"),
            ("SCZ-01", "Almacén Santa Cruz", "SANTA_CRUZ"),
        ]:
            wh, _ = await _get_or_create(
                db,
                Warehouse,
                {"code": code},
                {"name": name, "city": city, "seller_id": idm_seller.id},
            )
            # Garantizar que existentes queden bajo IDM
            if wh.seller_id != idm_seller.id:
                wh.seller_id = idm_seller.id
            warehouses[code] = wh

        # Almacén único por seller adicional
        wh_seller1, _ = await _get_or_create(
            db,
            Warehouse,
            {"code": "LUB-CBB"},
            {
                "name": "Bodega Lubricantes Cochabamba",
                "city": "COCHABAMBA",
                "seller_id": seller1.id,
            },
        )
        wh_seller2, _ = await _get_or_create(
            db,
            Warehouse,
            {"code": "AND-SCZ"},
            {
                "name": "Centro Logístico Andinos Santa Cruz",
                "city": "SANTA_CRUZ",
                "seller_id": seller2.id,
            },
        )

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

        # --- Productos IDM (demo) ---
        prod_rep, _ = await _get_or_create(
            db,
            Product,
            {"sku": "REP-0001"},
            {
                "seller_id": idm_seller.id,
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
                "seller_id": idm_seller.id,
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
                "seller_id": idm_seller.id,
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

        # --- Productos extras de seller1 (Lubricantes Bolivia) ---
        prod_s1_a, _ = await _get_or_create(
            db,
            Product,
            {"sku": "LUB-1001"},
            {
                "seller_id": seller1.id,
                "name": "Aceite Castrol GTX 20W-50 4L",
                "description": "Aceite mineral protección máxima",
                "product_type": ProductType.LUBRICANTE,
                "category_id": cat_lub.id,
                "base_price": Decimal("180.00"),
                "attributes": {"viscosidad": "20W-50", "volumen_ml": 4000, "sae": "20W-50"},
            },
        )
        prod_s1_b, _ = await _get_or_create(
            db,
            Product,
            {"sku": "LUB-1002"},
            {
                "seller_id": seller1.id,
                "name": "Refrigerante Prestone 1 GL",
                "description": "Refrigerante listo para usar",
                "product_type": ProductType.LUBRICANTE,
                "category_id": cat_lub.id,
                "base_price": Decimal("95.00"),
                "attributes": {"volumen_ml": 3785, "tipo_motor": "universal"},
            },
        )

        # --- Productos extras de seller2 (Repuestos Andinos) ---
        prod_s2_a, _ = await _get_or_create(
            db,
            Product,
            {"sku": "REP-2001"},
            {
                "seller_id": seller2.id,
                "name": "Pastillas de freno Nissan Sentra",
                "description": "Juego delantero cerámica de baja emisión",
                "product_type": ProductType.REPUESTO,
                "category_id": cat_rep.id,
                "base_price": Decimal("220.00"),
                "attributes": {"marca": "Nissan", "numero_parte": "D1060-EM00A"},
            },
        )
        prod_s2_b, _ = await _get_or_create(
            db,
            Product,
            {"sku": "REP-2002"},
            {
                "seller_id": seller2.id,
                "name": "Batería Bosch 12V 70Ah",
                "description": "Batería libre de mantenimiento",
                "product_type": ProductType.REPUESTO,
                "category_id": cat_rep.id,
                "base_price": Decimal("680.00"),
                "attributes": {"marca": "Bosch", "voltios": 12, "amperios_hora": 70},
            },
        )

        # --- Stock inicial ---
        stock_plan = [
            # Productos IDM en sus 3 almacenes
            (prod_rep, warehouses["LP-01"], 50),
            (prod_rep, warehouses["CBB-01"], 30),
            (prod_rep, warehouses["SCZ-01"], 40),
            (prod_lub, warehouses["LP-01"], 100),
            (prod_lub, warehouses["CBB-01"], 80),
            (prod_lub, warehouses["SCZ-01"], 120),
            (prod_veh, warehouses["LP-01"], 2),
            (prod_veh, warehouses["SCZ-01"], 3),
            # Seller 1
            (prod_s1_a, wh_seller1, 60),
            (prod_s1_b, wh_seller1, 45),
            # Seller 2
            (prod_s2_a, wh_seller2, 30),
            (prod_s2_b, wh_seller2, 15),
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
        print("  Admin:       admin@idm.bo     / admin123")
        print("  B2B:         taller@demo.bo   / demo1234")
        print("  Seller 1:    seller1@demo.bo  / seller123  (Lubricantes Bolivia)")
        print("  Seller 2:    seller2@demo.bo  / seller123  (Repuestos Andinos)")


if __name__ == "__main__":
    asyncio.run(run())
