import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState("admin@idm.bo");
  const [password, setPassword] = useState("admin123");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch {
      toast.error("Credenciales inválidas o servicio no disponible");
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
            IDM E-Commerce
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Sistema de Administración y Control multidiversificador.
          </p>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="label">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input mt-1"
              autoComplete="email"
            />
          </label>
          <label className="block">
            <span className="label">Contraseña</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input mt-1"
              autoComplete="current-password"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary mt-6 w-full"
        >
          {submitting ? "Ingresando…" : "Ingresar"}
        </button>

        <div className="mt-6 grid grid-cols-2 gap-3 rounded-lg bg-ink-50 p-3 text-xs text-ink-600">
          <div>
            <div className="font-semibold text-ink-700">Demo Admin</div>
            <div className="font-mono">admin@idm.bo</div>
            <div className="font-mono">admin123</div>
          </div>
          <div>
            <div className="font-semibold text-ink-700">Demo B2B</div>
            <div className="font-mono">taller@demo.bo</div>
            <div className="font-mono">demo1234</div>
          </div>
        </div>

        <div className="mt-4 space-y-1 text-center text-sm text-ink-500">
          <p>
            ¿Sos cliente nuevo?{" "}
            <Link to="/register" className="font-medium text-brand-600 hover:underline">
              Crear cuenta minorista
            </Link>
          </p>
          <p>
            ¿Tenés una empresa y querés vender en la plataforma?{" "}
            <Link
              to="/registro-empresa"
              className="font-medium text-emerald-700 hover:underline"
            >
              Registrar empresa
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
