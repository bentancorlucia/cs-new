"use client";

import { useEffect, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, AlertCircle, Pencil, Check } from "lucide-react";
import { formatearMoneda, type Moneda } from "@/lib/tesoreria/conversion";

type Cuenta = {
  id: number;
  nombre: string;
  tipo: string;
  moneda: Moneda;
  color: string | null;
};
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
  clasificado: boolean;
  cuentas_financieras?: Cuenta | null;
  categorias_financieras?: { id: number; nombre: string; color: string | null } | null;
};

export function MovimientosCliente({
  cuentas,
  categorias,
}: {
  cuentas: Cuenta[];
  categorias: Categoria[];
}) {
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [cuentaId, setCuentaId] = useState<string>("");
  const [tipo, setTipo] = useState<string>("");
  const [search, setSearch] = useState("");
  const [sinClasificar, setSinClasificar] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (cuentaId) params.set("cuenta_id", cuentaId);
    if (tipo) params.set("tipo", tipo);
    if (search) params.set("search", search);
    if (sinClasificar) params.set("sin_clasificar", "1");
    params.set("limit", "100");
    setLoading(true);
    fetch(`/api/tesoreria/movimientos?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setMovs(d.movimientos ?? []);
        setTotal(d.total ?? 0);
        setLoading(false);
      });
  }, [cuentaId, tipo, search, sinClasificar]);

  const onUpdate = (id: number, patch: Partial<Movimiento>) => {
    setMovs((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white border border-linea p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar descripción, alias o referencia…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-linea rounded-lg outline-none focus:border-bordo-700"
          />
        </div>
        <select
          value={cuentaId}
          onChange={(e) => setCuentaId(e.target.value)}
          className="text-sm border border-linea rounded-lg px-3 py-2 outline-none focus:border-bordo-700"
        >
          <option value="">Todas las cuentas</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="text-sm border border-linea rounded-lg px-3 py-2 outline-none focus:border-bordo-700"
        >
          <option value="">Ingresos y egresos</option>
          <option value="ingreso">Ingresos</option>
          <option value="egreso">Egresos</option>
        </select>
        <button
          onClick={() => setSinClasificar((v) => !v)}
          className={`text-xs px-3 py-2 rounded-lg font-medium transition-colors ${
            sinClasificar
              ? "bg-amber-500 text-white"
              : "bg-superficie text-muted-foreground hover:text-foreground"
          }`}
        >
          Sin clasificar
        </button>
      </div>

      <div className="rounded-2xl border border-linea bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-editorial text-muted-foreground bg-superficie">
              <tr>
                <th className="text-left px-4 py-3 font-heading">Fecha</th>
                <th className="text-left px-4 py-3 font-heading">Cuenta</th>
                <th className="text-left px-4 py-3 font-heading">Descripción</th>
                <th className="text-left px-4 py-3 font-heading">Categoría</th>
                <th className="text-right px-4 py-3 font-heading">Monto</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Cargando…
                  </td>
                </tr>
              ) : (
                <AnimatePresence initial={false}>
                  {movs.map((m) => (
                    <Fila key={m.id} m={m} categorias={categorias} onUpdate={onUpdate} />
                  ))}
                </AnimatePresence>
              )}
              {!loading && movs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No hay movimientos con esos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {total > movs.length && (
          <div className="px-4 py-3 text-xs text-muted-foreground border-t border-linea">
            Mostrando {movs.length} de {total} movimientos.
          </div>
        )}
      </div>
    </div>
  );
}

function Fila({
  m,
  categorias,
  onUpdate,
}: {
  m: Movimiento;
  categorias: Categoria[];
  onUpdate: (id: number, patch: Partial<Movimiento>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nombre, setNombre] = useState(m.nombre ?? "");
  const [notas, setNotas] = useState(m.notas ?? "");
  const [tipo, setTipo] = useState<"ingreso" | "egreso">(m.tipo);
  const [categoriaId, setCategoriaId] = useState<number | null>(m.categoria_id);
  const [, startTransition] = useTransition();

  const guardar = () => {
    startTransition(async () => {
      const res = await fetch(`/api/tesoreria/movimientos/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, notas, tipo, categoria_id: categoriaId }),
      });
      if (res.ok) {
        const cat = categorias.find((c) => c.id === categoriaId);
        onUpdate(m.id, {
          nombre,
          notas,
          tipo,
          categoria_id: categoriaId,
          clasificado: categoriaId !== null,
          categorias_financieras: cat ? { id: cat.id, nombre: cat.nombre, color: cat.color } : null,
        });
        setEditing(false);
      }
    });
  };

  const monto = Number(m.monto);
  const esIngreso = m.tipo === "ingreso";
  const cat = m.categorias_financieras;
  const cuenta = m.cuentas_financieras;
  const moneda = (m.moneda as Moneda) || "UYU";

  const padres = categorias.filter((c) => !c.padre_id && c.tipo === tipo);

  return (
    <motion.tr
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="border-t border-linea hover:bg-superficie/50"
    >
      <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
        {new Date(m.fecha + "T00:00:00").toLocaleDateString("es-UY", {
          day: "2-digit",
          month: "short",
          year: "2-digit",
        })}
      </td>
      <td className="px-4 py-3">
        {cuenta && (
          <span
            className="inline-flex items-center gap-1.5 text-xs rounded-full px-2 py-0.5 font-medium"
            style={{ backgroundColor: (cuenta.color ?? "#730d32") + "1a", color: cuenta.color ?? "#730d32" }}
          >
            {cuenta.nombre}
          </span>
        )}
      </td>
      <td className="px-4 py-3 max-w-xs">
        {editing ? (
          <div className="space-y-2">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Alias"
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
            {m.nombre && <div className="font-medium text-foreground">{m.nombre}</div>}
            <div className={m.nombre ? "text-xs text-muted-foreground" : "text-foreground"}>
              {m.descripcion}
            </div>
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
          <button onClick={guardar} className="p-1.5 rounded-md text-emerald-700 hover:bg-emerald-50">
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
