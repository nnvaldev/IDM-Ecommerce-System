import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/contexts/ToastContext";
import { formatBOB } from "@/lib/format";
import type { OrderItem, OrderInvoiceSummary, Product, Warehouse } from "@/lib/types";

interface Line {
  sku: string;
  name: string;
  quantity: number;
  unit_price: number;
}

interface POSReceipt {
  order_id: number;
  order_number: string;
  seller_id: number;
  subtotal: string;
  tax: string;
  total: string;
  items: OrderItem[];
  invoice: OrderInvoiceSummary | null;
}

export default function POS() {
  const toast = useToast();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [skuInput, setSkuInput] = useState("");
  const [qtyInput, setQtyInput] = useState(1);
  const [searching, setSearching] = useState(false);

  const [nit, setNit] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD">("CASH");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<POSReceipt | null>(null);

  useEffect(() => {
    api.get<Warehouse[]>("/warehouses").then((r) => {
      setWarehouses(r.data);
      if (r.data.length > 0) setWarehouseId(r.data[0].id);
    });
  }, []);

  const subtotal = lines.reduce((acc, l) => acc + l.unit_price * l.quantity, 0);

  const addBySku = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!skuInput.trim()) return;
    setSearching(true);
    try {
      const { data: prod } = await api.get<Product>(
        `/catalog/products/by-sku/${skuInput.trim().toUpperCase()}`
      );
      const existing = lines.find((l) => l.sku === prod.sku);
      if (existing) {
        setLines(
          lines.map((l) =>
            l.sku === prod.sku ? { ...l, quantity: l.quantity + qtyInput } : l
          )
        );
      } else {
        setLines([
          ...lines,
          {
            sku: prod.sku,
            name: prod.name,
            quantity: qtyInput,
            unit_price: Number(prod.base_price),
          },
        ]);
      }
      setSkuInput("");
      setQtyInput(1);
    } catch (err: unknown) {
      // @ts-expect-error axios
      const detail = err?.response?.data?.detail ?? "SKU no encontrado";
      toast.error(typeof detail === "string" ? detail : "SKU no encontrado");
    } finally {
      setSearching(false);
    }
  };

  const removeLine = (sku: string) => setLines(lines.filter((l) => l.sku !== sku));

  const reset = () => {
    setLines([]);
    setNit("");
    setCustomerName("");
    setReceipt(null);
  };

  const checkout = async () => {
    if (!warehouseId) {
      toast.error("Seleccioná un almacén");
      return;
    }
    if (lines.length === 0) {
      toast.error("Agregá al menos un producto");
      return;
    }
    if (!nit || !customerName) {
      toast.error("Completa NIT/CI y nombre del cliente");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<POSReceipt>("/pos/checkout", {
        warehouse_id: warehouseId,
        customer_nit: nit,
        customer_name: customerName,
        payment_method: paymentMethod,
        items: lines.map((l) => ({ sku: l.sku, quantity: l.quantity })),
      });
      setReceipt(data);
      toast.success(`Venta ${data.order_number} registrada`);
    } catch (err: unknown) {
      // @ts-expect-error axios
      const detail = err?.response?.data?.detail ?? "Error al procesar venta";
      toast.error(typeof detail === "string" ? detail : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="POS Mostrador"
        description="Venta presencial en sucursal: busca por SKU, cobra y factura SIAT al instante."
      />

      {receipt ? (
        <div className="rounded-xl bg-white p-6 shadow-card ring-1 ring-ink-200">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-emerald-700">
                ¡Venta registrada!
              </h2>
              <p className="text-sm text-ink-500">
                Orden <span className="font-mono">{receipt.order_number}</span>
              </p>
            </div>
            <div className="flex gap-2">
              {receipt.invoice && (
                <a
                  href={`/api/v1/invoices/${receipt.invoice.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost"
                >
                  Imprimir factura
                </a>
              )}
              <button onClick={reset} className="btn-primary">
                Nueva venta
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg bg-ink-50 p-4">
              <h3 className="text-xs font-semibold uppercase text-ink-500">
                Resumen
              </h3>
              <dl className="mt-2 space-y-1 text-sm">
                <Row label="Subtotal" value={formatBOB(receipt.subtotal)} />
                <Row label="IVA (incluido)" value={formatBOB(receipt.tax)} />
                <Row
                  label="TOTAL"
                  value={
                    <span className="text-base font-bold">
                      {formatBOB(receipt.total)}
                    </span>
                  }
                />
              </dl>
            </div>
            {receipt.invoice && (
              <div className="rounded-lg bg-ink-50 p-4">
                <h3 className="text-xs font-semibold uppercase text-ink-500">
                  Factura SIAT
                </h3>
                <p className="mt-2 text-sm">
                  Nro: <span className="font-mono">{receipt.invoice.invoice_number}</span>
                </p>
                <p className="text-xs text-ink-500">
                  Estado: {receipt.invoice.status}
                </p>
                {receipt.invoice.cuf && (
                  <p className="mt-1 break-all text-xs font-mono text-ink-600">
                    CUF: {receipt.invoice.cuf}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-xl bg-white p-5 shadow-card ring-1 ring-ink-200">
              <h3 className="mb-3 text-sm font-semibold text-ink-700">
                Búsqueda por SKU
              </h3>
              <form onSubmit={addBySku} className="flex gap-2">
                <input
                  autoFocus
                  className="input flex-1 font-mono uppercase"
                  placeholder="Escaneá o ingresá el SKU"
                  value={skuInput}
                  onChange={(e) => setSkuInput(e.target.value)}
                />
                <input
                  type="number"
                  min={1}
                  className="input w-24"
                  value={qtyInput}
                  onChange={(e) => setQtyInput(Number(e.target.value))}
                />
                <button type="submit" disabled={searching} className="btn-primary">
                  Agregar
                </button>
              </form>
            </div>

            <div className="rounded-xl bg-white p-5 shadow-card ring-1 ring-ink-200">
              <h3 className="mb-3 text-sm font-semibold text-ink-700">Items</h3>
              {lines.length === 0 ? (
                <EmptyState
                  title="Carrito vacío"
                  description="Buscá productos por SKU para empezar."
                />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Nombre</th>
                      <th className="text-right">Cant.</th>
                      <th className="text-right">P.U.</th>
                      <th className="text-right">Subtotal</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.sku}>
                        <td className="font-mono text-xs">{l.sku}</td>
                        <td>{l.name}</td>
                        <td className="text-right">{l.quantity}</td>
                        <td className="text-right">{formatBOB(l.unit_price)}</td>
                        <td className="text-right font-medium">
                          {formatBOB(l.unit_price * l.quantity)}
                        </td>
                        <td className="text-right">
                          <button
                            onClick={() => removeLine(l.sku)}
                            className="text-xs text-rose-600 hover:underline"
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl bg-white p-5 shadow-card ring-1 ring-ink-200">
              <h3 className="mb-3 text-sm font-semibold text-ink-700">
                Almacén / Sucursal
              </h3>
              <select
                value={warehouseId ?? ""}
                onChange={(e) => setWarehouseId(Number(e.target.value))}
                className="input"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl bg-white p-5 shadow-card ring-1 ring-ink-200">
              <h3 className="mb-3 text-sm font-semibold text-ink-700">Cliente</h3>
              <label className="block">
                <span className="label">NIT / CI</span>
                <input
                  className="input mt-1"
                  value={nit}
                  onChange={(e) => setNit(e.target.value)}
                  placeholder="1234567"
                />
              </label>
              <label className="mt-2 block">
                <span className="label">Razón social / Nombre</span>
                <input
                  className="input mt-1"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Juan Pérez"
                />
              </label>
            </div>

            <div className="rounded-xl bg-white p-5 shadow-card ring-1 ring-ink-200">
              <h3 className="mb-3 text-sm font-semibold text-ink-700">Pago</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("CASH")}
                  className={
                    "flex-1 rounded-md px-3 py-2 text-sm font-medium ring-1 transition " +
                    (paymentMethod === "CASH"
                      ? "bg-brand-600 text-white ring-brand-600"
                      : "bg-white text-ink-700 ring-ink-200 hover:bg-ink-50")
                  }
                >
                  Efectivo
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("CARD")}
                  className={
                    "flex-1 rounded-md px-3 py-2 text-sm font-medium ring-1 transition " +
                    (paymentMethod === "CARD"
                      ? "bg-brand-600 text-white ring-brand-600"
                      : "bg-white text-ink-700 ring-ink-200 hover:bg-ink-50")
                  }
                >
                  Tarjeta
                </button>
              </div>
            </div>

            <div className="rounded-xl bg-white p-5 shadow-card ring-1 ring-ink-200">
              <Row label="Subtotal" value={formatBOB(subtotal)} />
              <Row
                label="TOTAL"
                value={
                  <span className="text-base font-bold text-brand-700">
                    {formatBOB(subtotal)}
                  </span>
                }
              />
              <button
                onClick={checkout}
                disabled={submitting || lines.length === 0}
                className="btn-primary mt-4 w-full"
              >
                {submitting ? "Procesando…" : "Cobrar y facturar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-ink-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
