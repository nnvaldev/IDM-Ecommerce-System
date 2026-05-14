import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AdminUserView, UserRole } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { FullPageSpinner } from "@/components/Spinner";
import { EmptyState } from "@/components/EmptyState";
import { PlusIcon } from "@/components/Icons";
import { useToast } from "@/contexts/ToastContext";

const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: "Administrador",
  SALES: "Ejecutivo Ventas",
  WAREHOUSE_MANAGER: "Encargado Almacén",
  SELLER: "Empresa Vendedora",
  CLIENT_B2B: "Cliente B2B",
  CLIENT_B2C: "Cliente B2C",
};

type Mode = "list" | "user" | "b2b";

export default function AdminUsers() {
  const toast = useToast();
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("list");

  const reload = async () => {
    setLoading(true);
    const r = await api.get<AdminUserView[]>("/users");
    setUsers(r.data);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  if (loading) return <FullPageSpinner label="Cargando usuarios…" />;

  return (
    <div>
      <PageHeader
        title="Usuarios y roles"
        description="Gestión RBAC: admin, ventas, almacén, clientes B2B/B2C."
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => setMode(mode === "user" ? "list" : "user")}
              className="btn-ghost"
            >
              <PlusIcon className="h-4 w-4" /> Nuevo usuario
            </button>
            <button
              onClick={() => setMode(mode === "b2b" ? "list" : "b2b")}
              className="btn-primary"
            >
              <PlusIcon className="h-4 w-4" /> Nuevo cliente B2B
            </button>
          </div>
        }
      />

      {mode === "user" && <NewUserForm onSaved={() => { setMode("list"); reload(); }} />}
      {mode === "b2b" && <NewB2BForm onSaved={() => { setMode("list"); reload(); }} />}

      {users.length === 0 ? (
        <EmptyState title="Sin usuarios" />
      ) : (
        <div className="card-section overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Email</th>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="text-xs">{u.id}</td>
                  <td className="font-mono text-xs">{u.email}</td>
                  <td>{u.full_name}</td>
                  <td>
                    <span className="badge bg-ink-100 text-ink-700 ring-1 ring-ink-200">
                      {ROLE_LABEL[u.role]}
                    </span>
                  </td>
                  <td>
                    {u.is_active ? (
                      <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                        Activo
                      </span>
                    ) : (
                      <span className="badge bg-red-50 text-red-700 ring-1 ring-red-200">
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="text-right">
                    <button
                      onClick={async () => {
                        await api.patch(`/users/${u.id}`, {
                          is_active: !u.is_active,
                        });
                        toast.success("Estado actualizado");
                        reload();
                      }}
                      className="btn-ghost h-7 px-2 text-xs"
                    >
                      {u.is_active ? "Desactivar" : "Activar"}
                    </button>
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

function NewUserForm({ onSaved }: { onSaved: () => void }) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "SALES" as UserRole,
    is_active: true,
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/users", form);
      toast.success("Usuario creado");
      onSaved();
    } catch (err: unknown) {
      // @ts-expect-error axios shape
      const detail = err?.response?.data?.detail ?? "Error al crear";
      toast.error(typeof detail === "string" ? detail : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="card mb-6">
      <h3 className="text-sm font-semibold text-ink-900">Nuevo usuario</h3>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label>
          <span className="label">Nombre completo</span>
          <input
            required
            className="input mt-1"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </label>
        <label>
          <span className="label">Email</span>
          <input
            required
            type="email"
            className="input mt-1"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label>
          <span className="label">Contraseña</span>
          <input
            required
            type="password"
            minLength={8}
            className="input mt-1"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <label>
          <span className="label">Rol</span>
          <select
            className="input mt-1"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
          >
            {Object.entries(ROLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="submit" disabled={submitting} className="btn-primary mt-4">
        {submitting ? "Creando…" : "Crear usuario"}
      </button>
    </form>
  );
}

function NewB2BForm({ onSaved }: { onSaved: () => void }) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    business_name: "",
    tax_id: "",
    phone: "",
    address: "",
    city: "La Paz",
    credit_limit: 10000,
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/users/b2b", form);
      toast.success("Cuenta B2B creada con línea de crédito");
      onSaved();
    } catch (err: unknown) {
      // @ts-expect-error axios shape
      const detail = err?.response?.data?.detail ?? "Error";
      toast.error(typeof detail === "string" ? detail : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="card mb-6">
      <h3 className="text-sm font-semibold text-ink-900">
        Alta de cliente corporativo (B2B)
      </h3>
      <p className="mt-1 text-xs text-ink-500">
        Crea User + Customer + Línea de Crédito en una sola operación.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label>
          <span className="label">Razón social</span>
          <input
            required
            className="input mt-1"
            value={form.business_name}
            onChange={(e) => setForm({ ...form, business_name: e.target.value })}
          />
        </label>
        <label>
          <span className="label">NIT</span>
          <input
            required
            className="input mt-1"
            value={form.tax_id}
            onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
          />
        </label>
        <label>
          <span className="label">Contacto (nombre)</span>
          <input
            required
            className="input mt-1"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </label>
        <label>
          <span className="label">Email</span>
          <input
            required
            type="email"
            className="input mt-1"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label>
          <span className="label">Contraseña</span>
          <input
            required
            type="password"
            minLength={8}
            className="input mt-1"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <label>
          <span className="label">Teléfono</span>
          <input
            className="input mt-1"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </label>
        <label>
          <span className="label">Ciudad</span>
          <select
            className="input mt-1"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          >
            <option>La Paz</option>
            <option>Cochabamba</option>
            <option>Santa Cruz</option>
          </select>
        </label>
        <label>
          <span className="label">Línea de crédito (Bs.)</span>
          <input
            type="number"
            min={0}
            step={100}
            className="input mt-1"
            value={form.credit_limit}
            onChange={(e) =>
              setForm({ ...form, credit_limit: Number(e.target.value) })
            }
          />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Dirección</span>
          <input
            className="input mt-1"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </label>
      </div>
      <button type="submit" disabled={submitting} className="btn-primary mt-4">
        {submitting ? "Creando…" : "Crear cliente B2B"}
      </button>
    </form>
  );
}
