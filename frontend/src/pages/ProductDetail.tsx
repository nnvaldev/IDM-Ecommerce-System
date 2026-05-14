import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import type { Product } from "@/lib/types";
import { formatBOB } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { FullPageSpinner } from "@/components/Spinner";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [city, setCity] = useState("LA_PAZ");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .get<Product>(`/catalog/products/${id}`)
      .then((r) => setProduct(r.data))
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <FullPageSpinner label="Cargando producto…" />;
  if (!product)
    return (
      <div className="card max-w-md">
        <h3 className="font-semibold text-ink-900">Producto no encontrado</h3>
        <Link to="/catalogo" className="mt-2 text-sm text-brand-600 hover:underline">
          Volver al catálogo
        </Link>
      </div>
    );

  const canBuy = user?.role === "CLIENT_B2C" || user?.role === "CLIENT_B2B";

  const addToCart = async () => {
    if (!user) {
      navigate("/login");
      return;
    }
    if (!canBuy) {
      toast.error("Tu rol no puede agregar al carrito");
      return;
    }
    setAdding(true);
    try {
      await api.post("/cart/items", {
        product_id: product.id,
        quantity: qty,
        preferred_city: city,
      });
      toast.success("Producto agregado al carrito");
      navigate("/carrito");
    } catch (err: unknown) {
      // @ts-expect-error axios shape
      const detail = err?.response?.data?.detail ?? "No se pudo agregar al carrito";
      toast.error(typeof detail === "string" ? detail : "Error al agregar");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={product.name}
        description={product.description ?? undefined}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-mono uppercase text-ink-400">
                {product.sku}
              </div>
              <div className="mt-1 text-sm text-ink-500">
                Tipo: <span className="font-medium text-ink-700">{product.product_type}</span>
              </div>
              {product.seller_name && (
                <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-500" />
                  Vende: {product.seller_name}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-xs text-ink-500">Precio</div>
              <div className="text-3xl font-semibold tracking-tight text-ink-900">
                {formatBOB(product.base_price)}
              </div>
            </div>
          </div>

          {Object.keys(product.attributes).length > 0 && (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Object.entries(product.attributes).map(([k, v]) => (
                <div
                  key={k}
                  className="rounded-lg bg-ink-50 px-3 py-2 ring-1 ring-ink-200"
                >
                  <div className="text-[11px] uppercase text-ink-500">{k}</div>
                  <div className="mt-0.5 text-sm font-medium text-ink-800">
                    {Array.isArray(v) ? (v as unknown[]).join(", ") : String(v)}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold text-ink-900">
              Stock por sucursal
            </h3>
            <div className="overflow-hidden rounded-lg ring-1 ring-ink-200">
              <table className="table">
                <thead>
                  <tr>
                    <th>Sucursal</th>
                    <th>Ciudad</th>
                    <th className="text-right">Físico</th>
                    <th className="text-right">Reservado</th>
                    <th className="text-right">Disponible</th>
                  </tr>
                </thead>
                <tbody>
                  {product.stock_by_warehouse.map((s) => (
                    <tr key={s.warehouse_id}>
                      <td className="font-mono text-xs">{s.warehouse_code}</td>
                      <td>{s.warehouse_city.replaceAll("_", " ")}</td>
                      <td className="text-right">{s.quantity}</td>
                      <td className="text-right text-ink-500">{s.reserved}</td>
                      <td className="text-right font-semibold">{s.available}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="card h-fit">
          <h3 className="text-sm font-semibold text-ink-900">Comprar</h3>
          <div className="mt-3">
            {product.is_sold_out ? (
              <div className="rounded-lg bg-red-50 p-3 ring-1 ring-red-200">
                <div className="flex items-center gap-2">
                  <StatusBadge value="OUT_OF_STOCK" />
                </div>
                <p className="mt-2 text-sm text-red-700">
                  Sin stock a nivel nacional. Será repuesto pronto.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-500">Disponible nacional</span>
                  <span className="font-semibold">{product.total_available}</span>
                </div>
                <label className="mt-3 block">
                  <span className="label">Cantidad</span>
                  <input
                    type="number"
                    min={1}
                    max={product.total_available}
                    value={qty}
                    onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
                    className="input mt-1"
                  />
                </label>
                <label className="mt-3 block">
                  <span className="label">Ciudad de envío</span>
                  <select
                    className="input mt-1"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  >
                    <option value="LA_PAZ">La Paz</option>
                    <option value="COCHABAMBA">Cochabamba</option>
                    <option value="SANTA_CRUZ">Santa Cruz</option>
                  </select>
                </label>
                <button
                  onClick={addToCart}
                  disabled={adding}
                  className="btn-primary mt-4 w-full"
                >
                  {adding ? "Agregando…" : "Agregar al carrito"}
                </button>
                {!user && (
                  <p className="mt-2 text-center text-xs text-ink-500">
                    <Link to="/login" className="text-brand-600 hover:underline">
                      Iniciá sesión
                    </Link>{" "}
                    para comprar
                  </p>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
