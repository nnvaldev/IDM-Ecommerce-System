import { useAuth } from "@/contexts/AuthContext";

export default function Dashboard() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold text-slate-900">IDM E-Commerce</h1>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-600">
              {user?.full_name}{" "}
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {user?.role}
              </span>
            </span>
            <button
              onClick={logout}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card title="Inventario multi-almacén" hint="La Paz · Cochabamba · Santa Cruz" />
          <Card title="Productos" hint="Repuestos · Lubricantes · Vehículos" />
          <Card title="Órdenes" hint="B2C y B2B" />
          <Card title="Facturación SIAT" hint="Facturas electrónicas y Notas de Remisión" />
          <Card title="Pagos" hint="QR / Transferencia / Crédito" />
          <Card title="Usuarios & Roles" hint="RBAC" />
        </div>

        <p className="mt-8 text-sm text-slate-500">
          Esta es la base del panel. Los módulos se conectan a medida que los
          endpoints están disponibles.
        </p>
      </main>
    </div>
  );
}

function Card({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
