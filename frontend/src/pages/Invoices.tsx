import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Invoice, InvoiceStatus } from "@/lib/types";
import { formatBOB, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { FullPageSpinner } from "@/components/Spinner";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/contexts/ToastContext";

const TOKEN_KEY = "idm_token";

export default function Invoices() {
  const toast = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "">("");
  const [orderId, setOrderId] = useState("");
  const [forceFail, setForceFail] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const reload = async () => {
    setLoading(true);
    const r = await api.get<Invoice[]>("/invoices", {
      params: statusFilter ? { status: statusFilter } : {},
    });
    setInvoices(r.data);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, [statusFilter]);

  const emit = async () => {
    if (!orderId) {
      toast.error("Indicá order_id");
      return;
    }
    setEmitting(true);
    try {
      const r = await api.post<Invoice>("/invoices", {
        order_id: Number(orderId),
        force_fail: forceFail,
      });
      const cufShort = r.data.cuf?.slice(0, 14) ?? "(contingencia)";
      toast.success(
        `Factura ${r.data.invoice_number} · ${r.data.status} · CUF ${cufShort}…`
      );
      setOrderId("");
      reload();
    } catch (err: unknown) {
      // @ts-expect-error axios shape
      const detail = err?.response?.data?.detail ?? "Error al emitir";
      toast.error(typeof detail === "string" ? detail : "Error");
    } finally {
      setEmitting(false);
    }
  };

  const retry = async () => {
    setRetrying(true);
    try {
      const r = await api.post<{
        reintentadas: number;
        fallaron: number;
        total: number;
      }>("/invoices/contingency/retry");
      toast.info(
        `${r.data.reintentadas}/${r.data.total} re-enviadas · ${r.data.fallaron} fallaron`
      );
      reload();
    } finally {
      setRetrying(false);
    }
  };

  // Bypass axios for plaintext file download
  const buildAuthUrl = (path: string) => {
    const token = localStorage.getItem(TOKEN_KEY);
    return { url: `/api/v1${path}`, token };
  };

  const downloadFile = async (path: string, filename: string) => {
    const { url, token } = buildAuthUrl(path);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    if (!res.ok) {
      toast.error("No se pudo descargar");
      return;
    }
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = obj;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(obj);
  };

  if (loading) return <FullPageSpinner label="Cargando facturas…" />;

  return (
    <div>
      <PageHeader
        title="Facturación SIAT"
        description="Emisión de facturas electrónicas con CUF, modo contingencia y reintento masivo."
        actions={
          <button onClick={retry} disabled={retrying} className="btn-ghost">
            {retrying ? "Reintentando…" : "Reintentar contingencia"}
          </button>
        }
      />

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-ink-900">
          Emitir factura desde una orden
        </h3>
        <p className="mt-1 text-xs text-ink-500">
          La orden debe estar en <span className="font-medium">PAID</span> o{" "}
          <span className="font-medium">CONFIRMED</span>. Si el SIAT no responde
          en 5s, la factura quedará en contingencia.
        </p>
        <div className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_auto]">
          <label className="block">
            <span className="label">Order ID</span>
            <input
              className="input mt-1"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="Ej: 1"
            />
          </label>
          <label className="flex items-center gap-2 self-center text-sm text-ink-700">
            <input
              type="checkbox"
              checked={forceFail}
              onChange={(e) => setForceFail(e.target.checked)}
            />
            Forzar contingencia
          </label>
          <button onClick={emit} disabled={emitting} className="btn-primary">
            {emitting ? "Emitiendo…" : "Emitir factura"}
          </button>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm text-ink-500">Filtrar:</span>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as InvoiceStatus | "")
          }
          className="input max-w-[200px]"
        >
          <option value="">Todas</option>
          <option value="AUTHORIZED">Autorizadas</option>
          <option value="PENDING">Pendientes (contingencia)</option>
          <option value="REJECTED">Rechazadas</option>
          <option value="CANCELLED">Canceladas</option>
        </select>
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          title="Sin facturas"
          description="Emití una factura desde el formulario superior para verla acá."
        />
      ) : (
        <div className="card-section overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Orden</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th>CUF</th>
                <th>Emitida</th>
                <th className="text-right">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="font-mono text-xs">{inv.invoice_number}</td>
                  <td>#{inv.order_id}</td>
                  <td>
                    <div className="text-sm">{inv.customer_name}</div>
                    <div className="text-xs text-ink-500 font-mono">
                      NIT {inv.customer_nit}
                    </div>
                  </td>
                  <td>
                    <StatusBadge value={inv.status} />
                  </td>
                  <td className="font-mono text-[10px] text-ink-500">
                    {inv.cuf ? inv.cuf.slice(0, 16) + "…" : "(contingencia)"}
                  </td>
                  <td className="text-xs">{formatDate(inv.issue_date)}</td>
                  <td className="text-right font-semibold">
                    {formatBOB(inv.total)}
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() =>
                          downloadFile(
                            `/invoices/${inv.id}/xml`,
                            `${inv.invoice_number}.xml`
                          )
                        }
                        className="btn-ghost h-7 px-2 text-xs"
                      >
                        XML
                      </button>
                      <button
                        onClick={() =>
                          downloadFile(
                            `/invoices/${inv.id}/pdf`,
                            `${inv.invoice_number}.pdf`
                          )
                        }
                        className="btn-ghost h-7 px-2 text-xs"
                      >
                        PDF
                      </button>
                    </div>
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
