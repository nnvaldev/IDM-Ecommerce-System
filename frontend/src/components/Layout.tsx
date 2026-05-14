import { NavLink, useNavigate } from "react-router-dom";
import { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/lib/types";
import {
  CartIcon,
  ChartIcon,
  HomeIcon,
  LogoutIcon,
  PackageIcon,
  QrIcon,
  ReceiptIcon,
  SettingsIcon,
  TruckIcon,
  UsersIcon,
} from "@/components/Icons";

interface NavSection {
  label: string;
  to: string;
  icon: (props: React.SVGProps<SVGSVGElement>) => JSX.Element;
  roles: UserRole[];
}

const NAV: NavSection[] = [
  { label: "Inicio", to: "/", icon: HomeIcon, roles: ["ADMIN", "WAREHOUSE_MANAGER", "SALES", "SELLER", "CLIENT_B2B", "CLIENT_B2C"] },
  { label: "Catálogo", to: "/catalogo", icon: PackageIcon, roles: ["ADMIN", "WAREHOUSE_MANAGER", "SALES", "SELLER", "CLIENT_B2B", "CLIENT_B2C"] },
  { label: "Mi carrito", to: "/carrito", icon: CartIcon, roles: ["CLIENT_B2C", "CLIENT_B2B"] },
  { label: "Mis órdenes", to: "/mis-ordenes", icon: ReceiptIcon, roles: ["CLIENT_B2C", "CLIENT_B2B"] },
  { label: "POS Mostrador", to: "/pos", icon: CartIcon, roles: ["ADMIN", "SALES", "WAREHOUSE_MANAGER", "SELLER"] },
  { label: "Aprobaciones B2B", to: "/aprobaciones", icon: ReceiptIcon, roles: ["ADMIN", "SALES", "SELLER"] },
  { label: "Inventario", to: "/inventario", icon: PackageIcon, roles: ["ADMIN", "WAREHOUSE_MANAGER", "SELLER"] },
  { label: "Traspasos", to: "/traspasos", icon: TruckIcon, roles: ["ADMIN", "WAREHOUSE_MANAGER"] },
  { label: "Recibir QR", to: "/recibir", icon: QrIcon, roles: ["ADMIN", "WAREHOUSE_MANAGER"] },
  { label: "Facturación SIAT", to: "/facturas", icon: ReceiptIcon, roles: ["ADMIN", "SALES", "WAREHOUSE_MANAGER"] },
  { label: "Reportes", to: "/reportes", icon: ChartIcon, roles: ["ADMIN", "SALES"] },
  // Seller (su propia gestión)
  { label: "Mi empresa", to: "/empresa", icon: SettingsIcon, roles: ["SELLER"] },
  { label: "Mis productos", to: "/empresa/productos", icon: PackageIcon, roles: ["SELLER"] },
  { label: "Ventas de mi empresa", to: "/empresa/ventas", icon: ReceiptIcon, roles: ["SELLER"] },
  // Admin
  { label: "Empresas vendedoras", to: "/admin/empresas", icon: UsersIcon, roles: ["ADMIN"] },
  { label: "Productos (IDM)", to: "/admin/productos", icon: SettingsIcon, roles: ["ADMIN"] },
  { label: "Usuarios", to: "/usuarios", icon: UsersIcon, roles: ["ADMIN"] },
];

const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: "Administrador",
  SALES: "Ejecutivo de Ventas",
  WAREHOUSE_MANAGER: "Encargado de Almacén",
  SELLER: "Empresa Vendedora",
  CLIENT_B2B: "Cliente Corporativo",
  CLIENT_B2C: "Cliente Minorista",
};

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;
  const items = role ? NAV.filter((n) => n.roles.includes(role)) : [];

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-ink-50/60">
      <aside className="hidden w-64 flex-col border-r border-ink-200 bg-white md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white shadow-sm">
            <span className="text-sm font-bold">IDM</span>
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-ink-900">IDM S.A.</div>
            <div className="text-[11px] text-ink-500">E-Commerce multidiversificador</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 pb-4">
          {items.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition " +
                (isActive
                  ? "bg-brand-50 font-semibold text-brand-700"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-900")
              }
            >
              <Icon
                className="h-5 w-5 transition group-[.active]:text-brand-600"
                aria-hidden
              />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-ink-200 px-4 py-4">
          <div className="text-xs uppercase tracking-wide text-ink-400">
            Sesión
          </div>
          <div className="mt-1 truncate text-sm font-medium text-ink-800">
            {user?.full_name}
          </div>
          <div className="text-xs text-ink-500">
            {role ? ROLE_LABEL[role] : ""}
          </div>
          <button
            onClick={handleLogout}
            className="btn-ghost mt-3 w-full justify-center"
          >
            <LogoutIcon className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-ink-200 bg-white px-6 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-brand-600 text-xs font-bold text-white">
              IDM
            </div>
            <span className="text-sm font-semibold">IDM E-Commerce</span>
          </div>
          <button onClick={handleLogout} className="btn-ghost">
            Salir
          </button>
        </header>
        <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
