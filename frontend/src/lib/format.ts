export function formatBOB(amount: number | string | null | undefined): string {
  const n = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
    minimumFractionDigits: 2,
  }).format(n);
}

export function formatNumber(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("es-BO").format(v);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-BO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  const diff = (d - Date.now()) / 1000;
  const fmt = new Intl.RelativeTimeFormat("es-BO", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return fmt.format(Math.round(diff), "second");
  if (abs < 3600) return fmt.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return fmt.format(Math.round(diff / 3600), "hour");
  return fmt.format(Math.round(diff / 86400), "day");
}

export function cityLabel(code: string): string {
  switch (code?.toUpperCase()) {
    case "LA_PAZ":
      return "La Paz";
    case "COCHABAMBA":
      return "Cochabamba";
    case "SANTA_CRUZ":
      return "Santa Cruz";
    default:
      return code || "—";
  }
}
