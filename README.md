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

Solo necesitas **Docker** y **Make** instalados.

```bash
git clone <url-del-repo>
cd idm-ecommerce

make build    # construye imágenes y levanta los contenedores
make migrate  # corre las migraciones de base de datos
make seed     # carga datos de prueba
```

O todo de un solo comando:

```bash
make reset
```

API: <http://localhost:8000> · Docs: <http://localhost:8000/docs>

## Comandos disponibles

| Comando | Descripción |
|---|---|
| `make build` | Construye las imágenes y levanta los contenedores |
| `make up` | Levanta los contenedores sin reconstruir |
| `make down` | Para los contenedores |
| `make logs` | Muestra los logs del backend en tiempo real |
| `make shell` | Abre una terminal dentro del contenedor |
| `make migrate` | Ejecuta las migraciones de Alembic |
| `make seed` | Carga los datos de prueba |
| `make reset` | Reinicia todo desde cero (borra la DB y vuelve a levantar) |

## Metodología

Proceso Unificado Ágil (AUP) · 16 semanas · ISO/IEC 25010.

Ver `docs/plan.md` para el plan por fases.
