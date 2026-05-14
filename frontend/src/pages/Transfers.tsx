import { FormEvent, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "@/lib/api";
import type {
  ProductListItem,
  StockTransfer,
  TransferStatus,
  Warehouse,
} from "@/lib/types";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { FullPageSpinner } from "@/components/Spinner";
import { EmptyState } from "@/components/EmptyState";
import { PlusIcon, QrIcon, XIcon } from "@/components/Icons";
import { useToast } from "@/contexts/ToastContext";

interface OriginStockRow {
  product_id: number;
  quantity: number;
  reserved: number;
  available: number;
  min_stock: number;
}

const STATUS_FLOW: Record<TransferStatus, string[]> = {
  REQUESTED: ["start-picking", "reject-merma", "cancel"],
  PICKING: ["dispatch", "reject-merma", "cancel"],
  IN_TRANSIT: ["receive"],
  RECEIVED: [],
  REJECTED_MERMA: [],
  CANCELLED: [],
};

const ACTION_LABEL: Record<string, string> = {
  "start-picking": "Iniciar picking",
  dispatch: "Despachar",
  receive: "Recibir",
  "reject-merma": "Merma",
  cancel: "Cancelar",
};

export default function Transfers() {
  const toast = useToast();
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [qrFor, setQrFor] = useState<StockTransfer | null>(null);
  const [originStock, setOriginStock] = useState<Record<number, number>>({});
  const [form, setForm] = useState({
    origin_warehouse_id: "",
    destination_warehouse_id: "",
    items: [{ product_id: "", quantity: 1 }],
    notes: "",
  });

  const reload = async () => {
    setRefreshing(true);
    try {
      const [tr, wh, prods] = await Promise.all([
        api.get<StockTransfer[]>("/transfers"),
        api.get<Warehouse[]>("/warehouses"),
        api.get<ProductListItem[]>("/catalog/products", { params: { limit: 200 } }),
      ]);
      setTransfers(tr.data);
      setWarehouses(wh.data);
      setProducts(prods.data);
    } catch (err: unknown) {
      // @ts-expect-error axios shape
      const detail = err?.response?.data?.detail ?? "No se pudo recargar";
      toast.error(typeof detail === "string" ? detail : "No se pudo recargar");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!form.origin_warehouse_id) {
      setOriginStock({});
      return;
    }
    api
      .get<OriginStockRow[]>(`/inventory/by-warehouse/${form.origin_warehouse_id}`)
      .then((r) => {
        const map: Record<number, number> = {};
        r.data.forEach((row) => {
          map[row.product_id] = row.available;
        });
        setOriginStock(map);
      })
      .catch(() => setOriginStock({}));
  }, [form.origin_warehouse_id]);

  const productsWithStock = useMemo(
    () => products.filter((p) => (originStock[p.id] ?? 0) > 0),
    [products, originStock]
  );

  const addItemRow = () =>
    setForm({ ...form, items: [...form.items, { product_id: "", quantity: 1 }] });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.origin_warehouse_id || !form.destination_warehouse_id) {
      toast.error("Selecciona origen y destino");
      return;
    }
    if (form.origin_warehouse_id === form.destination_warehouse_id) {
      toast.error("Origen y destino deben ser distintos");
      return;
    }
    const validItems = form.items.filter((i) => i.product_id);
    if (validItems.length === 0) {
      toast.error("Agregá al menos un producto");
      return;
    }
    for (const it of validItems) {
      const avail = originStock[Number(it.product_id)] ?? 0;
      if (Number(it.quantity) > avail) {
        toast.error(
          `Stock insuficiente en origen para producto ${it.product_id}: disponible ${avail}`
        );
        return;
      }
    }
    setSubmitting(true);
    try {
      await api.post("/transfers", {
        origin_warehouse_id: Number(form.origin_warehouse_id),
        destination_warehouse_id: Number(form.destination_warehouse_id),
        items: form.items
          .filter((i) => i.product_id)
          .map((i) => ({
            product_id: Number(i.product_id),
            quantity: Number(i.quantity),
          })),
        notes: form.notes || undefined,
      });
      toast.success("Traspaso creado, stock reservado en origen");
      setShowForm(false);
      setForm({
        origin_warehouse_id: "",
        destination_warehouse_id: "",
        items: [{ product_id: "", quantity: 1 }],
        notes: "",
      });
      reload();
    } catch (err: unknown) {
      // @ts-expect-error axios shape
      const detail = err?.response?.data?.detail ?? "Error";
      toast.error(typeof detail === "string" ? detail : "Error al crear traspaso");
    } finally {
      setSubmitting(false);
    }
  };

  const action = async (id: number, kind: string) => {
    let body: Record<string, unknown> = {};
    if (kind === "reject-merma" || kind === "cancel") {
      const reason = prompt("Motivo:") ?? "";
      body = { reason };
    }
    try {
      await api.post(`/transfers/${id}/${kind}`, body);
      toast.success("Estado actualizado");
      reload();
    } catch (err: unknown) {
      // @ts-expect-error axios shape
      const detail = err?.response?.data?.detail ?? "Error";
      toast.error(typeof detail === "string" ? detail : "Error");
    }
  };

  const whCode = (id: number) =>
    warehouses.find((w) => w.id === id)?.code ?? `#${id}`;
  const whCity = (id: number) =>
    warehouses.find((w) => w.id === id)?.city.replaceAll("_", " ") ?? "";

  if (loading) return <FullPageSpinner label="Cargando traspasos…" />;

  return (
    <div>
      <PageHeader
        title="Traspasos interdepartamentales"
        description="Picking → tránsito → recepción con QR. Soporta merma y cancelación."
        actions={
          <div className="flex items-center gap-2">
            {refreshing && (
              <span className="text-xs text-ink-500">Actualizando…</span>
            )}
            <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
              <PlusIcon className="h-4 w-4" /> Nuevo traspaso
            </button>
          </div>
        }
      />

      {showForm && (
        <form onSubmit={submit} className="card mb-6">
          <h3 className="text-sm font-semibold text-ink-900">
            Crear orden de traspaso
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              <span className="label">Origen</span>
              <select
                className="input mt-1"
                value={form.origin_warehouse_id}
                onChange={(e) =>
                  setForm({ ...form, origin_warehouse_id: e.target.value })
                }
              >
                <option value="">Seleccionar…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.city.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Destino</span>
              <select
                className="input mt-1"
                value={form.destination_warehouse_id}
                onChange={(e) =>
                  setForm({
                    ...form,
                    destination_warehouse_id: e.target.value,
                  })
                }
              >
                <option value="">Seleccionar…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.city.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <span className="label">Items</span>
              {form.origin_warehouse_id && (
                <span className="text-xs text-ink-500">
                  {productsWithStock.length} producto(s) con stock en origen
                </span>
              )}
            </div>
            {!form.origin_warehouse_id && (
              <p className="mt-1 text-xs text-amber-700">
                Seleccioná primero el almacén de origen para ver productos
                disponibles.
              </p>
            )}
            <div className="mt-1 space-y-2">
              {form.items.map((it, idx) => {
                const avail = it.product_id
                  ? originStock[Number(it.product_id)] ?? 0
                  : 0;
                return (
                  <div key={idx} className="flex gap-2">
                    <select
                      className="input flex-1"
                      value={it.product_id}
                      disabled={!form.origin_warehouse_id}
                      onChange={(e) => {
                        const items = [...form.items];
                        items[idx].product_id = e.target.value;
                        setForm({ ...form, items });
                      }}
                    >
                      <option value="">Producto…</option>
                      {productsWithStock.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} · {p.name} · disp.{" "}
                          {originStock[p.id] ?? 0}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={avail || undefined}
                      className="input w-24"
                      value={it.quantity}
                      onChange={(e) => {
                        const items = [...form.items];
                        items[idx].quantity = Number(e.target.value);
                        setForm({ ...form, items });
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={addItemRow}
              disabled={!form.origin_warehouse_id}
              className="btn-ghost mt-2"
            >
              <PlusIcon className="h-4 w-4" /> Agregar otro
            </button>
          </div>

          <label className="mt-4 block">
            <span className="label">Notas</span>
            <input
              className="input mt-1"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>

          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? "Creando…" : "Crear traspaso"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="btn-ghost"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {qrFor && (
        <QrModal
          transfer={qrFor}
          warehouses={warehouses}
          onClose={() => setQrFor(null)}
        />
      )}

      {transfers.length === 0 ? (
        <EmptyState
          title="Sin traspasos registrados"
          description="Creá el primer traspaso para mover mercancía entre sucursales."
        />
      ) : (
        <div className="card-section overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Origen → Destino</th>
                <th>Estado</th>
                <th>Items</th>
                <th>QR</th>
                <th>Despachado</th>
                <th>Recibido</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id}>
                  <td className="font-mono text-xs">{t.transfer_number}</td>
                  <td>
                    <div className="text-sm">
                      {whCode(t.origin_warehouse_id)} →{" "}
                      {whCode(t.destination_warehouse_id)}
                    </div>
                    <div className="text-xs text-ink-500">
                      {whCity(t.origin_warehouse_id)} →{" "}
                      {whCity(t.destination_warehouse_id)}
                    </div>
                  </td>
                  <td>
                    <StatusBadge value={t.status} />
                  </td>
                  <td>
                    <div className="text-xs text-ink-500">
                      {t.items.length} ítem(s) ·{" "}
                      {t.items.reduce((a, b) => a + b.quantity, 0)} unid.
                    </div>
                  </td>
                  <td>
                    {t.qr_token ? (
                      <button
                        type="button"
                        onClick={() => setQrFor(t)}
                        className="btn-ghost h-7 px-2 text-xs"
                        title="Ver QR e imprimir Nota de Remisión"
                      >
                        <QrIcon className="h-3.5 w-3.5" /> Ver QR
                      </button>
                    ) : (
                      <span className="text-xs text-ink-400">—</span>
                    )}
                  </td>
                  <td className="text-xs">{formatDate(t.dispatched_at)}</td>
                  <td className="text-xs">{formatDate(t.received_at)}</td>
                  <td className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {STATUS_FLOW[t.status].map((k) => (
                        <button
                          key={k}
                          onClick={() => action(t.id, k)}
                          className={
                            k === "reject-merma" || k === "cancel"
                              ? "btn-ghost h-7 px-2 text-xs"
                              : "btn-primary h-7 px-2 text-xs"
                          }
                        >
                          {ACTION_LABEL[k]}
                        </button>
                      ))}
                      {STATUS_FLOW[t.status].length === 0 && (
                        <span className="text-xs text-ink-400">Cerrado</span>
                      )}
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

function QrModal({
  transfer,
  warehouses,
  onClose,
}: {
  transfer: StockTransfer;
  warehouses: Warehouse[];
  onClose: () => void;
}) {
  const toast = useToast();
  const token = transfer.qr_token ?? "";
  const origin = warehouses.find((w) => w.id === transfer.origin_warehouse_id);
  const dest = warehouses.find(
    (w) => w.id === transfer.destination_warehouse_id
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      toast.success("Token copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar; copialo manualmente");
    }
  };

  const printNote = () => window.print();

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-card ring-1 ring-ink-200 print:m-0 print:max-w-none print:shadow-none print:ring-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 print:border-0">
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">
              Nota de Remisión
            </div>
            <div className="font-mono text-sm font-semibold text-ink-900">
              {transfer.transfer_number}
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost h-8 w-8 p-0 print:hidden"
            aria-label="Cerrar"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4 text-sm text-ink-700">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-ink-500">Origen</div>
              <div className="font-medium text-ink-900">
                {origin ? `${origin.code} · ${origin.city.replaceAll("_", " ")}` : `#${transfer.origin_warehouse_id}`}
              </div>
            </div>
            <div>
              <div className="text-ink-500">Destino</div>
              <div className="font-medium text-ink-900">
                {dest ? `${dest.code} · ${dest.city.replaceAll("_", " ")}` : `#${transfer.destination_warehouse_id}`}
              </div>
            </div>
          </div>

          <div className="mt-4 grid place-items-center rounded-lg bg-white p-3 ring-1 ring-ink-200">
            {token ? (
              <QRCodeSVG
                value={token}
                size={208}
                marginSize={2}
                level="M"
                bgColor="#ffffff"
                fgColor="#0f172a"
              />
            ) : (
              <div className="text-xs text-ink-500">Sin token</div>
            )}
          </div>

          <div className="mt-3">
            <div className="label">Token (texto)</div>
            <div className="mt-1 flex gap-2">
              <code className="input flex-1 truncate font-mono text-[11px]">
                {token || "—"}
              </code>
              <button
                type="button"
                onClick={copy}
                disabled={!token}
                className="btn-ghost h-9 px-3 text-xs print:hidden"
              >
                Copiar
              </button>
            </div>
          </div>

          <div className="mt-3 text-[11px] text-ink-500">
            En destino: <strong>Recibir QR</strong> → escanear con cámara o pegar
            este token para confirmar la recepción y sumar al inventario.
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-ink-200 px-4 py-3 print:hidden">
          <button onClick={printNote} className="btn-ghost">
            Imprimir
          </button>
          <button onClick={onClose} className="btn-primary">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
