import { createContext, useCallback, useContext, useState, ReactNode } from "react";

type ToastKind = "success" | "error" | "info";

interface ToastMessage {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ToastContextValue {
  show: (text: string, kind?: ToastKind) => void;
  success: (text: string) => void;
  error: (text: string) => void;
  info: (text: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMessage[]>([]);

  const show = useCallback((text: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 4000);
  }, []);

  const value: ToastContextValue = {
    show,
    success: (t) => show(t, "success"),
    error: (t) => show(t, "error"),
    info: (t) => show(t, "info"),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={
              "pointer-events-auto rounded-lg px-4 py-3 text-sm shadow-card ring-1 " +
              (t.kind === "success"
                ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
                : t.kind === "error"
                  ? "bg-red-50 text-red-900 ring-red-200"
                  : "bg-white text-ink-800 ring-ink-200")
            }
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de ToastProvider");
  return ctx;
}
