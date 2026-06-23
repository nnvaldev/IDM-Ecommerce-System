# Arquitectura — IDM E-Commerce

## Vista general

Sistema cliente-servidor con backend API REST (Python/FastAPI), base de datos PostgreSQL y frontend SPA (React). Despliegue en Microsoft Azure sobre Linux.

```
┌─────────────┐   HTTPS   ┌──────────────┐   asyncpg   ┌──────────────┐
│  Frontend   │ ────────▶ │   Backend    │ ──────────▶ │  PostgreSQL  │
│  (React)    │  JWT      │  (FastAPI)   │             │      16      │
└─────────────┘           └──────┬───────┘             └──────────────┘
                                 │
                                 ├────▶ SIAT API (facturación electrónica)
                                 ├────▶ Pasarela QR (pagos)
                                 └────▶ Azure Blob (archivos / respaldos)
```

## Decisiones clave

### Modelado de productos heterogéneos

Tres tipos de producto (repuesto, lubricante, vehículo) en una sola tabla `products` con columna `attributes` JSONB. Las reglas específicas por tipo viven en la capa de servicio, no en el esquema.

- **Por qué:** evita proliferación de tablas `repuestos`, `lubricantes`, `vehiculos` con joins condicionales. JSONB en PostgreSQL permite indexar por atributos (`CREATE INDEX ... USING GIN (attributes)`).
- **Tradeoff:** menos validación a nivel DB; se compensa con validación Pydantic por tipo.

### Concurrencia de stock

El requisito "evitar vender el mismo producto a dos personas a la vez" se implementa en el servicio de órdenes con:

```python
# Dentro de una transacción
stmt = select(Inventory).where(...).with_for_update()
row = await db.execute(stmt)
# Si row.available >= qty, reservar; sino 409 Conflict
```

Esto usa `SELECT ... FOR UPDATE` para bloquear la fila de inventario mientras se decide. Tradeoff: puede serializar escrituras en picos; si aparece contención, pasar a `FOR UPDATE SKIP LOCKED` con reintentos o a cola.

### RBAC

Cinco roles: `ADMIN`, `WAREHOUSE_MANAGER`, `SALES`, `CLIENT_B2B`, `CLIENT_B2C`. Control con dependencia `require_roles(...)` en cada endpoint. Los roles `CLIENT_*` solo ven sus propios recursos.

### SIAT (facturación electrónica)

Módulo separado (`app/services/siat/`, pendiente) que:
1. Arma XML firmado a partir de una `Order` confirmada y pagada.
2. Envía al SIAT, guarda `cuf`, `cdc`, `authorization_code` en `invoices`.
3. Maneja reintentos y cola para caídas del servicio tributario (las facturas no pueden perderse).
4. Para transporte interdepartamental: emitir `RemissionNote` antes del envío.

Riesgos: sin credenciales SIAT todavía. Bloquea pruebas end-to-end de facturación — priorizar obtenerlas en la próxima semana.

## Seguridad

- HTTPS obligatorio en prod (terminación TLS en el frontdoor de Azure).
- JWT con expiración de 60 min; refresh tokens (pendiente — prioridad media).
- Bcrypt para contraseñas (cost 12).
- SQLAlchemy con parámetros ligados → sin SQL injection en código de aplicación.
- CORS restringido por `CORS_ORIGINS`.
- Backups diarios de PostgreSQL a Azure Blob (script en `scripts/`, pendiente).
