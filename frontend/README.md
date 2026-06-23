# Frontend — IDM E-Commerce

React 18 + Vite + TypeScript + Tailwind CSS. Usa el proxy de Vite para enviar `/api/*` al backend FastAPI en `http://localhost:8000`.

## Correr

```bash
npm install
npm run dev
```

Abre <http://localhost:5173>. El login de demo (después de correr el seed del backend) es `admin@idm.bo / admin123`.

## Estructura

```
src/
├── main.tsx                # Entry + providers
├── App.tsx                 # Rutas
├── pages/                  # Login, Dashboard (y futuras)
├── components/             # ProtectedRoute, etc.
├── contexts/AuthContext    # Estado de auth + JWT
└── lib/api.ts              # Axios con interceptor JWT
```
