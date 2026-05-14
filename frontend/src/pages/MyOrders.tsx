import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import type { Order } from "@/lib/types";
import { formatBOB } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { FullPageSpinner } from "@/components/Spinner";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";

const TOKEN_KEY = "idm_token";

export default function MyOrders() {
  const { user } = useAuth();
  const toast = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [params] = useSearchParams();
  const highlight = params.get("highlight");

  useEffect(() => {
    setLoading(true);
    api
      .get<Order[]>("/cart/my-orders")
      .then((r) => setOrders(r.data))
      .finally(() => setLoading(false));
  }, [user?.role]);

  const downloadInvoice = async (
    invoiceId: number,
    invoiceNumber: string,
    kind: "pdf" | "xml"
  ) => {
    const token = localStorage.getItem(TOKEN_KEY) ?? "";
    const res = await fetch(`/api/v1/invoices/${invoiceId}/${kind}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      toast.error("No se pudo descargar la factura");
      return;
    }
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = obj;
    a.download = `${invoiceNumber}.${kind}`;
    a.click();
    URL.revokeObjectURL(obj);
  };

  if (loading) return <FullPageSpinner label="Cargando órdenes…" />;

  if (user?.role !== "CLIENT_B2B" && user?.role !== "CLIENT_B2C") {
    return (
      <EmptyState
        title="No aplica"
        description="Este panel está disponible solo para clientes."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Mis órdenes"
        description={
          user?.role === "CLIENT_B2B"
            ? "Pedidos a crédito y su estado de aprobación."
            : "Historial reciente de compras."
        }
      />

      {orders.length === 0 ? (
        <EmptyState
          title="Aún no hay órdenes"
          description="Cuando hagas una compra, aparecerá acá."
        />
      ) : (
        <div className="card-section overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Orden</th>
                <th>Canal</th>
                <th>Pago</th>
                <th>Estado</th>
                <th>Factura</th>
                <th className="text-right">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  className={
                    highlight && Number(highlight) === o.id ? "bg-brand-50/60" : ""
                  }
                >
                  <td>
                    <div className="font-mono text-sm">{o.order_number}</div>
                    <div className="text-xs text-ink-500">{o.notes ?? ""}</div>
                  </td>
                  <td>{o.channel}</td>
                  <td>{o.payment_method ?? "—"}</td>
                  <td>
                    <StatusBadge value={o.status} />
                  </td>
                  <td>
                    {o.invoice ? (
                      <div className="space-y-0.5">
                        <div className="font-mono text-xs">
                          {o.invoice.invoice_number}
                        </div>
                        <StatusBadge value={o.invoice.status} />
                      </div>
                    ) : (
                      <span className="text-xs text-ink-400">
                        {o.status === "PENDING_APPROVAL"
                          ? "Pendiente aprobación"
                          : "—"}
                      </span>
                    )}
                  </td>
                  <td className="text-right font-semibold">
                    {formatBOB(o.total)}
                  </td>
                  <td className="text-right">
                    {o.invoice ? (
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() =>
                            downloadInvoice(
                              o.invoice!.id,
                              o.invoice!.invoice_number,
                              "pdf"
                            )
                          }
                          className="btn-ghost h-7 px-2 text-xs"
                        >
                          PDF
                        </button>
                        <button
                          onClick={() =>
                            downloadInvoice(
                              o.invoice!.id,
                              o.invoice!.invoice_number,
                              "xml"
                            )
                          }
                          className="btn-ghost h-7 px-2 text-xs"
                        >
                          XML
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
