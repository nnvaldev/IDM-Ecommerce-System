import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Spinner } from "@/components/Spinner";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { formatBOB, formatDate } from "@/lib/format";
import type { Order, OrderStatus } from "@/lib/types";

const STATUS_ORDER: (OrderStatus | "ALL")[] = [
  "ALL",
  "PENDING_APPROVAL",
  "PAID",
  "CONFIRMED",
  "REJECTED",
  "CANCELLED",
];

export default function SellerOrders() {
  const [filter, setFilter] = useState<OrderStatus | "ALL">("ALL");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params = filter === "ALL" ? {} : { status: filter };
      const { data } = await api.get<Order[]>("/sellers/me/orders", { params });
      setOrders(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <Layout>
      <PageHeader
        title="Ventas de mi empresa"
        description="Historial de órdenes que clientes hicieron de mis productos."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={
              "rounded-full px-3 py-1 text-xs font-medium transition " +
              (filter === s
                ? "bg-brand-600 text-white"
                : "bg-ink-100 text-ink-600 hover:bg-ink-200")
            }
          >
            {s === "ALL" ? "Todas" : s}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <EmptyState title="Sin órdenes" description="Cuando un cliente compre tus productos aparecerá acá." />
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-ink-200">
          <table className="min-w-full divide-y divide-ink-200 text-sm">
            <thead className="bg-ink-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <th className="px-4 py-3">Orden</th>
                <th className="px-4 py-3">Canal</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Factura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs">{o.order_number}</div>
                    <div className="text-xs text-ink-500">
                      {formatDate((o as Order & { created_at?: string }).created_at ?? null)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs uppercase text-ink-600">{o.channel}</td>
                  <td className="px-4 py-3 text-xs">{o.items.length}</td>
                  <td className="px-4 py-3">
                    <StatusBadge value={o.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatBOB(o.total)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {o.invoice ? (
                      <span>
                        <span className="font-mono">{o.invoice.invoice_number}</span>
                        <span className="ml-2">
                          <StatusBadge value={o.invoice.status} />
                        </span>
                      </span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
