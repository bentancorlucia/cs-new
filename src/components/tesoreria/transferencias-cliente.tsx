"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Plus, Trash2, Loader2, AlertCircle } from "lucide-react";
import { springSmooth } from "@/lib/motion";
import { formatearMoneda, type Moneda } from "@/lib/tesoreria/conversion";
import type { Cotizacion } from "@/lib/tesoreria/bcu";

type Cuenta = {
  id: number;
  nombre: string;
  moneda: Moneda;
  color: string | null;
  saldo_actual: number | string;
};

type Transferencia = {
  id: number;
  fecha: string;
  monto_origen: number | string;
  moneda_origen: Moneda;
  monto_destino: number | string;
  moneda_destino: Moneda;
  tipo_cambio: number | string | null;
  descripcion: string | null;
  cuenta_origen?: { id: number; nombre: string; moneda: Moneda; color: string | null } | null;
  cuenta_destino?: { id: number; nombre: string; moneda: Moneda; color: string | null } | null;
};

export function TransferenciasCliente({
  cuentas,
  cotizacion,
}: {
  cuentas: Cuenta[];
  cotizacion: Cotizacion | null;
}) {
  const [showForm, setShowForm] = useState(false);
  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [loading, setLoading] = useState(true);

  const cargar = async () => {
    setLoading(true);
    const res = await fetch("/api/tesoreria/transferencias");
    const data = await res.json();
    setTransferencias(data.transferencias ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  return (
    <div className="space-y-4">
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-full bg-bordo-800 text-white text-sm font-medium px-4 py-2 hover:bg-bordo-900"
        >
          <Plus className="size-4" /> Nueva transferencia
        </button>
      ) : (
        <NuevaTransferenciaForm
          cuentas={cuentas}
          cotizacion={cotizacion}
          onCancel={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            cargar();
          }}
        />
      )}

      <div className="rounded-2xl border border-linea bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-editorial text-muted-foreground bg-superficie">
              <tr>
                <th className="text-left px-4 py-3 font-heading">Fecha</th>
                <th className="text-left px-4 py-3 font-heading">Origen</th>
                <th className="px-4 py-3 font-heading"></th>
                <th className="text-left px-4 py-3 font-heading">Destino</th>
                <th className="text-left px-4 py-3 font-heading">Tipo de cambio</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    Cargando…
                  </td>
                </tr>
              ) : transferencias.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    Aún no hay transferencias.
                  </td>
                </tr>
              ) : (
                <AnimatePresence>
                  {transferencias.map((t) => (
                    <TransferenciaFila
                      key={t.id}
                      t={t}
                      onDelete={async () => {
                        if (!confirm("¿Eliminar transferencia y sus movimientos?")) return;
                        await fetch(`/api/tesoreria/transferencias/${t.id}`, { method: "DELETE" });
                        cargar();
                      }}
                    />
                  ))}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TransferenciaFila({
  t,
  onDelete,
}: {
  t: Transferencia;
  onDelete: () => void;
}) {
  const tc = t.tipo_cambio ? Number(t.tipo_cambio) : null;
  return (
    <motion.tr
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="border-t border-linea hover:bg-superficie/50"
    >
      <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
        {new Date(t.fecha + "T00:00:00").toLocaleDateString("es-UY", {
          day: "2-digit",
          month: "short",
          year: "2-digit",
        })}
      </td>
      <td className="px-4 py-3">
        <CuentaPill cuenta={t.cuenta_origen} />
        <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
          -{formatearMoneda(Number(t.monto_origen), t.moneda_origen)}
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        <ArrowRight className="size-4" />
      </td>
      <td className="px-4 py-3">
        <CuentaPill cuenta={t.cuenta_destino} />
        <div className="text-xs text-emerald-700 tabular-nums mt-0.5">
          +{formatearMoneda(Number(t.monto_destino), t.moneda_destino)}
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {tc ? `${tc.toFixed(4)} ${t.moneda_origen}/${t.moneda_destino}` : "—"}
        {t.descripcion && <div className="text-[11px] italic mt-0.5">{t.descripcion}</div>}
      </td>
      <td className="px-2 py-3">
        <button
          onClick={onDelete}
          className="p-1.5 rounded-md text-muted-foreground hover:text-rose-700 hover:bg-rose-50"
        >
          <Trash2 className="size-4" />
        </button>
      </td>
    </motion.tr>
  );
}

function CuentaPill({
  cuenta,
}: {
  cuenta: { nombre: string; color: string | null } | null | undefined;
}) {
  if (!cuenta) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs rounded-full px-2 py-0.5 font-medium"
      style={{ backgroundColor: (cuenta.color ?? "#730d32") + "1a", color: cuenta.color ?? "#730d32" }}
    >
      {cuenta.nombre}
    </span>
  );
}

