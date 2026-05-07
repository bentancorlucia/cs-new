"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Upload, Loader2, CheckCircle2, AlertCircle, FileText } from "lucide-react";
import { formatearMoneda } from "@/lib/tesoreria/conversion";

type PreviewMov = {
  fecha: string;
  descripcion: string;
  monto: number;
  tipo: "ingreso" | "egreso";
  saldo_post: number | null;
};

type Preview = {
  total: number;
  nuevos: number;
  duplicados: number;
  movimientos: PreviewMov[];
  fecha_desde: string | null;
  fecha_hasta: string | null;
  saldo_inicial: number | null;
  saldo_final: number | null;
};

export function ImportarExtractoCliente({
  cuentaId,
  cuentaNombre,
}: {
  cuentaId: number;
  cuentaNombre: string;
}) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<{ creados: number; duplicados: number } | null>(null);

  const onPreview = async () => {
    if (!archivo) return;
    setLoading(true);
    setError(null);
    const fd = new FormData();
    fd.append("cuenta_id", String(cuentaId));
    fd.append("archivo", archivo);
    fd.append("dry_run", "1");
    const res = await fetch("/api/tesoreria/extractos/importar", { method: "POST", body: fd });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo procesar el archivo");
      return;
    }
    setPreview(data);
  };

  const onConfirmar = async () => {
    if (!archivo) return;
    setLoading(true);
    setError(null);
    const fd = new FormData();
    fd.append("cuenta_id", String(cuentaId));
    fd.append("archivo", archivo);
    const res = await fetch("/api/tesoreria/extractos/importar", { method: "POST", body: fd });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo importar");
      return;
    }
    setConfirmado({ creados: data.creados, duplicados: data.duplicados });
    setTimeout(() => router.push(`/tesoreria/cuentas/${cuentaId}`), 1500);
  };

  if (confirmado) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center"
      >
        <CheckCircle2 className="size-10 text-emerald-600 mx-auto" />
        <h3 className="font-heading text-lg text-emerald-900 mt-3">Import completado</h3>
        <p className="text-sm text-emerald-800 mt-1">
          {confirmado.creados} movimientos nuevos · {confirmado.duplicados} duplicados ignorados
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dashed border-linea bg-white p-6">
        <label className="flex flex-col items-center gap-3 cursor-pointer">
          <Upload className="size-8 text-bordo-700" />
          <div className="text-center">
            <div className="font-heading text-base">
              {archivo ? archivo.name : "Subí el extracto CSV"}
            </div>
            <div className="text-xs text-muted-foreground">
              {archivo
                ? `${(archivo.size / 1024).toFixed(1)} KB`
                : "Arrastrá o seleccioná el archivo descargado de ITAÚ"}
            </div>
          </div>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setArchivo(e.target.files?.[0] ?? null);
              setPreview(null);
              setError(null);
            }}
            className="hidden"
          />
          <span className="text-xs text-bordo-700 underline">
            {archivo ? "Cambiar archivo" : "Seleccionar archivo"}
          </span>
        </label>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <AlertCircle className="size-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {archivo && !preview && !error && (
        <button
          onClick={onPreview}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full bg-bordo-800 text-white text-sm font-medium px-5 py-2 hover:bg-bordo-900 disabled:opacity-60"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
          Previsualizar
        </button>
      )}

      {preview && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-linea bg-white overflow-hidden"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-linea border-b border-linea">
            <Stat label="Detectados" valor={preview.total} />
            <Stat label="Nuevos" valor={preview.nuevos} highlight />
            <Stat label="Duplicados" valor={preview.duplicados} mute />
            <Stat
              label="Período"
              valor={
                preview.fecha_desde && preview.fecha_hasta
                  ? `${fmt(preview.fecha_desde)} → ${fmt(preview.fecha_hasta)}`
                  : "—"
              }
              small
            />
          </div>

          {preview.saldo_inicial !== null && preview.saldo_final !== null && (
            <div className="px-4 py-2 text-xs text-muted-foreground bg-superficie border-b border-linea">
              Saldo extracto: {formatearMoneda(preview.saldo_inicial, "UYU")} →{" "}
              {formatearMoneda(preview.saldo_final, "UYU")}
            </div>
          )}

          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-editorial text-muted-foreground bg-superficie sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 font-heading">Fecha</th>
                  <th className="text-left px-4 py-2 font-heading">Descripción</th>
                  <th className="text-right px-4 py-2 font-heading">Monto</th>
                </tr>
              </thead>
              <tbody>
                {preview.movimientos.map((m, i) => (
                  <tr key={i} className="border-t border-linea">
                    <td className="px-4 py-2 text-muted-foreground tabular-nums whitespace-nowrap">
                      {fmt(m.fecha)}
                    </td>
                    <td className="px-4 py-2 max-w-md truncate">{m.descripcion}</td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums whitespace-nowrap ${
                        m.tipo === "ingreso" ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {m.tipo === "ingreso" ? "+" : "-"}
                      {formatearMoneda(m.monto, "UYU")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-3 p-4 border-t border-linea">
            <button
              onClick={() => setPreview(null)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirmar}
              disabled={loading || preview.nuevos === 0}
              className="inline-flex items-center gap-2 rounded-full bg-bordo-800 text-white text-sm font-medium px-5 py-2 hover:bg-bordo-900 disabled:opacity-60"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Importar {preview.nuevos} {preview.nuevos === 1 ? "movimiento" : "movimientos"}
            </button>
          </div>
        </motion.div>
      )}

      <div className="rounded-xl bg-superficie/60 p-4 text-xs text-muted-foreground">
        <strong className="text-foreground">¿Cómo descargar el extracto?</strong> En el home banking
        de ITAÚ, ingresá a la cuenta {cuentaNombre}, seleccioná el período deseado y elegí "exportar
        movimientos a CSV". Luego subí ese archivo aquí. Los duplicados se detectan automáticamente,
        así que podés re-importar sin riesgo.
      </div>
    </div>
  );
}

function Stat({
  label,
  valor,
  highlight,
  mute,
  small,
}: {
  label: string;
  valor: number | string;
  highlight?: boolean;
  mute?: boolean;
  small?: boolean;
}) {
  return (
    <div className="px-4 py-3">
      <div className="text-xs uppercase tracking-editorial text-muted-foreground font-heading">
        {label}
      </div>
      <div
        className={`font-heading mt-0.5 tabular-nums ${
          highlight
            ? "text-emerald-700 text-xl"
            : mute
              ? "text-muted-foreground text-xl"
              : small
                ? "text-foreground text-sm"
                : "text-foreground text-xl"
        }`}
      >
        {valor}
      </div>
    </div>
  );
}

function fmt(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}
