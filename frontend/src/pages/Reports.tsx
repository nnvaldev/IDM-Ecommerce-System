import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type {
  DailySales,
  MovementReport,
  SalesByChannel,
  SalesByWarehouse,
  TopProduct,
} from "@/lib/types";
import { formatBOB, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { FullPageSpinner } from "@/components/Spinner";
import {
  ChannelPie,
  ChartCard,
  DailyRevenueArea,
  MovementsBar,
  RevenueByWarehouseBar,
  TopProductsBar,
} from "@/components/Charts";

const TOKEN_KEY = "idm_token";

export default function Reports() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [byWh, setByWh] = useState<SalesByWarehouse[]>([]);
  const [byCh, setByCh] = useState<SalesByChannel[]>([]);
  const [daily, setDaily] = useState<DailySales[]>([]);
  const [top, setTop] = useState<TopProduct[]>([]);
  const [movements, setMovements] = useState<MovementReport[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (from) params.date_from = from;
    if (to) params.date_to = to;
    const [w, c, d, t, m] = await Promise.all([
      api.get<SalesByWarehouse[]>("/reports/sales/by-warehouse", { params }),
      api.get<SalesByChannel[]>("/reports/sales/by-channel", { params }),
      api.get<DailySales[]>("/reports/sales/daily", { params }),
      api.get<TopProduct[]>("/reports/top-products", { params }),
      api.get<MovementReport[]>("/reports/movements", { params }),
    ]);
    setByWh(w.data);
    setByCh(c.data);
    setDaily(d.data);
    setTop(t.data);
    setMovements(m.data);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  const downloadCsv = async (path: string, filename: string) => {
    const url = `/api/v1${path}`;
    const token = localStorage.getItem(TOKEN_KEY);
    const params = new URLSearchParams();
    if (from) params.append("date_from", from);
    if (to) params.append("date_to", to);
    const full = params.toString() ? `${url}?${params.toString()}` : url;
    const res = await fetch(full, {
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = obj;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(obj);
  };

  const totalRevenue = useMemo(
    () => byWh.reduce((acc, r) => acc + r.revenue_bob, 0),
    [byWh]
  );
  const totalUnits = useMemo(
    () => byWh.reduce((acc, r) => acc + r.units, 0),
    [byWh]
  );

  const byWhChart = useMemo(
    () =>
      byWh.map((r) => ({
        code: r.warehouse_code,
        city: r.city.replaceAll("_", " "),
        revenue_bob: r.revenue_bob,
        units: r.units,
      })),
    [byWh]
  );

  const dailyChart = useMemo(
    () =>
      daily
        .filter((d) => d.day)
        .map((d) => ({
          day: String(d.day),
          revenue_bob: d.revenue_bob,
          orders: d.orders,
        })),
    [daily]
  );

  if (loading) return <FullPageSpinner label="Cargando reportes…" />;

  return (
    <div>
      <PageHeader
        title="Reportes inteligentes"
        description="Filtros por fecha · agregaciones por sucursal y canal · gráficas + export CSV."
      />

      <div className="card mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <label>
            <span className="label">Desde</span>
            <input
              type="date"
              className="input mt-1"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            <span className="label">Hasta</span>
            <input
              type="date"
              className="input mt-1"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button onClick={reload} className="btn-primary">
            Aplicar
          </button>
          <button
            onClick={() => {
              setFrom("");
              setTo("");
              setTimeout(reload, 0);
            }}
            className="btn-ghost"
          >
            Limpiar
          </button>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() =>
                downloadCsv(
                  "/reports/export/sales-by-warehouse.csv",
                  "ventas-por-sucursal.csv"
                )
              }
              className="btn-ghost"
            >
              CSV ventas por sucursal
            </button>
            <button
              onClick={() =>
                downloadCsv(
                  "/reports/export/top-products.csv",
                  "top-products.csv"
                )
              }
              className="btn-ghost"
            >
              CSV top productos
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <SummaryPill label="Ingresos totales" value={formatBOB(totalRevenue)} />
          <SummaryPill label="Unidades vendidas" value={formatNumber(totalUnits)} />
          <SummaryPill label="Sucursales activas" value={byWh.length.toString()} />
          <SummaryPill
            label="Días con ventas"
            value={dailyChart.length.toString()}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title="Ingresos por sucursal"
          hint="Comparativo del eje troncal: La Paz · Cochabamba · Santa Cruz."
          empty={byWhChart.length === 0}
        >
          <RevenueByWarehouseBar data={byWhChart} />
          <table className="table mt-3 text-xs">
            <thead>
              <tr>
                <th>Sucursal</th>
                <th>Ciudad</th>
                <th className="text-right">Unidades</th>
                <th className="text-right">Ingresos</th>
              </tr>
            </thead>
            <tbody>
              {byWh.map((r) => (
                <tr key={r.warehouse_id}>
                  <td className="font-mono">{r.warehouse_code}</td>
                  <td>{r.city.replaceAll("_", " ")}</td>
                  <td className="text-right">{r.units}</td>
                  <td className="text-right font-semibold">
                    {formatBOB(r.revenue_bob)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>

        <ChartCard
          title="Ingresos por canal"
          hint="WEB minorista · B2B_PORTAL corporativo · POS presencial."
          empty={byCh.length === 0}
        >
          <ChannelPie data={byCh} />
          <table className="table mt-3 text-xs">
            <thead>
              <tr>
                <th>Canal</th>
                <th className="text-right">Órdenes</th>
                <th className="text-right">Ingresos</th>
              </tr>
            </thead>
            <tbody>
              {byCh.map((r) => (
                <tr key={r.channel}>
                  <td>{r.channel}</td>
                  <td className="text-right">{r.orders}</td>
                  <td className="text-right font-semibold">
                    {formatBOB(r.revenue_bob)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>

        <ChartCard
          title="Tendencia diaria de ingresos"
          hint="Serie temporal de ventas confirmadas / pagadas."
          full
          empty={dailyChart.length === 0}
        >
          <DailyRevenueArea data={dailyChart} />
        </ChartCard>

        <ChartCard
          title="Top productos por ingresos"
          hint="Ranking de SKUs con mayor facturación en el período."
          empty={top.length === 0}
        >
          <TopProductsBar
            data={top.map((t) => ({
              name: t.name,
              sku: t.sku,
              units: t.units,
              revenue_bob: t.revenue_bob,
            }))}
          />
          <table className="table mt-3 text-xs">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th className="text-right">Unid.</th>
                <th className="text-right">Ingresos</th>
              </tr>
            </thead>
            <tbody>
              {top.map((r) => (
                <tr key={r.product_id}>
                  <td className="font-mono">{r.sku}</td>
                  <td className="max-w-[220px] truncate">{r.name}</td>
                  <td className="text-right">{formatNumber(r.units)}</td>
                  <td className="text-right font-semibold">
                    {formatBOB(r.revenue_bob)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>

        <ChartCard
          title="Movimientos de almacén"
          hint="Entradas vs salidas vs ajustes por sucursal."
          empty={movements.length === 0}
        >
          <MovementsBar data={movements} />
          <table className="table mt-3 text-xs">
            <thead>
              <tr>
                <th>Almacén</th>
                <th>Tipo</th>
                <th className="text-right">Operaciones</th>
                <th className="text-right">Unidades</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m, i) => (
                <tr key={i}>
                  <td>#{m.warehouse_id}</td>
                  <td className="text-xs uppercase">{m.movement_type}</td>
                  <td className="text-right">{m.operations}</td>
                  <td className="text-right">{m.units}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
      </div>
    </div>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-ink-50 px-3 py-2 ring-1 ring-ink-200">
      <div className="text-[10px] uppercase tracking-wide text-ink-500">
        {label}
      </div>
      <div className="text-sm font-semibold text-ink-900">{value}</div>
    </div>
  );
}
