"use client";

import { useMemo, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Pencil, AlertCircle, X } from "lucide-react";
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
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const visibles = filtroSinClasificar
    ? movimientos.filter((m) => !m.clasificado)
    : movimientos;

  const onUpdate = (id: number, patch: Partial<Movimiento>) => {
    setMovimientos((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  };

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () => {
    if (visibles.every((m) => selected.has(m.id))) {
      setSelected((prev) => {
        const next = new Set(prev);
        visibles.forEach((m) => next.delete(m.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        visibles.forEach((m) => next.add(m.id));
        return next;
      });
    }
  };

  const onBulkApplied = (
    ids: number[],
    patch: { tipo?: "ingreso" | "egreso"; categoria_id: number | null },
    cat: Categoria | null
  ) => {
    setMovimientos((prev) =>
      prev.map((m) =>
        ids.includes(m.id)
          ? {
              ...m,
              ...(patch.tipo ? { tipo: patch.tipo } : {}),
              categoria_id: patch.categoria_id,
              clasificado: patch.categoria_id !== null,
              categorias_financieras: cat
                ? {
                    id: cat.id,
                    nombre: cat.nombre,
                    slug: cat.slug,
                    color: cat.color,
                    tipo: cat.tipo,
                  }
                : null,
            }
          : m
      )
    );
    setSelected(new Set());
  };

  const allChecked =
    visibles.length > 0 && visibles.every((m) => selected.has(m.id));
  const someChecked =
    visibles.some((m) => selected.has(m.id)) && !allChecked;

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

      <AnimatePresence>
        {selected.size > 0 && (
          <BulkBar
            ids={Array.from(selected)}
            categorias={categorias}
            onApplied={onBulkApplied}
            onCancel={() => setSelected(new Set())}
          />
        )}
      </AnimatePresence>

      <div className="rounded-2xl border border-linea bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-editorial text-muted-foreground bg-superficie">
              <tr>
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked;
                    }}
                    onChange={toggleAll}
                    className="size-4 rounded border-linea accent-bordo-800"
                  />
                </th>
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
                    checked={selected.has(m.id)}
                    onToggle={() => toggle(m.id)}
                  />
                ))}
              </AnimatePresence>
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
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

function BulkBar({
  ids,
  categorias,
  onApplied,
  onCancel,
}: {
  ids: number[];
  categorias: Categoria[];
  onApplied: (
    ids: number[],
    patch: { tipo?: "ingreso" | "egreso"; categoria_id: number | null },
    cat: Categoria | null
  ) => void;
  onCancel: () => void;
}) {
  const [bulkTipo, setBulkTipo] = useState<"" | "ingreso" | "egreso">("");
  const [bulkCategoriaId, setBulkCategoriaId] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const padres = useMemo(
    () =>
      categorias.filter(
        (c) => !c.padre_id && (bulkTipo === "" || c.tipo === bulkTipo)
      ),
    [categorias, bulkTipo]
  );

  const aplicar = () => {
    setError(null);
    if (bulkCategoriaId === "" && bulkTipo === "") {
      setError("Elegí una categoría o un tipo");
      return;
    }
    const categoria_id = bulkCategoriaId ? Number(bulkCategoriaId) : null;
    const patch: { tipo?: "ingreso" | "egreso"; categoria_id: number | null } = {
      categoria_id,
    };
    if (bulkTipo) patch.tipo = bulkTipo;

    startTransition(async () => {
      const res = await fetch("/api/tesoreria/movimientos/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, patch }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Error al actualizar");
        return;
      }
      const cat = categorias.find((c) => c.id === categoria_id) ?? null;
      onApplied(ids, patch, cat);
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-2xl border border-bordo-200 bg-bordo-50 p-3 flex flex-wrap items-center gap-2"
    >
      <div className="text-sm font-heading text-bordo-900">
        {ids.length} seleccionado{ids.length === 1 ? "" : "s"}
      </div>
      <div className="flex-1" />
      <select
        value={bulkTipo}
        onChange={(e) => {
          setBulkTipo(e.target.value as "" | "ingreso" | "egreso");
          setBulkCategoriaId("");
        }}
        className="text-sm border border-linea rounded-lg px-3 py-2 outline-none focus:border-bordo-700 bg-white"
      >
        <option value="">Mantener tipo</option>
        <option value="ingreso">Ingreso</option>
        <option value="egreso">Egreso</option>
      </select>
      <select
        value={bulkCategoriaId}
        onChange={(e) => setBulkCategoriaId(e.target.value)}
        className="text-sm border border-linea rounded-lg px-3 py-2 outline-none focus:border-bordo-700 bg-white min-w-[200px]"
      >
        <option value="">— Sin clasificar —</option>
        {padres.map((c) => (
          <optgroup key={c.id} label={c.nombre}>
            <option value={c.id}>{c.nombre}</option>
            {categorias
              .filter((s) => s.padre_id === c.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  &nbsp;&nbsp;{s.nombre}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <button
        onClick={aplicar}
        disabled={pending}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium bg-bordo-700 text-white hover:bg-bordo-900 transition-colors disabled:opacity-60"
      >
        <Check className="size-3.5" />
        {pending ? "Aplicando…" : "Aplicar"}
      </button>
      <button
        onClick={onCancel}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium bg-white border border-linea text-muted-foreground hover:text-foreground"
      >
        <X className="size-3.5" />
        Cancelar
      </button>
      {error && (
        <div className="basis-full text-xs text-rose-700">{error}</div>
      )}
    </motion.div>
  );
}

function MovimientoFila({
  movimiento,
  cuentaMoneda,
  categorias,
  onUpdate,
  checked,
  onToggle,
}: {
  movimiento: Movimiento;
  cuentaMoneda: Moneda;
  categorias: Categoria[];
  onUpdate: (id: number, patch: Partial<Movimiento>) => void;
  checked: boolean;
  onToggle: () => void;
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
      className={`border-t border-linea hover:bg-superficie/50 ${checked ? "bg-bordo-50/50" : ""}`}
    >
      <td className="px-3 py-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label="Seleccionar movimiento"
          className="size-4 rounded border-linea accent-bordo-800"
        />
      </td>
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
