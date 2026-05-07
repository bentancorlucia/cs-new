"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Pencil, AlertCircle } from "lucide-react";
import { formatearMoneda, type Moneda } from "@/lib/tesoreria/conversion";

type Categoria = {
  id: number;
  nombre: string;
  slug: string;
  tipo: "ingreso" | "egreso";
  padre_id: number | null;
  color: string | null;
};

type Movimiento = {
  id: number;
  cuenta_id: number;
  tipo: "ingreso" | "egreso";
  categoria_id: number | null;
  monto: number | string;
  moneda: string;
  fecha: string;
  descripcion: string;
  nombre: string | null;
  notas: string | null;
  referencia: string | null;
  clasificado: boolean;
  origen_tipo: string | null;
  categorias_financieras?: {
    id: number;
    nombre: string;
    slug: string;
    color: string | null;
    tipo: string;
  } | null;
};

export function CuentaDetalleClient({
  cuentaMoneda,
  movimientosIniciales,
  categorias,
}: {
  cuentaId: number;
  cuentaMoneda: Moneda;
  movimientosIniciales: Movimiento[];
  categorias: Categoria[];
}) {
  const [movimientos, setMovimientos] = useState(movimientosIniciales);
  const [filtroSinClasificar, setFiltroSinClasificar] = useState(false);

  const visibles = filtroSinClasificar
    ? movimientos.filter((m) => !m.clasificado)
    : movimientos;

  const onUpdate = (id: number, patch: Partial<Movimiento>) => {
    setMovimientos((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setFiltroSinClasificar(false)}
          className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
            !filtroSinClasificar ? "bg-bordo-800 text-white" : "bg-superficie text-muted-foreground hover:text-foreground"
          }`}
        >
          Todos ({movimientos.length})
        </button>
        <button
          onClick={() => setFiltroSinClasificar(true)}
          className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
            filtroSinClasificar ? "bg-amber-500 text-white" : "bg-superficie text-muted-foreground hover:text-foreground"
          }`}
        >
          Sin clasificar ({movimientos.filter((m) => !m.clasificado).length})
        </button>
      </div>

      <div className="rounded-2xl border border-linea bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-editorial text-muted-foreground bg-superficie">
              <tr>
                <th className="text-left px-4 py-3 font-heading">Fecha</th>
                <th className="text-left px-4 py-3 font-heading">Descripción</th>
                <th className="text-left px-4 py-3 font-heading">Categoría</th>
                <th className="text-right px-4 py-3 font-heading">Monto</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {visibles.map((m) => (
                  <MovimientoFila
                    key={m.id}
                    movimiento={m}
                    cuentaMoneda={cuentaMoneda}
                    categorias={categorias}
                    onUpdate={onUpdate}
                  />
                ))}
              </AnimatePresence>
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {filtroSinClasificar ? "No hay movimientos sin clasificar 🎉" : "No hay movimientos."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MovimientoFila({
  movimiento,
  cuentaMoneda,
  categorias,
  onUpdate,
}: {
  movimiento: Movimiento;
  cuentaMoneda: Moneda;
  categorias: Categoria[];
  onUpdate: (id: number, patch: Partial<Movimiento>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();
  const [nombre, setNombre] = useState(movimiento.nombre ?? "");
  const [notas, setNotas] = useState(movimiento.notas ?? "");
  const [categoriaId, setCategoriaId] = useState<number | null>(movimiento.categoria_id);
  const [tipo, setTipo] = useState<"ingreso" | "egreso">(movimiento.tipo);

  const guardar = () => {
    startTransition(async () => {
      const res = await fetch(`/api/tesoreria/movimientos/${movimiento.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, notas, categoria_id: categoriaId, tipo }),
      });
      if (res.ok) {
        const cat = categorias.find((c) => c.id === categoriaId);
        onUpdate(movimiento.id, {
          nombre,
          notas,
          categoria_id: categoriaId,
          tipo,
          clasificado: categoriaId !== null,
          categorias_financieras: cat
            ? { id: cat.id, nombre: cat.nombre, slug: cat.slug, color: cat.color, tipo: cat.tipo }
            : null,
        });
        setEditing(false);
      }
    });
  };

  const monto = Number(movimiento.monto);
  const esIngreso = movimiento.tipo === "ingreso";
  const cat = movimiento.categorias_financieras;
  const moneda = (movimiento.moneda as Moneda) || cuentaMoneda;

  const categoriasOrdenadas = categorias.filter((c) => !c.padre_id);
  const subPorPadre = (id: number) => categorias.filter((c) => c.padre_id === id);

  return (
    <motion.tr
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="border-t border-linea hover:bg-superficie/50"
    >
      <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
        {new Date(movimiento.fecha + "T00:00:00").toLocaleDateString("es-UY", {
          day: "2-digit",
          month: "short",
        })}
      </td>
      <td className="px-4 py-3 max-w-xs">
        {editing ? (
          <div className="space-y-2">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre/alias"
              className="w-full text-sm border border-linea rounded-md px-2 py-1 outline-none focus:border-bordo-700"
            />
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Notas"
              className="w-full text-xs border border-linea rounded-md px-2 py-1 outline-none focus:border-bordo-700"
              rows={2}
            />
          </div>
        ) : (
          <div className="space-y-0.5">
            {movimiento.nombre && (
              <div className="font-medium text-foreground">{movimiento.nombre}</div>
            )}
            <div className={movimiento.nombre ? "text-xs text-muted-foreground" : "text-foreground"}>
              {movimiento.descripcion}
            </div>
            {movimiento.notas && (
              <div className="text-xs text-muted-foreground italic">{movimiento.notas}</div>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1">
              {(["ingreso", "egreso"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTipo(t)}
                  className={`text-xs px-2 py-0.5 rounded ${
                    tipo === t
                      ? t === "ingreso"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-rose-100 text-rose-700"
                      : "bg-superficie text-muted-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <select
              value={categoriaId ?? ""}
              onChange={(e) => setCategoriaId(e.target.value ? Number(e.target.value) : null)}
              className="text-sm border border-linea rounded-md px-2 py-1 outline-none focus:border-bordo-700"
            >
              <option value="">— Sin clasificar —</option>
              {categoriasOrdenadas
                .filter((c) => c.tipo === tipo)
                .map((c) => (
                  <optgroup key={c.id} label={c.nombre}>
                    <option value={c.id}>{c.nombre}</option>
                    {subPorPadre(c.id).map((s) => (
                      <option key={s.id} value={s.id}>
                        &nbsp;&nbsp;{s.nombre}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
          </div>
        ) : cat ? (
          <span
            className="inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 font-medium"
            style={{ backgroundColor: (cat.color ?? "#730d32") + "1a", color: cat.color ?? "#730d32" }}
          >
            {cat.nombre}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
            <AlertCircle className="size-3" /> Sin clasificar
          </span>
        )}
      </td>
      <td className={`px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap ${esIngreso ? "text-emerald-700" : "text-rose-700"}`}>
        {esIngreso ? "+" : "-"}
        {formatearMoneda(monto, moneda)}
      </td>
      <td className="px-2 py-3">
        {editing ? (
          <button
            onClick={guardar}
            className="p-1.5 rounded-md text-emerald-700 hover:bg-emerald-50"
          >
            <Check className="size-4" />
          </button>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-bordo-700 hover:bg-bordo-50"
          >
            <Pencil className="size-4" />
          </button>
        )}
      </td>
    </motion.tr>
  );
}
