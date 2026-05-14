import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import type { Cart, Order, PaymentMethod } from "@/lib/types";
import { formatBOB, formatRelative } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { FullPageSpinner } from "@/components/Spinner";
import { EmptyState } from "@/components/EmptyState";
import { TrashIcon } from "@/components/Icons";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";

export default function CartPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState("LA_PAZ");
  const [method, setMethod] = useState<PaymentMethod>("QR");
  const [paymentRef, setPaymentRef] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isB2B = user?.role === "CLIENT_B2B";

  const reload = async () => {
    setLoading(true);
    try {
      const r = await api.get<Cart>("/cart");
      setCart(r.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const remove = async (itemId: number) => {
    try {
      const r = await api.delete<Cart>(`/cart/items/${itemId}`);
      setCart(r.data);
      toast.success("Item eliminado");
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  const clear = async () => {
    if (!confirm("¿Vaciar el carrito y liberar reservas?")) return;
    try {
      const r = await api.post<Cart>("/cart/clear");
      setCart(r.data);
      toast.info("Carrito vaciado");
    } catch {
      toast.error("Error al vaciar");
    }
  };

  const checkoutB2C = async () => {
    setSubmitting(true);
    try {
      const r = await api.post<Order>("/cart/checkout", {
        destination_city: city,
        payment_method: method,
        payment_reference: paymentRef,
      });
      toast.success(`Pago aprobado · Orden ${r.data.order_number}`);
      navigate(`/mis-ordenes?highlight=${r.data.id}`);
    } catch (err: unknown) {
      // @ts-expect-error axios shape
      const detail = err?.response?.data?.detail ?? "Pago rechazado";
      toast.error(typeof detail === "string" ? detail : "Error al procesar");
    } finally {
      setSubmitting(false);
    }
  };

  const checkoutB2B = async () => {
    setSubmitting(true);
    try {
      const r = await api.post<Order>("/b2b/checkout-credit", {
        destination_city: city,
      });
      toast.success(
        `Orden ${r.data.order_number} enviada a aprobación del Ejecutivo`
      );
      navigate(`/mis-ordenes?highlight=${r.data.id}`);
    } catch (err: unknown) {
      // @ts-expect-error axios shape
      const detail = err?.response?.data?.detail ?? "Error de validación";
      toast.error(typeof detail === "string" ? detail : "Error al procesar");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <FullPageSpinner label="Cargando carrito…" />;

  return (
    <div>
      <PageHeader
        title="Mi carrito"
        description={
          cart?.expires_at
            ? `Las reservas vencen ${formatRelative(cart.expires_at)}`
            : "Las reservas vencen 15 minutos después de la última actividad."
        }
        actions={
          cart && cart.items.length > 0 ? (
            <button onClick={clear} className="btn-ghost">
              <TrashIcon className="h-4 w-4" /> Vaciar
            </button>
          ) : null
        }
      />

      {!cart || cart.items.length === 0 ? (
        <EmptyState
          title="Tu carrito está vacío"
          description="Explorá el catálogo y agregá productos para iniciar una compra."
          action={
            <Link to="/catalogo" className="btn-primary">
              Ir al catálogo
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="card-section overflow-hidden">
              <table className="table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="text-center">Cantidad</th>
                    <th className="text-right">Precio</th>
                    <th className="text-right">Subtotal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.items.map((it) => (
                    <tr key={it.id}>
                      <td>
                        <div className="text-sm font-medium text-ink-900">
                          {it.product_name}
                        </div>
                        <div className="text-xs font-mono text-ink-500">
                          {it.sku} · {it.warehouse_code}
                        </div>
                      </td>
                      <td className="text-center">{it.quantity}</td>
                      <td className="text-right">{formatBOB(it.unit_price)}</td>
                      <td className="text-right font-semibold">
                        {formatBOB(it.subtotal)}
                      </td>
                      <td className="text-right">
                        <button
                          onClick={() => remove(it.id)}
                          className="btn-ghost h-8 w-8 p-0"
                          title="Quitar"
                        >
                          <TrashIcon className="h-4 w-4 text-red-500" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="card h-fit">
            <h3 className="text-sm font-semibold text-ink-900">
              Finalizar compra
            </h3>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="label">Ciudad destino</span>
                <select
                  className="input mt-1"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                >
                  <option value="LA_PAZ">La Paz</option>
                  <option value="COCHABAMBA">Cochabamba</option>
                  <option value="SANTA_CRUZ">Santa Cruz</option>
                </select>
                <span className="mt-1 block text-xs text-ink-500">
                  Costo de envío: LP Bs. 25 · CBBA Bs. 40 · SCZ Bs. 55
                </span>
              </label>

              {!isB2B && (
                <>
                  <label className="block">
                    <span className="label">Método de pago</span>
                    <select
                      className="input mt-1"
                      value={method}
                      onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                    >
                      <option value="QR">QR Pago</option>
                      <option value="CARD">Tarjeta</option>
                      <option value="TRANSFER">Transferencia</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">Referencia (opcional)</span>
                    <input
                      className="input mt-1"
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                      placeholder="Ej: TXN-1234 · usar 'FAIL' para simular rechazo"
                    />
                  </label>
                </>
              )}

              <div className="rounded-lg bg-ink-50 p-3">
                <Row label="Subtotal" value={formatBOB(cart.subtotal)} />
                <Row
                  label="Envío"
                  value={
                    city === "LA_PAZ"
                      ? formatBOB(25)
                      : city === "COCHABAMBA"
                        ? formatBOB(40)
                        : formatBOB(55)
                  }
                />
                <div className="mt-2 flex items-center justify-between border-t border-ink-200 pt-2 text-base">
                  <span className="font-semibold">Total estimado</span>
                  <span className="font-semibold">
                    {formatBOB(
                      Number(cart.subtotal) +
                        (city === "LA_PAZ" ? 25 : city === "COCHABAMBA" ? 40 : 55)
                    )}
                  </span>
                </div>
              </div>

              {isB2B ? (
                <button
                  onClick={checkoutB2B}
                  disabled={submitting}
                  className="btn-primary w-full"
                >
                  {submitting
                    ? "Enviando…"
                    : "Cargar a línea de crédito (B2B)"}
                </button>
              ) : (
                <button
                  onClick={checkoutB2C}
                  disabled={submitting}
                  className="btn-primary w-full"
                >
                  {submitting ? "Procesando…" : "Pagar y confirmar"}
                </button>
              )}

              {isB2B && (
                <p className="text-xs text-ink-500">
                  Al confirmar, la orden quedará en{" "}
                  <span className="font-medium">PENDING_APPROVAL</span> y un
                  Ejecutivo de Ventas validará tu línea de crédito.
                </p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-500">{label}</span>
      <span className="font-medium text-ink-800">{value}</span>
    </div>
  );
}
