import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Spinner } from "@/components/Spinner";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { formatBOB } from "@/lib/format";
import type { Seller } from "@/lib/types";

interface SellerStats {
  seller: { id: number; name: string; status: string };
  total_products: number;
  active_products: number;
  total_orders: number;
  pending_orders: number;
  total_revenue: number;
}

export default function SellerDashboard() {
  const [seller, setSeller] = useState<Seller | null>(null);
  const [stats, setStats] = useState<SellerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [me, stat] = await Promise.allSettled([
          api.get<Seller>("/sellers/me"),
          api.get<SellerStats>("/sellers/me/stats"),
        ]);
        if (me.status === "fulfilled") setSeller(me.value.data);
        if (stat.status === "fulfilled") setStats(stat.value.data);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) {
    return <Spinner />;
  }

  if (!seller) {
    return (
      <>
        <PageHeader title="Mi empresa" />
        <p className="text-sm text-ink-600">
          No tenés una empresa asociada a este usuario.
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={seller.name}
        description={`NIT ${seller.nit} · ${seller.city ?? "Sin ciudad"}`}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge value={seller.status} />
            <Link to="/empresa/productos" className="btn-primary">
              Ir a mis productos
            </Link>
          </div>
        }
      />

      {seller.status === "PENDING" && (
        <div className="mb-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          Tu empresa está pendiente de aprobación. Una vez aprobada, podrás
          cargar productos, almacenes e inventario.
        </div>
      )}
      {seller.status === "REJECTED" && (
        <div className="mb-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-900 ring-1 ring-rose-200">
          Solicitud rechazada
          {seller.rejection_reason ? `: ${seller.rejection_reason}` : "."}
        </div>
      )}
      {seller.status === "SUSPENDED" && (
        <div className="mb-4 rounded-lg bg-ink-100 p-4 text-sm text-ink-700 ring-1 ring-ink-200">
          Tu empresa está suspendida. Contactá al administrador.
        </div>
      )}

      {stats && (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Productos activos"
            value={stats.active_products}
            hint={`${stats.total_products} totales`}
            accent="brand"
          />
          <KpiCard
            label="Órdenes totales"
            value={stats.total_orders}
            hint="histórico"
            accent="emerald"
          />
          <KpiCard
            label="Pendientes aprobación"
            value={stats.pending_orders}
            hint="órdenes B2B esperando"
            accent="amber"
          />
          <KpiCard
            label="Ingresos confirmados"
            value={formatBOB(stats.total_revenue)}
            hint="suma de órdenes pagadas"
            accent="emerald"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow-card ring-1 ring-ink-200">
          <h3 className="text-sm font-semibold text-ink-700">Datos de la empresa</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Email</dt>
              <dd className="font-medium">{seller.contact_email}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Teléfono</dt>
              <dd>{seller.phone ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Dirección</dt>
              <dd className="text-right">{seller.address ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Slug público</dt>
              <dd className="font-mono text-xs">/{seller.slug}</dd>
            </div>
          </dl>
          {seller.description && (
            <div className="mt-3 text-sm text-ink-600">{seller.description}</div>
          )}
        </div>

        <div className="rounded-xl bg-white p-5 shadow-card ring-1 ring-ink-200">
          <h3 className="text-sm font-semibold text-ink-700">Atajos</h3>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link className="text-brand-600 hover:underline" to="/empresa/productos">
                Gestionar productos →
              </Link>
            </li>
            <li>
              <Link className="text-brand-600 hover:underline" to="/inventario">
                Ajustar inventario →
              </Link>
            </li>
            <li>
              <Link className="text-brand-600 hover:underline" to="/aprobaciones">
                Aprobar órdenes B2B →
              </Link>
            </li>
            <li>
              <Link className="text-brand-600 hover:underline" to="/empresa/ventas">
                Ver mis ventas →
              </Link>
            </li>
            <li>
              <Link className="text-brand-600 hover:underline" to="/pos">
                Abrir POS de mostrador →
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}
