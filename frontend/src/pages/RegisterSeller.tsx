import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";

export default function RegisterSeller() {
  const navigate = useNavigate();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    nit: "",
    contact_email: "",
    phone: "",
    city: "La Paz",
    address: "",
    description: "",
    logo_url: "",
    owner_email: "",
    owner_password: "",
    owner_full_name: "",
  });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        phone: form.phone || undefined,
        address: form.address || undefined,
        description: form.description || undefined,
        logo_url: form.logo_url || undefined,
      };
      const { data } = await api.post<{ message: string; seller: { id: number } }>(
        "/sellers/register",
        payload
      );
      setSuccess(data.message);
      toast.success("¡Empresa registrada! Esperando aprobación.");
    } catch (err: unknown) {
      // @ts-expect-error axios error shape
      const detail = err?.response?.data?.detail ?? "No se pudo registrar la empresa.";
      toast.error(typeof detail === "string" ? detail : "Error de validación");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-ink-100 px-4 py-12">
        <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-card ring-1 ring-ink-200">
          <h1 className="text-2xl font-semibold text-ink-900">Solicitud enviada</h1>
          <p className="mt-3 text-sm text-ink-600">{success}</p>
          <div className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
            <p>
              Tu empresa quedó en estado <strong>PENDING</strong>. Un administrador
              revisará la solicitud y, al aprobarla, podrás iniciar sesión con la
              cuenta del representante para gestionar tu catálogo.
            </p>
          </div>
          <div className="mt-6 flex justify-end">
            <button onClick={() => navigate("/login")} className="btn-primary">
              Ir al login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-ink-100 px-4 py-12">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-card ring-1 ring-ink-200"
      >
        <div className="mb-6">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
            +
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink-900">
            Registrar empresa vendedora
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Publica tu catálogo en la plataforma IDM Marketplace. Quedarás en estado
            pendiente hasta que el administrador apruebe tu solicitud.
          </p>
        </div>

        <fieldset className="space-y-4">
          <legend className="mb-2 text-sm font-semibold text-ink-700">Datos de la empresa</legend>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <span className="label">Razón social *</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input mt-1"
              />
            </label>
            <label className="block">
              <span className="label">NIT *</span>
              <input
                required
                value={form.nit}
                onChange={(e) => setForm({ ...form, nit: e.target.value })}
                className="input mt-1"
              />
            </label>
            <label className="block">
              <span className="label">Email de contacto *</span>
              <input
                type="email"
                required
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                className="input mt-1"
              />
            </label>
            <label className="block">
              <span className="label">Teléfono</span>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="input mt-1"
              />
            </label>
            <label className="block">
              <span className="label">Ciudad</span>
              <select
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="input mt-1"
              >
                <option>La Paz</option>
                <option>Cochabamba</option>
                <option>Santa Cruz</option>
              </select>
            </label>
            <label className="block">
              <span className="label">Dirección</span>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="input mt-1"
              />
            </label>
          </div>
          <label className="block">
            <span className="label">Descripción</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input mt-1"
              placeholder="Breve descripción de tu negocio…"
            />
          </label>
          <label className="block">
            <span className="label">URL del logo (opcional)</span>
            <input
              value={form.logo_url}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
              className="input mt-1"
              placeholder="https://…"
            />
          </label>
        </fieldset>

        <fieldset className="mt-6 space-y-4 border-t border-ink-200 pt-6">
          <legend className="mb-2 text-sm font-semibold text-ink-700">
            Cuenta del representante (con esta cuenta administrarás la empresa)
          </legend>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <span className="label">Nombre completo *</span>
              <input
                required
                value={form.owner_full_name}
                onChange={(e) => setForm({ ...form, owner_full_name: e.target.value })}
                className="input mt-1"
              />
            </label>
            <label className="block">
              <span className="label">Email *</span>
              <input
                type="email"
                required
                value={form.owner_email}
                onChange={(e) => setForm({ ...form, owner_email: e.target.value })}
                className="input mt-1"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="label">Contraseña (8+ caracteres) *</span>
              <input
                type="password"
                required
                minLength={8}
                value={form.owner_password}
                onChange={(e) => setForm({ ...form, owner_password: e.target.value })}
                className="input mt-1"
              />
            </label>
          </div>
        </fieldset>

        <button type="submit" disabled={submitting} className="btn-primary mt-6 w-full">
          {submitting ? "Enviando…" : "Enviar solicitud"}
        </button>

        <p className="mt-4 text-center text-sm text-ink-500">
          ¿Ya tenés cuenta?{" "}
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Iniciar sesión
          </Link>
        </p>
      </form>
    </div>
  );
}
