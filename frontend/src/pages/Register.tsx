import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";

export default function Register() {
  const { registerB2C } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    phone: "",
    city: "La Paz",
    tax_id: "",
  });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await registerB2C({
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        phone: form.phone || undefined,
        city: form.city || undefined,
        tax_id: form.tax_id || undefined,
      });
      toast.success("¡Cuenta creada!");
      navigate("/", { replace: true });
    } catch (err: unknown) {
      const detail =
        // @ts-expect-error axios error shape
        err?.response?.data?.detail ?? "No se pudo crear la cuenta.";
      toast.error(typeof detail === "string" ? detail : "Error de validación");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-ink-100 px-4 py-12">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-card ring-1 ring-ink-200"
      >
        <div className="mb-6">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            IDM
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink-900">
            Crear cuenta minorista
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Registrate como cliente B2C para comprar repuestos y lubricantes.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <label className="block">
            <span className="label">Nombre completo</span>
            <input
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="input mt-1"
            />
          </label>
          <label className="block">
            <span className="label">Email</span>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input mt-1"
            />
          </label>
          <label className="block">
            <span className="label">Contraseña (8+ caracteres)</span>
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="input mt-1"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Teléfono</span>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="input mt-1"
                placeholder="+591…"
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
          </div>
          <label className="block">
            <span className="label">NIT / CI (opcional)</span>
            <input
              value={form.tax_id}
              onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
              className="input mt-1"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary mt-6 w-full"
        >
          {submitting ? "Creando…" : "Crear cuenta"}
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