function NuevaTransferenciaForm({
  cuentas,
  cotizacion,
  onCancel,
  onSuccess,
}: {
  cuentas: Cuenta[];
  cotizacion: Cotizacion | null;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [origenId, setOrigenId] = useState<number | "">("");
  const [destinoId, setDestinoId] = useState<number | "">("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [montoOrigen, setMontoOrigen] = useState("");
  const [montoDestino, setMontoDestino] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  const origen = cuentas.find((c) => c.id === origenId);
  const destino = cuentas.find((c) => c.id === destinoId);
  const cruzaMoneda = origen && destino && origen.moneda !== destino.moneda;

  // Sugerir monto destino con cotización BCU si hay
  const tcSugerido = useMemo(() => {
    if (!cruzaMoneda || !cotizacion) return null;
    const mid = (cotizacion.compra + cotizacion.venta) / 2;
    return mid;
  }, [cruzaMoneda, cotizacion]);

  const aplicarSugerencia = () => {
    if (!tcSugerido || !montoOrigen) return;
    const monto = Number(montoOrigen);
    if (origen!.moneda === "USD" && destino!.moneda === "UYU") {
      setMontoDestino((monto * tcSugerido).toFixed(2));
    } else if (origen!.moneda === "UYU" && destino!.moneda === "USD") {
      setMontoDestino((monto / tcSugerido).toFixed(2));
    }
  };

  // Si misma moneda, copiar monto destino = origen
  useEffect(() => {
    if (origen && destino && origen.moneda === destino.moneda && montoOrigen) {
      setMontoDestino(montoOrigen);
    }
  }, [origenId, destinoId, montoOrigen, origen, destino]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!origenId || !destinoId) {
      setError("Elegí cuenta origen y destino");
      return;
    }
    if (origenId === destinoId) {
      setError("Origen y destino deben ser distintos");
      return;
    }
    const mo = Number(montoOrigen);
    const md = Number(montoDestino);
    if (!mo || !md) {
      setError("Ingresá ambos montos");
      return;
    }

    setSubmitting(true);
    startTransition(async () => {
      const res = await fetch("/api/tesoreria/transferencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cuenta_origen_id: Number(origenId),
          cuenta_destino_id: Number(destinoId),
          fecha,
          monto_origen: mo,
          monto_destino: md,
          descripcion: descripcion || null,
        }),
      });
      setSubmitting(false);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error al crear transferencia");
        return;
      }
      onSuccess();
    });
  };

  return (
    <motion.form
      onSubmit={onSubmit}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={springSmooth}
      className="rounded-2xl border border-linea bg-white p-5 space-y-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-xs uppercase tracking-editorial font-heading text-muted-foreground mb-1.5">
            Desde
          </label>
          <select
            value={origenId}
            onChange={(e) => setOrigenId(e.target.value ? Number(e.target.value) : "")}
            className="w-full text-sm border border-linea rounded-lg px-3 py-2 outline-none focus:border-bordo-700"
          >
            <option value="">— Cuenta origen —</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.moneda} · {formatearMoneda(Number(c.saldo_actual), c.moneda)})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-editorial font-heading text-muted-foreground mb-1.5">
            Hacia
          </label>
          <select
            value={destinoId}
            onChange={(e) => setDestinoId(e.target.value ? Number(e.target.value) : "")}
            className="w-full text-sm border border-linea rounded-lg px-3 py-2 outline-none focus:border-bordo-700"
          >
            <option value="">— Cuenta destino —</option>
            {cuentas
              .filter((c) => c.id !== origenId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.moneda})
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-editorial font-heading text-muted-foreground mb-1.5">
            Monto origen {origen ? `(${origen.moneda})` : ""}
          </label>
          <input
            type="number"
            step="0.01"
            value={montoOrigen}
            onChange={(e) => setMontoOrigen(e.target.value)}
            className="w-full text-sm border border-linea rounded-lg px-3 py-2 outline-none focus:border-bordo-700 tabular-nums"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-editorial font-heading text-muted-foreground mb-1.5 flex items-center justify-between">
            <span>Monto destino {destino ? `(${destino.moneda})` : ""}</span>
            {cruzaMoneda && tcSugerido && (
              <button
                type="button"
                onClick={aplicarSugerencia}
                className="text-[10px] normal-case tracking-normal text-bordo-700 hover:underline"
              >
                Aplicar BCU ({tcSugerido.toFixed(2)})
              </button>
            )}
          </label>
          <input
            type="number"
            step="0.01"
            value={montoDestino}
            onChange={(e) => setMontoDestino(e.target.value)}
            className="w-full text-sm border border-linea rounded-lg px-3 py-2 outline-none focus:border-bordo-700 tabular-nums"
            placeholder="0.00"
          />
          {cruzaMoneda && montoOrigen && montoDestino && (
            <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">
              TC efectivo: {(Number(montoDestino) / Number(montoOrigen)).toFixed(4)}
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs uppercase tracking-editorial font-heading text-muted-foreground mb-1.5">
            Fecha
          </label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full text-sm border border-linea rounded-lg px-3 py-2 outline-none focus:border-bordo-700"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-editorial font-heading text-muted-foreground mb-1.5">
            Descripción
          </label>
          <input
            type="text"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="w-full text-sm border border-linea rounded-lg px-3 py-2 outline-none focus:border-bordo-700"
            placeholder="Compra de USD para reserva"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <AlertCircle className="size-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-full bg-bordo-800 text-white text-sm font-medium px-5 py-2 hover:bg-bordo-900 disabled:opacity-60"
        >
          {submitting && <Loader2 className="size-4 animate-spin" />}
          Crear transferencia
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </motion.form>
  );
}
