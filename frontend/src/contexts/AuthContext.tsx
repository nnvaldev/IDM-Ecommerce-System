import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { api } from "@/lib/api";
import type { UserRole } from "@/lib/types";

export interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  registerB2C: (payload: {
    email: string;
    password: string;
    full_name: string;
    phone?: string;
    city?: string;
    tax_id?: string;
  }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = "idm_token";

async function fetchMe() {
  const r = await api.get<AuthUser>("/auth/me");
  return r.data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMe()
      .then(setUser)
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const form = new URLSearchParams();
    form.append("username", email);
    form.append("password", password);
    const { data } = await api.post<{ access_token: string }>(
      "/auth/login",
      form,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    localStorage.setItem(TOKEN_KEY, data.access_token);
    setUser(await fetchMe());
  };

  const registerB2C: AuthContextValue["registerB2C"] = async (payload) => {
    const { data } = await api.post<{ access_token: string }>(
      "/auth/register",
      payload
    );
    localStorage.setItem(TOKEN_KEY, data.access_token);
    setUser(await fetchMe());
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  };

  const refresh = async () => {
    setUser(await fetchMe());
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, registerB2C, logout, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
