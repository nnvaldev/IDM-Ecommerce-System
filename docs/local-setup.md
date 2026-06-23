# Arranque local paso a paso

Requisitos: Docker, Python 3.12, Node 20. Si tu distro no los tiene, instalarlos primero.

## 1. Base de datos (PostgreSQL 16 en Docker)

Desde la raíz del repo:

```bash
docker compose up -d db
docker compose ps       # → "idm_db" debería estar "healthy"
```

Esto deja Postgres escuchando en `localhost:5432` con:
- user: `idm`
- password: `idm_dev_password`
- db: `idm_ecommerce`

## 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env     # ya viene con DATABASE_URL apuntando al Postgres de Docker
```

### Primera migración (autogenerada a partir de los modelos)

```bash
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```

Revisa el archivo generado en `backend/alembic/versions/` antes de aplicarlo —
Alembic no es infalible con enums y JSONB, pero el schema actual es directo.

### Seed (usuarios, almacenes, catálogo demo)

```bash
python -m app.seed
```

Output esperado:
```
Seed completado.
  Admin: admin@idm.bo / admin123
  B2B:   taller@demo.bo / demo1234
```

### Arrancar la API

```bash
uvicorn app.main:app --reload
```

- API: <http://localhost:8000>
- Docs interactivas (Swagger): <http://localhost:8000/docs>
- Health: <http://localhost:8000/api/v1/health>
- Health DB: <http://localhost:8000/api/v1/health/db>

### Probar el login por curl

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -d 'username=admin@idm.bo&password=admin123' \
  -H 'Content-Type: application/x-www-form-urlencoded'
```

Devuelve `{"access_token": "...", "token_type": "bearer", "expires_in": 3600}`.

```bash
TOKEN="..."  # el valor devuelto arriba
curl http://localhost:8000/api/v1/auth/me -H "Authorization: Bearer $TOKEN"
```

## 3. Frontend

En otra terminal:

```bash
cd frontend
npm install
npm run dev
```

Abre <http://localhost:5173>. El formulario ya viene precargado con `admin@idm.bo / admin123` para que solo hagas click en Ingresar.

Vite corre un proxy: todo lo que empieza con `/api` se reenvía a `http://localhost:8000`, así que no hay configuración de CORS en desarrollo.

## Cheatsheet de tareas comunes

```bash
# Ver los logs del Postgres
docker compose logs -f db

# Abrir psql en el Postgres de Docker
docker compose exec db psql -U idm -d idm_ecommerce

# Borrar todo y empezar de cero (ojo, perdés datos)
docker compose down -v

# Regenerar la migración tras cambiar un modelo
cd backend && alembic revision --autogenerate -m "mi cambio"
alembic upgrade head

# Correr backend y frontend con todo en Docker (solo backend está dockerizado hoy)
docker compose up -d        # db + backend
```

## Problemas típicos

- **`alembic upgrade head` falla por tipos enum existentes:** Postgres conserva los tipos `ENUM` entre migraciones. Si modificás un enum, hace falta escribir manualmente `op.execute("ALTER TYPE ... ADD VALUE ...")`.
- **`asyncpg: role "idm" does not exist`:** el contenedor de Postgres se levantó con otras credenciales en un volumen previo. Corré `docker compose down -v` y volvé a levantar.
- **`bcrypt version warning` al hashear:** es un warning benigno de passlib con bcrypt 4.x; ignora.
- **`Address already in use` al levantar uvicorn:** hay otro uvicorn corriendo (`pkill -f uvicorn` o usá `--port 8001`).
