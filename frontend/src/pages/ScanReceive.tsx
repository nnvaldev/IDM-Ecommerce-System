import { FormEvent, useRef, useState } from "react";
import { Scanner, IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { api } from "@/lib/api";
import type { StockTransfer } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { QrIcon, XIcon } from "@/components/Icons";
import { useToast } from "@/contexts/ToastContext";

export default function ScanReceive() {
  const toast = useToast();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<StockTransfer | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const submitToken = async (raw: string) => {
    const value = raw.trim();
    if (!value || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await api.post<StockTransfer>("/transfers/scan-receive", {
        qr_token: value,
      });
      setLast(r.data);
      toast.success(`Recibido · ${r.data.transfer_number}`);
      setToken("");
      setScanning(false);
    } catch (err: unknown) {
      // @ts-expect-error axios shape
      const detail = err?.response?.data?.detail ?? "Error";
      toast.error(typeof detail === "string" ? detail : "QR inválido");
    } finally {
      setBusy(false);
      // pequeño debounce para evitar relecturas continuas mientras la cámara sigue
      setTimeout(() => {
        inFlight.current = false;
      }, 600);
    }
  };

  const handleManual = (e: FormEvent) => {
    e.preventDefault();
    void submitToken(token);
  };

  const handleScan = (codes: IDetectedBarcode[]) => {
    if (codes.length > 0) {
      const raw = codes[0].rawValue;
      if (raw) void submitToken(raw);
    }
  };

  return (
    <div>
      <PageHeader
        title="Recibir traspaso (QR)"
        description="Escaneá la Nota de Remisión con la cámara o pegá el token para confirmar la recepción y sumar al inventario destino."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <div className="grid h-12 w-12 place-items-center rounded-lg bg-brand-50 text-brand-700">
                <QrIcon className="h-6 w-6" />
              </div>
              <h3 className="mt-3 text-base font-semibold text-ink-900">
                Escanear QR
              </h3>
              <p className="mt-1 text-xs text-ink-500">
                Apuntá la cámara al QR de la Nota de Remisión. La recepción se
                confirma automáticamente.
              </p>
            </div>
            {scanning ? (
              <button
                onClick={() => setScanning(false)}
                className="btn-ghost h-8 px-3 text-xs"
              >
                <XIcon className="h-3.5 w-3.5" /> Detener
              </button>
            ) : (
              <button
                onClick={() => {
                  setCameraError(null);
                  setScanning(true);
                }}
                className="btn-primary h-8 px-3 text-xs"
              >
                Activar cámara
              </button>
            )}
          </div>

          <div className="mt-4 overflow-hidden rounded-lg bg-ink-900 ring-1 ring-ink-200">
            {scanning ? (
              <div className="aspect-square w-full">
                <Scanner
                  onScan={handleScan}
                  onError={(err: unknown) => {
                    const message =
                      err instanceof Error ? err.message : "Error de cámara";
                    setCameraError(message);
                    setScanning(false);
                  }}
                  scanDelay={400}
                  constraints={{ facingMode: "environment" }}
                  styles={{
                    container: { width: "100%", height: "100%" },
                    video: { width: "100%", height: "100%", objectFit: "cover" },
                  }}
                />
              </div>
            ) : (
              <div className="grid aspect-square w-full place-items-center text-xs text-ink-300">
                Cámara apagada
              </div>
            )}
          </div>

          {cameraError && (
            <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
              {cameraError}. Verificá los permisos de cámara o usá el formulario
              manual.
            </div>
          )}

          <form onSubmit={handleManual} className="mt-4">
            <div className="label">O pegá el token manualmente</div>
            <div className="mt-1 flex gap-2">
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="vnMWy2_Hc7EOksrSb_KYZs7gERfJEhEI"
                className="input flex-1 font-mono text-xs"
              />
              <button
                type="submit"
                disabled={busy || !token.trim()}
                className="btn-primary"
              >
                {busy ? "…" : "Confirmar"}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-ink-900">
            Última recepción
          </h3>
          {last ? (
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono uppercase text-ink-400">
                    {last.transfer_number}
                  </div>
                  <div className="text-sm font-medium text-ink-900">
                    Origen #{last.origin_warehouse_id} → Destino #
                    {last.destination_warehouse_id}
                  </div>
                </div>
                <StatusBadge value={last.status} />
              </div>
              <div className="mt-3 overflow-hidden rounded-lg ring-1 ring-ink-200">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th className="text-right">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {last.items.map((it, i) => (
                      <tr key={i}>
                        <td>#{it.product_id}</td>
                        <td className="text-right font-semibold">
                          {it.quantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-500">
              Las recepciones que confirmes aparecerán acá.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
