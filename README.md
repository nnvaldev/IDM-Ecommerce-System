# IDM E-Commerce

Sistema de Administración y Control E-Commerce Multidiversificador para **Importadora y Distribuidora Multimotriz S.A. (IDM S.A.)**, Bolivia — operando como **marketplace multi-empresa**.

Plataforma unificada de gestión de inventarios heterogéneos (repuestos, lubricantes, vehículos) con ventas minoristas (B2C) y mayoristas con crédito (B2B), distribución multi-almacén La Paz · Cochabamba · Santa Cruz, **POS de mostrador con facturación directa** y facturación electrónica conforme al estándar **SIAT**.

Cualquier empresa puede solicitar registro como **vendedor** (`/registro-empresa`); el administrador la aprueba desde `/admin/empresas` y a partir de allí gestiona su propio catálogo, inventario y ventas. IDM S.A. es la empresa raíz (seller `id=1`) y conserva sus 3 almacenes y catálogo histórico.

> Trabajo de Taller de Técnico Superior — UMSA.

---

## Stack

**Backend** Python 3.12 · FastAPI 0.115 · SQLAlchemy 2.0 async · asyncpg · Alembic · Pydantic v2 · python-jose (JWT) · passlib + bcrypt 4.1.3 · fpdf2 (PDF SIAT)
**Base de datos** PostgreSQL 16
**Frontend** React 18 · Vite 5 · TypeScript estricto · Tailwind 3 · React Router 6 · axios · Recharts · qrcode.react · @yudiel/react-qr-scanner
**Infra** Docker Compose · Makefile

## Estructura

```
idm-ecommerce/
├── backend/                FastAPI + SQLAlchemy + Alembic
│   ├── app/
│   │   ├── api/v1/         auth, catalog, cart, b2b, inventory, transfers,
│   │   │                   invoices, reports, users, warehouses, health
│   │   ├── models/         User, Customer, Product, Inventory, Order, Cart,
│   │   │                   Transfer, Invoice, Payment, CreditLine, …
│   │   ├── schemas/        Pydantic I/O por dominio
│   │   ├── services/       cart, inventory, transfer, pricing, payment_gateway,
│   │   │                   siat, reports
│   │   └── seed.py         datos demo idempotentes
│   ├── alembic/versions/
│   └── requirements.txt
├── frontend/               React + Vite + Tailwind
│   └── src/
│       ├── pages/          Login, Register, Dashboard, Catalog, ProductDetail,
│       │                   Cart, MyOrders, B2BApprovals, Inventory, Transfers,
│       │                   ScanReceive, Invoices, Reports, AdminUsers,
│       │                   AdminProducts
│       ├── components/     Layout, Charts (Recharts), Icons, KpiCard, …
│       ├── contexts/       AuthContext, ToastContext
│       └── lib/            api.ts (axios + JWT), format.ts, types.ts
├── docs/                   arquitectura, setup, plan AUP
├── docker-compose.yml
└── Makefile
```

## Cuentas demo

Pobladas por `python -m app.seed` (idempotente):

| Rol         | Email              | Password   | Notas                                          |
|-------------|--------------------|------------|------------------------------------------------|
| ADMIN       | admin@idm.bo       | admin123   | Acceso total. Dueño del seller raíz IDM        |
| CLIENT_B2B  | taller@demo.bo     | demo1234   | "Taller Mecánico Demo S.R.L." · línea 10.000 BOB |
| SELLER      | seller1@demo.bo    | seller123  | Lubricantes Bolivia SRL (Cochabamba, APPROVED) |
| SELLER      | seller2@demo.bo    | seller123  | Repuestos Andinos S.A. (Santa Cruz, APPROVED)  |
| CLIENT_B2C  | (registrate vos)   | —          | `POST /api/v1/auth/register` o `/register` en la UI |
| SELLER nuevo | (registrate vos)  | —          | `POST /api/v1/sellers/register` o `/registro-empresa` (queda PENDING hasta aprobación) |

Datos seed adicionales:
- **Empresas (sellers)** IDM S.A. (id=1, raíz), Lubricantes Bolivia SRL, Repuestos Andinos S.A.
- **Almacenes IDM** LP-01 (La Paz), CBB-01 (Cochabamba), SCZ-01 (Santa Cruz). Cada seller adicional tiene 1 almacén propio.
- **Productos** REP-0001 (filtro Hilux Bs. 85), LUB-0001 (Mobil 1 5W-30 Bs. 320), VEH-0001 (Hilux 2026 Bs. 245.000) bajo IDM + 2 productos por cada seller adicional con stock distribuido y `min_stock=5`.

