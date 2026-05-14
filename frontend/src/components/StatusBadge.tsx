import type {
  InvoiceStatus,
  OrderStatus,
  TransferStatus,
} from "@/lib/types";

type AnyStatus = OrderStatus | InvoiceStatus | TransferStatus | string;

const PALETTE: Record<string, string> = {
  // verde
  PAID: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CONFIRMED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  AUTHORIZED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  APPROVED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  RECEIVED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  DELIVERED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  SUSPENDED: "bg-ink-100 text-ink-600 ring-ink-200",
  // ámbar
  PENDING: "bg-amber-50 text-amber-800 ring-amber-200",
  PENDING_APPROVAL: "bg-amber-50 text-amber-800 ring-amber-200",
  PICKING: "bg-amber-50 text-amber-800 ring-amber-200",
  REQUESTED: "bg-amber-50 text-amber-800 ring-amber-200",
  IN_TRANSIT: "bg-blue-50 text-blue-700 ring-blue-200",
  // azul
  SHIPPED: "bg-blue-50 text-blue-700 ring-blue-200",
  DRAFT: "bg-ink-100 text-ink-700 ring-ink-200",
  // rojo
  REJECTED: "bg-red-50 text-red-700 ring-red-200",
  REJECTED_MERMA: "bg-red-50 text-red-700 ring-red-200",
  CANCELLED: "bg-red-50 text-red-700 ring-red-200",
  OUT_OF_STOCK: "bg-red-50 text-red-700 ring-red-200",
  LOW_STOCK: "bg-amber-50 text-amber-800 ring-amber-200",
};

const LABELS: Record<string, string> = {
  PENDING_APPROVAL: "Pendiente aprobación",
  REJECTED_MERMA: "Rechazado (merma)",
  IN_TRANSIT: "En tránsito",
  OUT_OF_STOCK: "Agotado",
  LOW_STOCK: "Stock bajo",
};

export function StatusBadge({ value }: { value: AnyStatus }) {
  const cls = PALETTE[value] ?? "bg-ink-100 text-ink-700 ring-ink-200";
  const label = LABELS[value] ?? value.replaceAll("_", " ").toLowerCase();
  return (
    <span className={`badge ring-1 ${cls}`}>
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      <span className="capitalize">{label}</span>
    </span>
  );
}
