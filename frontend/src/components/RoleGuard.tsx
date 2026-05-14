import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/lib/types";

export function RoleGuard({
  allow,
  children,
}: {
  allow: UserRole[];
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!allow.includes(user.role))
    return (
      <div className="card max-w-md">
        <h3 className="text-base font-semibold text-ink-900">
          Acceso restringido
        </h3>
        <p className="mt-1 text-sm text-ink-500">
          Tu rol ({user.role}) no tiene permisos para esta sección.
        </p>
      </div>
    );
  return <>{children}</>;
}
