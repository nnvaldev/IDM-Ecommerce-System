import { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBOB, formatNumber } from "@/lib/format";

export const CHART_PALETTE = [
  "#2543e0", // brand-600
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#0ea5e9", // sky-500
];

const AXIS_STYLE = { fontSize: 11, fill: "#64748b" } as const;
const GRID_STYLE = { stroke: "#e2e8f0", strokeDasharray: "3 3" } as const;

interface TooltipEntry {
  color?: string;
  name?: string | number;
  value?: number | string;
  dataKey?: string | number;
}

interface MoneyTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
}

function MoneyTooltip({ active, payload, label }: MoneyTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 shadow-card">
      {label !== undefined && (
        <div className="text-[11px] uppercase tracking-wide text-ink-500">
          {label}
        </div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="text-sm">
          <span
            className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
            style={{ background: p.color }}
          />
          <span className="text-ink-600">{p.name}: </span>
          <span className="font-semibold text-ink-900">
            {p.dataKey === "revenue_bob" || p.dataKey === "revenue"
              ? formatBOB(Number(p.value))
              : formatNumber(Number(p.value))}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ChartCard({
  title,
  hint,
  children,
  full,
  empty,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  full?: boolean;
  empty?: boolean;
}) {
  return (
    <div
      className={
        "card-section overflow-hidden" + (full ? " lg:col-span-2" : "")
      }
    >
      <div className="border-b border-ink-200 bg-ink-50 px-4 py-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-600">
          {title}
        </div>
        {hint && <div className="text-[11px] text-ink-500">{hint}</div>}
      </div>
      <div className="p-4">
        {empty ? (
          <div className="grid h-48 place-items-center text-sm text-ink-400">
            Sin datos para el período
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export function RevenueByWarehouseBar({
  data,
}: {
  data: { code: string; city: string; revenue_bob: number; units: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey="code" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
        <YAxis
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `Bs.${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip content={<MoneyTooltip />} cursor={{ fill: "#f1f5f9" }} />
        <Bar
          dataKey="revenue_bob"
          name="Ingresos"
          radius={[6, 6, 0, 0]}
          fill={CHART_PALETTE[0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ChannelPie({
  data,
}: {
  data: { channel: string; revenue_bob: number; orders: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="revenue_bob"
          nameKey="channel"
          innerRadius={55}
          outerRadius={95}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip content={<MoneyTooltip />} />
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: 12, color: "#475569" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function DailyRevenueArea({
  data,
}: {
  data: { day: string; revenue_bob: number; orders: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
        <defs>
          <linearGradient id="grad-revenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_PALETTE[0]} stopOpacity={0.4} />
            <stop offset="100%" stopColor={CHART_PALETTE[0]} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis
          dataKey="day"
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => (v ? String(v).slice(5) : "")}
        />
        <YAxis
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `Bs.${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip content={<MoneyTooltip />} />
        <Area
          type="monotone"
          dataKey="revenue_bob"
          name="Ingresos"
          stroke={CHART_PALETTE[0]}
          strokeWidth={2}
          fill="url(#grad-revenue)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function TopProductsBar({
  data,
}: {
  data: { name: string; sku: string; units: number; revenue_bob: number }[];
}) {
  const top = [...data].slice(0, 8).map((d) => ({
    ...d,
    label: `${d.sku}`,
  }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(260, top.length * 32 + 40)}>
      <BarChart
        layout="vertical"
        data={top}
        margin={{ left: 24, right: 24, top: 8, bottom: 8 }}
      >
        <CartesianGrid {...GRID_STYLE} horizontal={false} />
        <XAxis
          type="number"
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `Bs.${(v / 1000).toFixed(0)}k`}
        />
        <YAxis
          dataKey="label"
          type="category"
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          width={80}
        />
        <Tooltip content={<MoneyTooltip />} cursor={{ fill: "#f1f5f9" }} />
        <Bar
          dataKey="revenue_bob"
          name="Ingresos"
          radius={[0, 6, 6, 0]}
          fill={CHART_PALETTE[3]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MovementsBar({
  data,
}: {
  data: { warehouse_id: number; movement_type: string; units: number }[];
}) {
  const grouped = new Map<
    number,
    { warehouse_id: number; IN: number; OUT: number; ADJUSTMENT: number }
  >();
  for (const r of data) {
    const cur = grouped.get(r.warehouse_id) ?? {
      warehouse_id: r.warehouse_id,
      IN: 0,
      OUT: 0,
      ADJUSTMENT: 0,
    };
    const t = r.movement_type as keyof typeof cur;
    if (t === "IN" || t === "OUT" || t === "ADJUSTMENT") {
      cur[t] += r.units;
    }
    grouped.set(r.warehouse_id, cur);
  }
  const rows = [...grouped.values()].map((r) => ({
    ...r,
    label: `WH-${r.warehouse_id}`,
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey="label" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} />
        <Tooltip content={<MoneyTooltip />} cursor={{ fill: "#f1f5f9" }} />
        <Legend wrapperStyle={{ fontSize: 12, color: "#475569" }} iconType="circle" />
        <Bar dataKey="IN" stackId="a" fill={CHART_PALETTE[1]} name="Entradas" />
        <Bar dataKey="OUT" stackId="a" fill={CHART_PALETTE[4]} name="Salidas" />
        <Bar
          dataKey="ADJUSTMENT"
          stackId="a"
          fill={CHART_PALETTE[2]}
          name="Ajustes"
          radius={[6, 6, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MiniRevenueSpark({
  data,
}: {
  data: { day: string; revenue_bob: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={70}>
      <AreaChart data={data} margin={{ left: 0, right: 0, top: 4, bottom: 4 }}>
        <defs>
          <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_PALETTE[0]} stopOpacity={0.5} />
            <stop offset="100%" stopColor={CHART_PALETTE[0]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip
          contentStyle={{ fontSize: 11 }}
          formatter={(v) => formatBOB(Number(v))}
          labelFormatter={(l) => (l ? String(l).slice(5) : "")}
        />
        <Area
          type="monotone"
          dataKey="revenue_bob"
          stroke={CHART_PALETTE[0]}
          strokeWidth={2}
          fill="url(#spark-grad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
