# Frontend — IDM E-Commerce

React 18 + Vite 5 + TypeScript estricto + Tailwind 3. Proxy de Vite reenvía `/api/*` al backend FastAPI en `http://localhost:8000` (sin CORS en dev).

## Arrancar

```bash
npm install
npm run dev
```

<http://localhost:5173>. Login demo (post `make seed`):

- **admin@idm.bo / admin123** — acceso total
- **taller@demo.bo / demo1234** — cliente B2B con línea de crédito 10.000 BOB
- B2C: registrate en `/register`

## Estructura

```
src/
├── main.tsx                Entry + AuthProvider + ToastProvider
├── App.tsx                 Routes (con ProtectedRoute + RoleGuard)
├── pages/
│   ├── Login.tsx, Register.tsx
│   ├── Dashboard.tsx       KPIs + mini-spark + alertas
│   ├── Catalog.tsx, ProductDetail.tsx
│   ├── Cart.tsx            Carrito + checkout B2C/B2B
│   ├── MyOrders.tsx        Histórico + descarga PDF/XML factura
│   ├── B2BApprovals.tsx    Cola PENDING_APPROVAL
│   ├── Inventory.tsx       Stock por almacén + ajuste + alertas
│   ├── Transfers.tsx       Traspasos + modal QR (Nota de Remisión)
│   ├── ScanReceive.tsx     Cámara QR + manual
│   ├── Invoices.tsx        Lista SIAT + emitir + descarga
│   ├── Reports.tsx         Recharts: bar/pie/area/horizontal/stack + CSV
│   ├── AdminUsers.tsx      RBAC + alta B2B con CreditLine
│   └── AdminProducts.tsx   CRUD productos + categorías
├── components/
│   ├── Layout.tsx          Sidebar con NAV filtrado por rol
│   ├── ProtectedRoute.tsx, RoleGuard.tsx
│   ├── Charts.tsx          Wrappers Recharts (paleta + tooltip BOB)
│   ├── Icons.tsx           Iconos SVG inline (sin libs externas)
│   ├── KpiCard.tsx, PageHeader.tsx, EmptyState.tsx, Spinner.tsx, StatusBadge.tsx
├── contexts/
│   ├── AuthContext.tsx     login / logout / user (JWT en localStorage)
│   └── ToastContext.tsx
└── lib/
    ├── api.ts              axios + JWT interceptor + redirect 401
    ├── format.ts           formatBOB, formatNumber, formatDate, cityLabel
    └── types.ts            tipos del dominio (Product, Order, Invoice, …)
```

## Scripts

```bash
npm run dev        # Vite dev server :5173
npm run build      # tsc -b && vite build → dist/
npm run preview    # servir el build
npm run lint       # eslint .
npx tsc --noEmit   # type-check sin emit
```

## Convenciones

- Path alias `@/*` → `src/*` (configurado en `vite.config.ts` y `tsconfig.json`).
- Botones: clases utility `btn-primary`, `btn-ghost`, `input`, `card`, `card-section`, `label`, `table`, `badge` definidas en `src/index.css`.
- Paleta `brand-*` (azul) + `ink-*` (escala neutra) en `tailwind.config.js`.
- Estados de carga inicial → `<FullPageSpinner>`; recargas posteriores → indicador inline (`refreshing`) sin tapar la pantalla.
