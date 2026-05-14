import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type {
  ProductListItem,
  StockAlert,
  Warehouse,
} from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { FullPageSpinner } from "@/components/Spinner";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";

export default function Inventory() {
  const toast = useToast();
  const { user } = useAuth();
  const isSeller = user?.role === "SELLER";
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjusting, setAdjusting] = useState(false);
  const [form, setForm] = useState({
    product_id: "",
    warehouse_id: "",
    delta: 1,
    notes: "",
  });

  const reload = async () => {
    setLoading(true);
    const productsEndpoint = isSeller ? "/catalog/my/products" : "/catalog/products";
    const [wh, prods, alertsRes] = await Promise.all([
      api.get<Warehouse[]>("/warehouses"),
      api.get<ProductListItem[]>(productsEndpoint, { params: { limit: 500 } }),
      api.get<StockAlert[]>("/inventory/alerts"),
    ]);
    setWarehouses(wh.data);
    setProducts(prods.data);
    setAlerts(alertsRes.data);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  const adjust = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.product_id || !form.warehouse_id || form.delta === 0) {
      toast.error("Completa producto, almacén y delta no nulo");
      return;
    }
    setAdjusting(true);
    try {
      await api.post("/inventory/adjust", {
        product_id: Number(form.product_id),
        warehouse_id: Number(form.warehouse_id),
        delta: Number(form.delta),
        notes: form.notes || undefined,
      });
      toast.success("Ajuste registrado");
      setForm({ ...form, delta: 1, notes: "" });
      reload();
    } catch (err: unknown) {
      // @ts-expect-error axios shape
      const detail = err?.response?.data?.detail ?? "Error en ajuste";
      toast.error(typeof detail === "string" ? detail : "Error");
    } finally {
      setAdjusting(false);
    }
  };

  if (loading) return <FullPageSpinner label="Cargando inventario…" />;

  return (
    <div>
      <PageHeader
        title="Inventario multi-almacén"
        description="Sincronización LP · CBBA · SCZ con bloqueo automático cuando el stock nacional llega a cero."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form onSubmit={adjust} className="card lg:col-span-1">
          <h3 className="text-sm font-semibold text-ink-900">
            Ajuste de stock
          </h3>
          <p className="mt-1 text-xs text-ink-500">
            Entrada (+) / salida (-) en una sucursal específica. Genera un
            movimiento auditable.
          </p>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="label">Producto</span>
              <select
                className="input mt-1"
                value={form.product_id}
                onChange={(e) =>
                  setForm({ ...form, product_id: e.target.value })
                }
              >
                <option value="">Seleccionar…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} · {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Almacén</span>
              <select
                className="input mt-1"
                value={form.warehouse_id}
                onChange={(e) =>
                  setForm({ ...form, warehouse_id: e.target.value })
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
            <label className="block">
              <span className="label">Delta</span>
              <input
                type="number"
                className="input mt-1"
                value={form.delta}
                onChange={(e) =>
                  setForm({ ...form, delta: Number(e.target.value) })
                }
              />
            </label>
            <label className="block">
              <span className="label">Notas (opcional)</span>
              <input
                className="input mt-1"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Recepción importación, merma, etc."
              />
            </label>
            <button
              type="submit"
              disabled={adjusting}
              className="btn-primary w-full"
            >
              {adjusting ? "Aplicando…" : "Aplicar ajuste"}
            </button>
          </div>
        </form>

        <div className="lg:col-span-2 space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink-900">
              Stock consolidado nacional
            </h3>
            <div className="card-section overflow-hidden">
              <table className="table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Producto</th>
                    <th>Tipo</th>
                    <th className="text-right">Disponible</th>
                    <th className="text-right">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td className="font-mono text-xs">{p.sku}</td>
                      <td>{p.name}</td>
                      <td className="text-xs uppercase text-ink-500">
                        {p.product_type}
                      </td>
                      <td className="text-right font-semibold">
                        {p.total_available}
                      </td>
                      <td className="text-right">
                        {p.is_sold_out ? (
                          <StatusBadge value="OUT_OF_STOCK" />
                        ) : (
                          <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                            Disponible
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink-900">
              Alertas de inventario
            </h3>
            {alerts.length === 0 ? (
              <EmptyState
                title="Sin alertas activas"
                description="Todos los productos tienen stock por encima del mínimo nacional."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {alerts.map((a) => (
                  <div
                    key={a.product_id}
                    className="rounded-xl bg-white p-4 shadow-soft ring-1 ring-ink-200"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-mono text-[11px] uppercase text-ink-400">
                          {a.sku}
                        </div>
                        <div className="text-sm font-semibold text-ink-900">
                          {a.name}
                        </div>
                      </div>
                      <StatusBadge value={a.severity} />
                    </div>
                    <div className="mt-2 text-xs text-ink-500">
                      Stock actual:{" "}
                      <span className="font-semibold text-ink-800">
                        {a.total_quantity}
                      </span>{" "}
                      · Mínimo nacional:{" "}
                      <span className="font-semibold text-ink-800">
                        {a.min_stock_total}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
