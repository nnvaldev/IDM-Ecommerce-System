import { ReactNode } from "react";

export function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: "brand" | "emerald" | "amber" | "red";
}) {
  const cls =
    accent === "emerald"
      ? "from-emerald-500/10 to-transparent ring-emerald-200"
      : accent === "amber"
        ? "from-amber-500/10 to-transparent ring-amber-200"
        : accent === "red"
          ? "from-red-500/10 to-transparent ring-red-200"
          : "from-brand-500/10 to-transparent ring-brand-200";
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-gradient-to-br p-5 shadow-soft ring-1 ${cls}`}
    >
      <div className="absolute inset-0 bg-white/95" />
      <div className="relative">
        <div className="text-xs font-medium uppercase tracking-wide text-ink-500">
          {label}
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
          {value}
        </div>
        {hint && <div className="mt-1 text-xs text-ink-500">{hint}</div>}
      </div>
    </div>
  );
}
