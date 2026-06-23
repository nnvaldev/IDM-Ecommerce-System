import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Spinner } from "@/components/Spinner";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/contexts/ToastContext";
import { api } from "@/lib/api";
import type { SellerStatus, SellerWithOwner } from "@/lib/types";

const STATUS_ORDER: (SellerStatus | "ALL")[] = [
  "ALL",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
];

export default function AdminSellers() {
  const toast = useToast();
  const [filter, setFilter] = useState<SellerStatus | "ALL">("ALL");
  const [sellers, setSellers] = useState<SellerWithOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = filter === "ALL" ? {} : { status: filter };
      const { data } = await api.get<SellerWithOwner[]>("/sellers", { params });
      setSellers(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const approve = async (id: number) => {
    setActing(id);
    try {
      await api.post(`/sellers/${id}/approve`);
      toast.success("Empresa aprobada.");
      await load();
    } catch {
      toast.error("Error al aprobar.");
    } finally {
      setActing(null);
    }
  };

  const reject = async (id: number) => {
    const reason = window.prompt("Motivo del rechazo:");
    if (!reason) return;
    setActing(id);
    try {
      await api.post(`/sellers/${id}/reject`, { reason });
      toast.success("Empresa rechazada.");
      await load();
    } catch {
      toast.error("Error al rechazar.");
    } finally {
      setActing(null);
    }
  };

  const suspend = async (id: number) => {
    if (!confirm("¿Suspender empresa? No podrá vender hasta reactivarla.")) return;
    setActing(id);
    try {
      await api.post(`/sellers/${id}/suspend`);
      toast.success("Empresa suspendida.");
      await load();
    } catch {
      toast.error("Error al suspender.");
    } finally {
      setActing(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Empresas vendedoras"
        description="Aprueba o rechaza las empresas que solicitan vender en la plataforma."
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
      ) : sellers.length === 0 ? (
        <EmptyState title="Sin empresas" description="No hay empresas con ese filtro." />
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-ink-200">
          <table className="min-w-full divide-y divide-ink-200 text-sm">
            <thead className="bg-ink-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">NIT</th>
                <th className="px-4 py-3">Dueño</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200">
              {sellers.map((s) => (
                <tr key={s.id} className="hover:bg-ink-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink-900">
                      {s.name}
                      {s.is_house && (
                        <span className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                          RAÍZ
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink-500">
                      {s.contact_email} · {s.city ?? "—"}
                    </div>
                    {s.description && (
                      <div className="mt-1 text-xs text-ink-500 line-clamp-2 max-w-md">
                        {s.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{s.nit}</td>
                  <td className="px-4 py-3">
                    {s.owner ? (
                      <div>
                        <div className="font-medium">{s.owner.full_name}</div>
                        <div className="text-xs text-ink-500">{s.owner.email}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={s.status} />
                    {s.status === "REJECTED" && s.rejection_reason && (
                      <div className="mt-1 max-w-xs text-xs text-rose-600">
                        {s.rejection_reason}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {s.status === "PENDING" && (
                        <>
                          <button
                            onClick={() => approve(s.id)}
                            disabled={acting === s.id}
                            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            Aprobar
                          </button>
                          <button
                            onClick={() => reject(s.id)}
                            disabled={acting === s.id}
                            className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                          >
                            Rechazar
                          </button>
                        </>
                      )}
                      {s.status === "APPROVED" && !s.is_house && (
                        <button
                          onClick={() => suspend(s.id)}
                          disabled={acting === s.id}
                          className="rounded-md bg-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-300 disabled:opacity-50"
                        >
                          Suspender
                        </button>
                      )}
                      {s.status === "REJECTED" && (
                        <button
                          onClick={() => approve(s.id)}
                          disabled={acting === s.id}
                          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Re-aprobar
                        </button>
                      )}
                      {s.status === "SUSPENDED" && (
                        <button
                          onClick={() => approve(s.id)}
                          disabled={acting === s.id}
                          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Reactivar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
