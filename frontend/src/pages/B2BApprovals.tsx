import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Order } from "@/lib/types";
import { formatBOB } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { FullPageSpinner } from "@/components/Spinner";
import { EmptyState } from "@/components/EmptyState";
import { CheckIcon, XIcon } from "@/components/Icons";
import { useToast } from "@/contexts/ToastContext";

interface ApproveResponse {
  order: Order;
  new_credit_balance: number;
  new_credit_available: number;
}

export default function B2BApprovals() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const toast = useToast();

  const reload = async () => {
    setLoading(true);
    try {
      const r = await api.get<Order[]>("/b2b/orders/pending");
      setOrders(r.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const approve = async (id: number) => {
    setBusy(id);
    try {
      const r = await api.post<ApproveResponse>(`/b2b/orders/${id}/approve`);
      toast.success(
        `Orden ${r.data.order.order_number} aprobada · saldo disponible Bs. ${r.data.new_credit_available.toFixed(2)}`
      );
      reload();
    } catch (err: unknown) {
      // @ts-expect-error axios shape
      const detail = err?.response?.data?.detail ?? "Error al aprobar";
      toast.error(typeof detail === "string" ? detail : "Error al aprobar");
    } finally {
      setBusy(null);
    }
  };

  const reject = async (id: number) => {
    const reason = prompt("Motivo del rechazo (opcional):") ?? "";
    setBusy(id);
    try {
      await api.post(`/b2b/orders/${id}/reject`, { reason });
      toast.info("Orden rechazada");
      reload();
    } catch {
      toast.error("Error al rechazar");
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <FullPageSpinner label="Cargando aprobaciones…" />;

  return (
    <div>
      <PageHeader
        title="Aprobaciones B2B"
        description="Órdenes a línea de crédito en espera del Ejecutivo de Ventas."
      />

      {orders.length === 0 ? (
        <EmptyState
          title="No hay órdenes pendientes"
          description="Cuando un cliente B2B confirme una compra a crédito, aparecerá acá."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {orders.map((o) => (
            <div key={o.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-mono uppercase text-ink-400">
                    {o.order_number}
                  </div>
                  <div className="mt-1 text-base font-semibold text-ink-900">
                    Cliente #{o.customer_id}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-500">{o.notes}</div>
                </div>
                <StatusBadge value={o.status} />
              </div>

              <div className="mt-4 overflow-hidden rounded-lg ring-1 ring-ink-200">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th className="text-center">Qty</th>
                      <th className="text-right">Precio</th>
                      <th className="text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.items.map((it, i) => (
                      <tr key={i}>
                        <td>#{it.product_id}</td>
                        <td className="text-center">{it.quantity}</td>
                        <td className="text-right">{formatBOB(it.unit_price)}</td>
                        <td className="text-right font-semibold">
                          {formatBOB(it.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-ink-500">Total</div>
                  <div className="text-xl font-semibold text-ink-900">
                    {formatBOB(o.total)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => reject(o.id)}
                    disabled={busy === o.id}
                    className="btn-ghost"
                  >
                    <XIcon className="h-4 w-4 text-red-500" /> Rechazar
                  </button>
                  <button
                    onClick={() => approve(o.id)}
                    disabled={busy === o.id}
                    className="btn-success"
                  >
                    <CheckIcon className="h-4 w-4" />
                    {busy === o.id ? "Aprobando…" : "Aprobar despacho"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
