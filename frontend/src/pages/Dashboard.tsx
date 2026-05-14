import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import type { DailySales, DashboardSummary, StockAlert } from "@/lib/types";
import { formatBOB, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { FullPageSpinner } from "@/components/Spinner";
import { MiniRevenueSpark } from "@/components/Charts";
import { useAuth } from "@/contexts/AuthContext";

export default function Dashboard() {
  const { user } = useAuth();
  const isStaff =
    user?.role === "ADMIN" ||
    user?.role === "SALES" ||
    user?.role === "WAREHOUSE_MANAGER";
  const isClient =
    user?.role === "CLIENT_B2C" || user?.role === "CLIENT_B2B";

  const [data, setData] = useState<DashboardSummary | null>(null);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [daily, setDaily] = useState<DailySales[]>([]);
  const [loading, setLoading] = useState(isStaff);

  useEffect(() => {
    if (!isStaff) return;
    setLoading(true);
    Promise.all([
      api.get<DashboardSummary>("/reports/dashboard"),
      user?.role === "CLIENT_B2C" || user?.role === "CLIENT_B2B"
        ? Promise.resolve({ data: [] as StockAlert[] })
        : api.get<StockAlert[]>("/inventory/alerts"),
      api.get<DailySales[]>("/reports/sales/daily"),
    ])
      .then(([d, a, daily]) => {
        setData(d.data);
        setAlerts(a.data);
        setDaily(daily.data.filter((row) => row.day));
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [isStaff, user?.role]);

  if (isClient) {
    return (
      <div>
        <PageHeader
          title={`Hola, ${user?.full_name?.split(" ")[0] ?? "cliente"}`}
          description="Tu panel de cliente IDM."
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Link
            to="/catalogo"
            className="card transition hover:shadow-card hover:ring-brand-200"
          >
            <h3 className="text-base font-semibold text-ink-900">
              Explorar catálogo
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              Repuestos · lubricantes · vehículos con stock en tiempo real.
            </p>
            <div className="mt-3 text-sm font-medium text-brand-700">
              Ver catálogo →
            </div>
          </Link>
          <Link
            to="/carrito"
            className="card transition hover:shadow-card hover:ring-brand-200"
          >
            <h3 className="text-base font-semibold text-ink-900">Mi carrito</h3>
            <p className="mt-1 text-sm text-ink-500">
              Reservas activas · finalizar compra.
            </p>
            <div className="mt-3 text-sm font-medium text-brand-700">
              Ir al carrito →
            </div>
          </Link>
          <Link
            to="/mis-ordenes"
            className="card transition hover:shadow-card hover:ring-brand-200"
          >
            <h3 className="text-base font-semibold text-ink-900">
              Mis órdenes
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              Historial y seguimiento de pedidos.
            </p>
            <div className="mt-3 text-sm font-medium text-brand-700">
              Ver órdenes →
            </div>
          </Link>
        </div>
      </div>
    );
  }

  if (loading) return <FullPageSpinner label="Cargando indicadores…" />;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Indicadores en tiempo real consolidados desde las sucursales del eje troncal."
      />

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Ingresos confirmados"
              value={formatBOB(data.revenue_bob)}
              hint={`${data.orders.paid} órdenes pagadas/confirmadas`}
              accent="emerald"
            />
            <KpiCard
              label="Órdenes pendientes B2B"
              value={data.orders.pending_b2b}
              hint="A revisar por Ejecutivo de Ventas"
              accent="amber"
            />
            <KpiCard
              label="Facturas autorizadas"
              value={data.invoices.authorized}
              hint={`${data.invoices.in_contingency} en contingencia`}
            />
            <KpiCard
              label="Stock total nacional"
              value={formatNumber(data.stock_units)}
              hint={`${data.products_active} SKUs activos · ${data.customers} clientes`}
            />
          </div>

          {daily.length > 0 && (
            <section className="mt-8">
              <div className="card-section overflow-hidden">
                <div className="flex items-center justify-between border-b border-ink-200 bg-ink-50 px-4 py-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-ink-600">
                      Tendencia diaria de ingresos
                    </div>
                    <div className="text-[11px] text-ink-500">
                      Últimos {daily.length} día(s) con ventas registradas.
                    </div>
                  </div>
                  <Link to="/reportes" className="text-xs font-medium text-brand-700 hover:underline">
                    Ver detalle →
                  </Link>
                </div>
                <div className="px-2 pt-2 pb-3">
                  <MiniRevenueSpark
                    data={daily.map((d) => ({
                      day: String(d.day),
                      revenue_bob: d.revenue_bob,
                    }))}
                  />
                </div>
              </div>
            </section>
          )}

          {alerts.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
                Alertas activas de inventario
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {alerts.map((a) => (
                  <div
                    key={a.product_id}
                    className="card flex items-start justify-between"
                  >
                    <div>
                      <div className="text-xs font-mono uppercase text-ink-400">
                        {a.sku}
                      </div>
                      <div className="text-sm font-semibold text-ink-900">
                        {a.name}
                      </div>
                      <div className="mt-1 text-xs text-ink-500">
                        Stock {a.total_quantity} · mín {a.min_stock_total}
                      </div>
                    </div>
                    <StatusBadge value={a.severity} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
