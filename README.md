# IDM E-Commerce

Sistema de Administración y Control E-Commerce Multidiversificador para IDM S.A.

Plataforma unificada de gestión de inventarios heterogéneos (repuestos, lubricantes y vehículos) que integra ventas al por menor (B2C) y mayoristas (B2B), cumpliendo con la normativa tributaria boliviana (SIAT).

## Stack

- **Backend:** Python 3.12 + FastAPI + SQLAlchemy 2.0 (async) + Pydantic v2
- **Base de datos:** PostgreSQL 16
- **Migraciones:** Alembic
- **Auth:** JWT (con RBAC: admin, warehouse_manager, sales, client_b2b, client_b2c)
- **Frontend:** (pendiente) React + Vite + TypeScript
- **Infraestructura:** Microsoft Azure (Linux)
- **Integraciones:** SIAT (facturación electrónica), pasarelas QR

## Estructura

```
idm-ecommerce/
├── backend/          # FastAPI + SQLAlchemy + Alembic
├── frontend/         # (próximamente) React + Vite
├── docs/             # Arquitectura, decisiones, plan AUP
├── scripts/          # Utilidades de desarrollo
└── docker-compose.yml
```

## Quickstart

```bash
# 1. Levantar PostgreSQL
docker compose up -d db

# 2. Instalar dependencias del backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 3. Copiar variables de entorno
cp .env.example .env

# 4. Ejecutar migraciones
alembic upgrade head

# 5. Levantar API
uvicorn app.main:app --reload
```

API: <http://localhost:8000> · Docs: <http://localhost:8000/docs>

## Metodología

Proceso Unificado Ágil (AUP) · 16 semanas · ISO/IEC 25010.

Ver `docs/plan.md` para el plan por fases.