---

## Quickstart

Requisitos: **Docker** + **Make** + **Node 20** (para el frontend).

```bash
git clone <url>
cd idm-ecommerce

make reset       # build + migrate + seed (todo en uno desde cero)

cd frontend
npm install
npm run dev      # Vite en :5173 con proxy /api → :8000
```

- API:        <http://localhost:8000>
- Swagger:    <http://localhost:8000/docs>
- Frontend:   <http://localhost:5173>

---

## Para correr esto en otra máquina

Guía paso a paso para alguien que clona el repo por primera vez.

### 1. Requisitos previos

- **Docker** + **Docker Compose** (Docker Desktop ya los incluye)
- **Make** (`sudo apt install make` en Ubuntu; en Windows usar WSL)
- **Node 20+** y **npm**

### 2. Clonar y levantar todo

```bash
git clone <url-del-repo>
cd idm-ecommerce

# Backend + Postgres + migraciones + seed (todo en uno)
make reset

# En otra terminal: frontend
cd frontend
npm install
npm run dev
```

Eso deja corriendo:

| Servicio  | URL                          |
|-----------|------------------------------|
| API       | http://localhost:8000        |
| Swagger   | http://localhost:8000/docs   |
| Frontend  | http://localhost:5173        |

### 3. Qué hace `make reset`

1. `docker compose down -v` — borra el volumen previo de Postgres.
2. `docker compose up --build -d` — levanta `db` (Postgres 16) + `backend` (FastAPI con `--reload`).
3. `alembic upgrade head` — corre todas las migraciones.
4. `python app/seed.py` — carga los datos demo (usuarios, sellers, productos, almacenes).

### 4. Login con cuentas demo

Las credenciales de la tabla de [Cuentas demo](#cuentas-demo) (`admin@idm.bo / admin123`, etc.) ya quedan creadas tras el seed.

### 5. Día a día

```bash
make up        # levantar containers sin rebuild
make down      # apagar (preserva datos)
make logs      # tail del backend
make migrate   # aplicar migraciones nuevas
make seed      # re-correr seed (idempotente)
make shell     # bash dentro del container backend
```

Para frenar el frontend: `Ctrl+C` en la terminal del `npm run dev` (o `pkill -f vite`).

### 6. Troubleshooting

- **Puerto 5432, 8000 o 5173 ocupado** → matar el proceso que los usa o cambiar el mapping en `docker-compose.yml` / `vite.config.ts`.
- **`make: command not found`** → instalar make (`sudo apt install make`) o correr los comandos a mano (`docker compose up --build -d`, `docker compose exec backend alembic upgrade head`, `docker compose exec backend python app/seed.py`).
- **El frontend carga pero no se loguea** → verificar que el backend esté arriba (`make logs`) y que el proxy de Vite apunte a `http://localhost:8000` (ya viene configurado en `vite.config.ts`).
- **Quiero empezar limpio otra vez** → `make reset` borra el volumen y rehace todo.

### Comandos Make

| Comando        | Descripción                                              |
|----------------|----------------------------------------------------------|
| `make build`   | Construye imágenes y levanta contenedores                |
| `make up`      | Levanta contenedores sin reconstruir                     |
| `make down`    | Apaga contenedores (preserva volumen)                    |
| `make migrate` | `alembic upgrade head`                                   |
| `make seed`    | `python -m app.seed`                                     |
| `make reset`   | `down -v` + build + migrate + seed                       |
| `make logs`    | Logs del backend en tiempo real                          |
| `make shell`   | Bash dentro del contenedor backend                       |

---

## Funcionalidades implementadas

Mapeo de los **casos de uso (CUE)** del documento de Taller a la implementación.

### CUE-01 — Compra B2C con pasarela
- `Catalog` → `Cart` con reserva temporal de stock (TTL **15 min**, configurable en `app/services/cart.py:CART_TTL`).
- `Checkout` con pasarela mock; rechaza referencias que contengan `FAIL` (flujo A2).
- `cleanup-expired` libera reservas abandonadas (CUE-01 A1).
- Auto-emisión SIAT en pago exitoso → factura visible en `MyOrders` con descarga **PDF** y **XML**.

### CUE-02 — Compra B2B a crédito
- Cliente B2B compra → orden queda **`PENDING_APPROVAL`** con stock reservado pero no consumido.
- Validación de saldo de crédito antes de aceptar el carrito (CUE-02 A1: bloqueo si crédito insuficiente).
- Ejecutivo/Admin aprueba en `/aprobaciones` → orden `CONFIRMED`, descuenta stock, suma a `CreditLine.balance`, **auto-emite factura SIAT**.
- Rechazo libera reservas y deja orden en `REJECTED`.

### CUE-03 — Stock consolidado nacional
- Inventario por sucursal con sumatoria nacional en `Inventory`.
- Bloqueo automático cuando `total_available == 0` → producto marcado "Agotado" y oculto del catálogo público.
- Alertas `LOW_STOCK` / `OUT_OF_STOCK` visibles en `/inventario` y panel admin.

### CUE-04 — Traspasos interdepartamentales
- Flujo: `REQUESTED → PICKING → IN_TRANSIT → RECEIVED`.
- `qr_token` aleatorio por traspaso. UI muestra **QR SVG** imprimible (Nota de Remisión) en `/traspasos` → botón **Ver QR**.
- Recepción en destino vía `/recibir`: scanner de **cámara web** (`@yudiel/react-qr-scanner`) o pegado manual del token.
- Rechazo por **merma** (CUE-04 A1) da de baja del origen y notifica.

### CUE-05 — Facturación SIAT
- Generación de XML estructurado + firma simplificada (SHA-256).
- Mock de envío con **timeout 5s** (`SIAT_TIMEOUT_SECONDS`). Si timeout → factura queda `PENDING` (modo contingencia A1).
- Reintento masivo desde `/facturas → Reintentar contingencia` (admin only).
- **PDF A4** real generado con `fpdf2` con CUF, código de autorización y datos del emisor.
- Forzar contingencia para test: parámetro `force_fail=true` en `POST /api/v1/invoices`.

### CUE-06 — Admin / reportes
- Dashboard `/` con KPIs y mini-spark de tendencia diaria.
- `/reportes` con filtro de fechas, gráficas Recharts (barra por sucursal, pie por canal, área de tendencia diaria, bar horizontal de top productos, stack in/out/ajuste por almacén) y export CSV.
- RBAC en cada endpoint vía `require_roles(...)`.

### CUE-03 (POS) — Venta de mostrador
- Endpoint `POST /api/v1/pos/checkout` y página `/pos`.
- Vendedor (`ADMIN`/`SALES`/`WAREHOUSE_MANAGER`/`SELLER`) busca SKU, arma carrito local, captura NIT/CI del cliente, elige efectivo o tarjeta.
- Descuenta stock del almacén, emite **factura SIAT inmediata** (con fallback a contingencia) y entrega `invoice_number` + `CUF` para imprimir.
- Cross-seller bloqueado: el POS sólo vende productos del mismo seller que el almacén.

### Marketplace multi-empresa (extensión)
- `POST /sellers/register` (público) → crea `Seller` en estado `PENDING` + usuario rol `SELLER`.
- `/admin/empresas` permite aprobar, rechazar o suspender empresas.
- Productos y almacenes scoped por seller. Catálogo público (`GET /catalog/products`) sólo expone productos de sellers `APPROVED` y permite filtrar por `seller_id` o `seller_slug`.
- Carrito **single-seller**: el cliente no puede mezclar productos de distintas empresas en un mismo carrito.
- SELLER edita sus propios productos vía `/empresa/productos`, ve ventas en `/empresa/ventas`, aprueba sus propias órdenes B2B y administra inventario en `/inventario` (scopeado).
- IDM S.A. es el seller raíz (`is_house=true`, `id=1`) y absorbe los productos/almacenes históricos.

---

## Roles y rutas (frontend)

| Ruta                  | Roles                                  | Pantalla                             |
|-----------------------|----------------------------------------|--------------------------------------|
| `/login`, `/register`, `/registro-empresa` | público                | Auth + registro de empresa vendedora |
| `/`                   | todos                                  | Dashboard                            |
| `/catalogo`, `/catalogo/:id` | todos                           | Catálogo + detalle producto (muestra empresa vendedora) |
| `/carrito`            | CLIENT_B2C, CLIENT_B2B                 | Carrito + checkout (single-seller)   |
| `/mis-ordenes`        | CLIENT_B2C, CLIENT_B2B                 | Histórico + descarga factura         |
| `/pos`                | ADMIN, SALES, WAREHOUSE_MANAGER, SELLER | POS de mostrador con SIAT directa   |
| `/aprobaciones`       | ADMIN, SALES, SELLER                   | Aprobación de órdenes B2B            |
| `/inventario`         | ADMIN, WAREHOUSE_MANAGER, SELLER       | Stock por almacén + ajustes + alertas (scoped por seller) |
| `/traspasos`          | ADMIN, WAREHOUSE_MANAGER               | CRUD de traspasos + Nota QR          |
| `/recibir`            | ADMIN, WAREHOUSE_MANAGER               | Scanner de cámara + manual           |
| `/facturas`           | ADMIN, SALES, WAREHOUSE_MANAGER        | Listado SIAT + emitir + descargar    |
| `/reportes`           | ADMIN, SALES                           | Reportes + gráficas + CSV            |
| `/usuarios`           | ADMIN                                  | RBAC + alta B2B con CreditLine       |
| `/admin/productos`    | ADMIN                                  | CRUD productos IDM + categorías      |
| `/admin/empresas`     | ADMIN                                  | Aprobación/rechazo/suspensión de sellers |
| `/empresa`            | SELLER                                 | Dashboard de mi empresa (KPIs)       |
| `/empresa/productos`  | SELLER                                 | CRUD scoped a mis productos          |
| `/empresa/ventas`     | SELLER                                 | Histórico de órdenes de mi empresa   |

---

## Decisiones técnicas a respetar

- **bcrypt fijado a 4.1.3** (`backend/requirements.txt`) — bcrypt 5.x rompe passlib 1.7.4.
- **IVA Bolivia 13%** y moneda `BOB` por defecto. Precio incluye IVA (cálculo en `app/services/cart.py`: `subtotal * 0.13 / 1.13`).
- **Descuento mayorista B2B 12%** (`app/services/pricing.py:B2B_DISCOUNT_PCT`).
- **Tarifas de envío** fijas BOB: LP 25 / CBBA 40 / SCZ 55. Replicadas en `Cart.tsx`.
- **Reservas de carrito 15 min** (`CART_TTL`).
- **Mocks deterministas** para pasarela y SIAT — la pasarela rechaza si la referencia contiene `FAIL`; el SIAT acepta `force_fail=true` para forzar contingencia.
- **`SELECT ... FOR UPDATE`** obligatorio en cada mutación de `inventory.quantity` o `inventory.reserved`.
- **`PENDING_APPROVAL` B2B** mantiene reserva activa pero no consume stock; el consumo ocurre solo al aprobar.

Más detalle en `docs/arquitectura.md` y `docs/local-setup.md`.

---

## Probar los flujos end-to-end

Recorrida sugerida tras `make reset` + `npm run dev`:

1. **B2C** Registrate en `/register` → catálogo → agrega filtro y aceite → carrito → checkout LP/CBBA/SCZ → factura PDF/XML en *Mis órdenes*.
2. **B2B** Login `taller@demo.bo` → carrito → checkout-credit → orden `PENDING_APPROVAL`. Como admin → `/aprobaciones` → aprobar → factura emitida.
3. **B2B A1** Llenar carrito por > 10.000 BOB con `taller@demo.bo` → checkout bloqueado por crédito.
4. **Inventario** `/inventario` ajuste de stock; bajar a 3 → alerta LOW_STOCK; bajar a 0 → producto desaparece del catálogo público.
5. **Traspasos** `/traspasos` LP → CBBA con producto en stock → `Iniciar picking` → `Despachar` (`IN_TRANSIT`). Click **Ver QR** → imprimir o copiar token.
6. **Recibir** `/recibir` → **Activar cámara** y escanear el QR (otra ventana/dispositivo), o pegar el token → suma al destino y queda `RECEIVED`.
7. **Contingencia SIAT** `/facturas` → emitir con order_id manual + checkbox **Forzar contingencia** → queda `PENDING`. Botón **Reintentar contingencia** la levanta.
8. **Reportes** `/reportes` con/sin filtros de fecha; export CSV.
9. **Productos** `/admin/productos` alta de categoría + producto → aparece en `/catalogo` (si activo).

---

## Screenshots

Para la defensa, dejá imágenes en `docs/screenshots/` y referenciálas acá:

```markdown
![Login](docs/screenshots/login.png)
![Dashboard staff](docs/screenshots/dashboard.png)
![Catálogo público](docs/screenshots/catalog.png)
![Checkout B2C](docs/screenshots/checkout.png)
![Aprobación B2B](docs/screenshots/b2b-approvals.png)
![Inventario + alertas](docs/screenshots/inventory.png)
![Nueva traspaso + QR](docs/screenshots/transfer-qr.png)
![Recibir QR (cámara)](docs/screenshots/scan-receive.png)
![Reportes con gráficas](docs/screenshots/reports.png)
![Factura PDF SIAT](docs/screenshots/invoice-pdf.png)
```

---

## Out of scope explícito

Agendamiento de talleres · contabilidad ERP · apps móviles nativas · tracking GPS última milla.

## Metodología

Proceso Unificado Ágil (AUP) · 16 semanas · ISO/IEC 25010. Ver `docs/plan.md`.
