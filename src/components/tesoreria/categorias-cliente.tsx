"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  TrendingUp,
  TrendingDown,
  CornerDownRight,
  GripVertical,
} from "lucide-react";
import { springSmooth, fadeInUp } from "@/lib/motion";

type Categoria = {
  id: number;
  nombre: string;
  slug: string;
  tipo: "ingreso" | "egreso";
  padre_id: number | null;
  color: string | null;
  icono: string | null;
  orden: number;
  modulo: string | null;
  activa: boolean;
};

type Tipo = "ingreso" | "egreso";

const PALETA: string[] = [
  "#730d32",
  "#ab1d47",
  "#cc2a5a",
  "#e04a74",
  "#f7b643",
  "#e8900a",
  "#a94f09",
  "#0f766e",
  "#0ea5e9",
  "#6366f1",
  "#8b5cf6",
  "#475569",
];

const FALLBACK_COLOR = "#730d32";

const pad2 = (n: number) => n.toString().padStart(2, "0");

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function CategoriasCliente({ categoriasIniciales }: { categoriasIniciales: Categoria[] }) {
  const [cats, setCats] = useState<Categoria[]>(categoriasIniciales);
  const [tipo, setTipo] = useState<Tipo>("egreso");
  const [creandoEn, setCreandoEn] = useState<number | null | "root">(null);

  const counts = useMemo(() => {
    const activas = cats.filter((c) => c.activa);
    const compute = (t: Tipo) => {
      const list = activas.filter((c) => c.tipo === t);
      const padres = list.filter((c) => !c.padre_id).length;
      const subs = list.filter((c) => c.padre_id).length;
      return { padres, subs, total: padres + subs };
    };
    return { egreso: compute("egreso"), ingreso: compute("ingreso") };
  }, [cats]);

  const visibles = useMemo(() => cats.filter((c) => c.tipo === tipo && c.activa), [cats, tipo]);
  const padres = useMemo(
    () =>
      visibles
        .filter((c) => !c.padre_id)
        .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es")),
    [visibles],
  );
  const hijos = (id: number) =>
    visibles
      .filter((c) => c.padre_id === id)
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));

  const onCrear = async (nombre: string, padreId: number | null, color?: string) => {
    const slugBase = slugify(nombre);
    const slug = `${slugBase}-${Date.now().toString(36)}`;
    const colorPadre = padreId ? cats.find((c) => c.id === padreId)?.color : null;
    const colorPorDefecto =
      color ??
      colorPadre ??
      PALETA[(padres.length + (tipo === "ingreso" ? 4 : 0)) % PALETA.length];
    const res = await fetch("/api/tesoreria/categorias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre,
        slug,
        tipo,
        padre_id: padreId,
        color: colorPorDefecto,
      }),
    });
    if (res.ok) {
      const { categoria } = await res.json();
      setCats((prev) => [...prev, categoria]);
      setCreandoEn(null);
    }
  };

  const onActualizar = async (id: number, patch: Partial<Categoria>) => {
    const res = await fetch(`/api/tesoreria/categorias/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) setCats((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const onEliminar = async (id: number) => {
    if (!confirm("¿Eliminar esta categoría? Si tiene movimientos, se archiva.")) return;
    const res = await fetch(`/api/tesoreria/categorias/${id}`, { method: "DELETE" });
    if (res.ok) {
      const data = await res.json();
      if (data.archivada) {
        setCats((prev) => prev.map((c) => (c.id === id ? { ...c, activa: false } : c)));
      } else {
        setCats((prev) => prev.filter((c) => c.id !== id));
      }
    }
  };

  return (
    <div className="space-y-6">
      <LayoutGroup id="categorias-tipo-ledger">
        <TipoTabs tipo={tipo} setTipo={setTipo} counts={counts} />
      </LayoutGroup>

      <Ledger
        tipo={tipo}
        padres={padres}
        getHijos={hijos}
        creandoEn={creandoEn}
        setCreandoEn={setCreandoEn}
        onCrear={onCrear}
        onActualizar={onActualizar}
        onEliminar={onEliminar}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Editorial type tabs                                        */
/* ─────────────────────────────────────────────────────────── */

function TipoTabs({
  tipo,
  setTipo,
  counts,
}: {
  tipo: Tipo;
  setTipo: (t: Tipo) => void;
  counts: { egreso: { padres: number; subs: number }; ingreso: { padres: number; subs: number } };
}) {
  const items: Array<{
    id: Tipo;
    label: string;
    n: number;
    Icon: typeof TrendingUp;
    accent: string;
  }> = [
    { id: "egreso", label: "Egresos", n: 1, Icon: TrendingDown, accent: "#ab1d47" },
    { id: "ingreso", label: "Ingresos", n: 2, Icon: TrendingUp, accent: "#0f766e" },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-linea bg-linea">
      {items.map((it) => {
        const active = tipo === it.id;
        const c = counts[it.id];
        return (
          <button
            key={it.id}
            onClick={() => setTipo(it.id)}
            className={`group relative overflow-hidden text-left transition-colors ${
              active ? "bg-white" : "bg-superficie/60 hover:bg-white/60"
            }`}
          >
            {active && (
              <motion.span
                layoutId="tab-underline"
                className="absolute inset-x-6 bottom-0 h-[3px] rounded-t-full"
                style={{ backgroundColor: it.accent }}
                transition={springSmooth}
              />
            )}
            {active && (
              <span
                aria-hidden
                className="absolute -top-12 -right-12 size-40 rounded-full opacity-30 blur-3xl"
                style={{ backgroundColor: it.accent }}
              />
            )}
            <div className="relative flex items-start justify-between gap-4 px-5 py-5 sm:px-7 sm:py-6">
              <div className="space-y-1.5">
                <div
                  className={`flex items-center gap-2 text-[10px] uppercase tracking-editorial ${
                    active ? "text-bordo-700" : "text-muted-foreground"
                  }`}
                >
                  <span className="tabular-nums">§ {pad2(it.n)}</span>
                  <span className="h-px w-5" style={{ backgroundColor: active ? it.accent : "var(--color-linea)" }} />
                  <it.Icon className="size-3" />
                </div>
                <div
                  className={`font-heading leading-none tracking-tight ${
                    active ? "text-bordo-900 text-3xl sm:text-4xl" : "text-foreground/55 text-2xl sm:text-3xl"
                  }`}
                >
                  {it.label}
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {c.padres} {c.padres === 1 ? "raíz" : "raíces"}
                  <span className="mx-1.5 text-bordo-300">·</span>
                  {c.subs} {c.subs === 1 ? "subcategoría" : "subcategorías"}
                </div>
              </div>
              <div className="hidden sm:flex flex-col items-end gap-1">
                <span
                  className={`font-heading text-4xl tabular-nums leading-none ${
                    active ? "text-bordo-900" : "text-foreground/30"
                  }`}
                >
                  {pad2(c.padres + c.subs)}
                </span>
                <span className="text-[10px] uppercase tracking-editorial text-muted-foreground">
                  partidas
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Ledger — the typeset accounting book                       */
/* ─────────────────────────────────────────────────────────── */

function Ledger({
  tipo,
  padres,
  getHijos,
  creandoEn,
  setCreandoEn,
  onCrear,
  onActualizar,
  onEliminar,
}: {
  tipo: Tipo;
  padres: Categoria[];
  getHijos: (id: number) => Categoria[];
  creandoEn: number | null | "root";
  setCreandoEn: (v: number | null | "root") => void;
  onCrear: (nombre: string, padreId: number | null, color?: string) => Promise<void>;
  onActualizar: (id: number, patch: Partial<Categoria>) => Promise<void>;
  onEliminar: (id: number) => Promise<void>;
}) {
  return (
    <motion.section
      key={tipo}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-3xl border border-linea bg-white shadow-card overflow-hidden"
    >
      <CornerMarks />

      <div className="relative px-4 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
        <header className="mb-6 flex items-end justify-between border-b border-dashed border-linea pb-4">
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">
              Libro {tipo === "egreso" ? "I" : "II"} · Plan de cuentas
            </div>
            <h3 className="font-heading text-2xl text-bordo-900 capitalize tracking-tight">
              {tipo}s
            </h3>
          </div>
          <button
            onClick={() => setCreandoEn("root")}
            className="group inline-flex items-center gap-2 rounded-full bg-bordo-900 hover:bg-bordo-950 text-white text-xs font-heading uppercase tracking-editorial px-4 py-2.5 transition-colors shadow-sm"
          >
            <Plus className="size-3.5" />
            <span>Nueva partida</span>
          </button>
        </header>

        <div className="space-y-1">
          <AnimatePresence initial={false}>
            {padres.map((padre, idx) => (
              <SeccionPadre
                key={padre.id}
                index={idx + 1}
                padre={padre}
                hijos={getHijos(padre.id)}
                creandoSubAqui={creandoEn === padre.id}
                onAbrirCrearSub={() => setCreandoEn(padre.id)}
                onCancelarCrearSub={() => setCreandoEn(null)}
                onCrear={onCrear}
                onActualizar={onActualizar}
                onEliminar={onEliminar}
              />
            ))}
          </AnimatePresence>

          <AnimatePresence>
            {creandoEn === "root" && (
              <motion.div
                key="nueva-raiz"
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={springSmooth}
                className="overflow-hidden"
              >
                <NuevaRaizFila
                  index={padres.length + 1}
                  tipo={tipo}
                  onConfirmar={(nombre, color) => onCrear(nombre, null, color)}
                  onCancelar={() => setCreandoEn(null)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {padres.length === 0 && creandoEn !== "root" && (
            <EmptyLedger tipo={tipo} onCrear={() => setCreandoEn("root")} />
          )}
        </div>

        {padres.length > 0 && (
          <button
            onClick={() => setCreandoEn("root")}
            className="group mt-4 flex w-full items-center gap-3 rounded-xl border border-dashed border-linea hover:border-bordo-300 px-4 py-3 text-left transition-colors"
          >
            <span className="flex size-7 items-center justify-center rounded-full border border-dashed border-linea group-hover:border-bordo-300 group-hover:bg-bordo-50 text-muted-foreground group-hover:text-bordo-700 transition-colors">
              <Plus className="size-3.5" />
            </span>
            <span className="text-[10px] uppercase tracking-editorial text-muted-foreground group-hover:text-bordo-700 transition-colors">
              {pad2(padres.length + 1)} — agregar nueva categoría de {tipo}
            </span>
            <span className="ml-auto h-px flex-1 max-w-[40%] bg-linea group-hover:bg-bordo-200 transition-colors" />
          </button>
        )}
      </div>
    </motion.section>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Section per parent — color spine + nested children         */
/* ─────────────────────────────────────────────────────────── */

function SeccionPadre({
  index,
  padre,
  hijos,
  creandoSubAqui,
  onAbrirCrearSub,
  onCancelarCrearSub,
  onCrear,
  onActualizar,
  onEliminar,
}: {
  index: number;
  padre: Categoria;
  hijos: Categoria[];
  creandoSubAqui: boolean;
  onAbrirCrearSub: () => void;
  onCancelarCrearSub: () => void;
  onCrear: (nombre: string, padreId: number | null, color?: string) => Promise<void>;
  onActualizar: (id: number, patch: Partial<Categoria>) => Promise<void>;
  onEliminar: (id: number) => Promise<void>;
}) {
  const color = padre.color ?? FALLBACK_COLOR;
  const tieneHijos = hijos.length > 0 || creandoSubAqui;

  return (
    <motion.div
      layout
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, height: 0 }}
      transition={springSmooth}
      className="group/section relative pl-6 pr-1 py-1"
    >
      <span
        aria-hidden
        className={`absolute left-2 top-4 ${tieneHijos ? "bottom-4" : "h-8"} w-[3px] rounded-full transition-all duration-300 group-hover/section:w-1`}
        style={{ backgroundColor: color }}
      />
      <span
        aria-hidden
        className="absolute left-[5px] top-3 size-2.5 rounded-full ring-4 ring-white"
        style={{ backgroundColor: color }}
      />

      <CategoriaFila
        cat={padre}
        index={pad2(index)}
        isParent
        color={color}
        onActualizar={(patch) => onActualizar(padre.id, patch)}
        onEliminar={() => onEliminar(padre.id)}
        onAgregarSub={onAbrirCrearSub}
      />

      <div className="mt-0.5">
        <AnimatePresence initial={false}>
          {hijos.map((hijo, hi) => (
            <motion.div
              key={hijo.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8, height: 0 }}
              transition={springSmooth}
            >
              <CategoriaFila
                cat={hijo}
                index={`${pad2(index)}.${pad2(hi + 1)}`}
                color={color}
                inheritedColor={color}
                onActualizar={(patch) => onActualizar(hijo.id, patch)}
                onEliminar={() => onEliminar(hijo.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        <AnimatePresence>
          {creandoSubAqui && (
            <motion.div
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={springSmooth}
              className="overflow-hidden"
            >
              <NuevaSubFila
                index={`${pad2(index)}.${pad2(hijos.length + 1)}`}
                color={color}
                onConfirmar={(nombre) => onCrear(nombre, padre.id)}
                onCancelar={onCancelarCrearSub}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {!creandoSubAqui && hijos.length > 0 && (
          <button
            onClick={onAbrirCrearSub}
            className="group/add ml-8 mt-1 inline-flex items-center gap-2 text-[10px] uppercase tracking-editorial text-muted-foreground hover:text-bordo-700 transition-colors py-1"
          >
            <CornerDownRight className="size-3 opacity-60" />
            <span>añadir sub</span>
            <span className="h-px w-4 bg-linea group-hover/add:bg-bordo-300 transition-colors" />
          </button>
        )}
        {!creandoSubAqui && hijos.length === 0 && (
          <button
            onClick={onAbrirCrearSub}
            className="group/add ml-8 mt-1 inline-flex items-center gap-2 text-[10px] uppercase tracking-editorial text-muted-foreground/70 hover:text-bordo-700 transition-colors py-1"
          >
            <CornerDownRight className="size-3 opacity-50" />
            <span>desglosar en subcategorías</span>
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Row — used for parent and child                            */
/* ─────────────────────────────────────────────────────────── */

function CategoriaFila({
  cat,
  index,
  color,
  isParent = false,
  inheritedColor,
  onActualizar,
  onEliminar,
  onAgregarSub,
}: {
  cat: Categoria;
  index: string;
  color: string;
  isParent?: boolean;
  inheritedColor?: string;
  onActualizar: (patch: Partial<Categoria>) => void;
  onEliminar: () => void;
  onAgregarSub?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nombre, setNombre] = useState(cat.nombre);
  const [colorEditado, setColorEditado] = useState(cat.color ?? FALLBACK_COLOR);

  useEffect(() => {
    setNombre(cat.nombre);
    setColorEditado(cat.color ?? FALLBACK_COLOR);
  }, [cat.nombre, cat.color]);

  const guardar = () => {
    if (!nombre.trim()) return;
    onActualizar({ nombre: nombre.trim(), color: colorEditado });
    setEditing(false);
  };

  const cancelar = () => {
    setNombre(cat.nombre);
    setColorEditado(cat.color ?? FALLBACK_COLOR);
    setEditing(false);
  };

  if (editing) {
    return (
      <div
        className="relative ml-3 rounded-xl border border-bordo-200 bg-bordo-50/40 p-3 sm:p-4"
        style={{ boxShadow: `0 0 0 4px ${(isParent ? colorEditado : inheritedColor ?? color)}10` }}
      >
        <div className="flex items-center gap-3">
          <span
            className="font-heading text-[10px] uppercase tracking-editorial text-bordo-700 tabular-nums shrink-0 w-12"
          >
            {index}
          </span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") guardar();
              if (e.key === "Escape") cancelar();
            }}
            autoFocus
            className={`flex-1 min-w-0 bg-transparent outline-none border-b border-bordo-300 focus:border-bordo-700 transition-colors py-1 ${
              isParent ? "font-heading text-lg sm:text-xl text-bordo-900" : "text-sm text-foreground"
            }`}
          />
          <button
            onClick={guardar}
            className="p-1.5 text-emerald-700 hover:bg-emerald-100 rounded-md transition-colors"
            title="Guardar"
          >
            <Check className="size-4" />
          </button>
          <button
            onClick={cancelar}
            className="p-1.5 text-muted-foreground hover:bg-white rounded-md transition-colors"
            title="Cancelar"
          >
            <X className="size-4" />
          </button>
        </div>
        {isParent && (
          <div className="mt-3 ml-12 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-editorial text-muted-foreground mr-1">
              color
            </span>
            {PALETA.map((c) => (
              <button
                key={c}
                onClick={() => setColorEditado(c)}
                className={`relative size-6 rounded-full transition-transform ${
                  colorEditado === c ? "scale-110 ring-2 ring-offset-2 ring-bordo-700" : "hover:scale-110"
                }`}
                style={{ backgroundColor: c }}
                title={c}
                aria-label={`color ${c}`}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`group/row relative flex items-center gap-3 rounded-lg pl-3 pr-2 ${
        isParent ? "py-2.5" : "py-2 ml-6"
      } -mx-1 transition-colors hover:bg-superficie/60`}
    >
      <span
        aria-hidden
        className="opacity-0 group-hover/row:opacity-40 transition-opacity text-muted-foreground -ml-1"
      >
        <GripVertical className="size-3.5" />
      </span>

      <span
        className={`font-heading text-[10px] uppercase tracking-editorial tabular-nums shrink-0 w-12 ${
          isParent ? "text-bordo-700" : "text-muted-foreground/70"
        }`}
      >
        {index}
      </span>

      {isParent ? (
        <span
          className="flex size-7 items-center justify-center rounded-md font-heading text-xs text-white shrink-0 shadow-sm tabular-nums"
          style={{ backgroundColor: color }}
          aria-hidden
        >
          {cat.nombre.charAt(0).toUpperCase()}
        </span>
      ) : (
        <span
          className="size-1.5 rounded-full shrink-0"
          style={{ backgroundColor: inheritedColor ?? color }}
          aria-hidden
        />
      )}

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate ${
            isParent
              ? "font-heading text-lg sm:text-xl text-bordo-900 tracking-tight"
              : "text-sm text-foreground/85"
          }`}
        >
          {cat.nombre}
        </span>
        {(cat.modulo || (!isParent && cat.slug)) && (
          <span className="mt-0.5 flex items-center gap-2">
            {cat.modulo && (
              <span className="text-[9px] uppercase tracking-editorial text-bordo-700 bg-bordo-50 border border-bordo-200/60 px-1.5 py-0.5 rounded">
                {cat.modulo}
              </span>
            )}
          </span>
        )}
      </span>

      {/* dotted leader on parent rows */}
      {isParent && (
        <span
          aria-hidden
          className="hidden md:flex flex-1 mx-3 self-center h-px bg-[radial-gradient(circle,var(--color-linea)_1px,transparent_1px)] [background-size:6px_2px] opacity-60 group-hover/row:opacity-100 transition-opacity"
        />
      )}

      {/* Actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
        {onAgregarSub && (
          <button
            onClick={onAgregarSub}
            className="p-1.5 text-muted-foreground hover:text-bordo-700 hover:bg-bordo-50 rounded-md transition-colors"
            title="Agregar subcategoría"
          >
            <Plus className="size-3.5" />
          </button>
        )}
        <button
          onClick={() => setEditing(true)}
          className="p-1.5 text-muted-foreground hover:text-bordo-700 hover:bg-bordo-50 rounded-md transition-colors"
          title="Editar"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          onClick={onEliminar}
          className="p-1.5 text-muted-foreground hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
          title="Eliminar"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Inline create — sub                                        */
/* ─────────────────────────────────────────────────────────── */

function NuevaSubFila({
  index,
  color,
  onConfirmar,
  onCancelar,
}: {
  index: string;
  color: string;
  onConfirmar: (nombre: string) => void;
  onCancelar: () => void;
}) {
  const [valor, setValor] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  return (
    <div
      className="ml-6 -mx-1 flex items-center gap-3 rounded-lg pl-3 pr-2 py-2 bg-superficie/60 border border-dashed border-bordo-200"
    >
      <span className="font-heading text-[10px] uppercase tracking-editorial text-muted-foreground tabular-nums shrink-0 w-12">
        {index}
      </span>
      <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden />
      <input
        ref={inputRef}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && valor.trim()) onConfirmar(valor.trim());
          if (e.key === "Escape") onCancelar();
        }}
        placeholder="Escribir nombre de la subcategoría…"
        className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground/60 placeholder:italic border-b border-transparent focus:border-bordo-300 transition-colors py-1"
      />
      <button
        onClick={() => valor.trim() && onConfirmar(valor.trim())}
        className="p-1.5 text-emerald-700 hover:bg-emerald-100 rounded-md transition-colors"
      >
        <Check className="size-4" />
      </button>
      <button
        onClick={onCancelar}
        className="p-1.5 text-muted-foreground hover:bg-white rounded-md transition-colors"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Inline create — root (with palette)                        */
/* ─────────────────────────────────────────────────────────── */

function NuevaRaizFila({
  index,
  tipo,
  onConfirmar,
  onCancelar,
}: {
  index: number;
  tipo: Tipo;
  onConfirmar: (nombre: string, color: string) => void;
  onCancelar: () => void;
}) {
  const [valor, setValor] = useState("");
  const [color, setColor] = useState(PALETA[(index + (tipo === "ingreso" ? 4 : 0)) % PALETA.length]);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  return (
    <div
      className="relative pl-6 pr-1 py-2"
    >
      <span
        aria-hidden
        className="absolute left-2 top-4 h-9 w-[3px] rounded-full transition-colors"
        style={{ backgroundColor: color }}
      />
      <span
        aria-hidden
        className="absolute left-[5px] top-3 size-2.5 rounded-full ring-4 ring-white transition-colors"
        style={{ backgroundColor: color }}
      />

      <div
        className="ml-3 rounded-xl border border-bordo-200 bg-bordo-50/40 p-3 sm:p-4"
        style={{ boxShadow: `0 0 0 4px ${color}10` }}
      >
        <div className="flex items-center gap-3">
          <span className="font-heading text-[10px] uppercase tracking-editorial text-bordo-700 tabular-nums shrink-0 w-12">
            {pad2(index)}
          </span>
          <span
            className="flex size-7 items-center justify-center rounded-md font-heading text-xs text-white shrink-0 shadow-sm"
            style={{ backgroundColor: color }}
            aria-hidden
          >
            +
          </span>
          <input
            ref={inputRef}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valor.trim()) onConfirmar(valor.trim(), color);
              if (e.key === "Escape") onCancelar();
            }}
            placeholder={`Escribir nombre de la categoría de ${tipo}…`}
            className="flex-1 min-w-0 bg-transparent outline-none font-heading text-lg sm:text-xl text-bordo-900 tracking-tight placeholder:text-muted-foreground/50 placeholder:italic placeholder:font-body placeholder:text-base border-b border-bordo-300 focus:border-bordo-700 transition-colors py-1"
          />
          <button
            onClick={() => valor.trim() && onConfirmar(valor.trim(), color)}
            className="p-1.5 text-emerald-700 hover:bg-emerald-100 rounded-md transition-colors"
            title="Crear"
          >
            <Check className="size-4" />
          </button>
          <button
            onClick={onCancelar}
            className="p-1.5 text-muted-foreground hover:bg-white rounded-md transition-colors"
            title="Cancelar"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-3 ml-12 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-editorial text-muted-foreground mr-1">
            color
          </span>
          {PALETA.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`relative size-6 rounded-full transition-transform ${
                color === c ? "scale-110 ring-2 ring-offset-2 ring-bordo-700" : "hover:scale-110"
              }`}
              style={{ backgroundColor: c }}
              title={c}
              aria-label={`color ${c}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Empty state                                                */
/* ─────────────────────────────────────────────────────────── */

function EmptyLedger({ tipo, onCrear }: { tipo: Tipo; onCrear: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative flex flex-col items-center gap-4 px-6 py-14 text-center"
    >
      <span
        aria-hidden
        className="absolute inset-x-1/4 top-6 h-px bg-[radial-gradient(circle,var(--color-linea)_1px,transparent_1px)] [background-size:6px_2px]"
      />
      <span
        aria-hidden
        className="absolute inset-x-1/4 bottom-6 h-px bg-[radial-gradient(circle,var(--color-linea)_1px,transparent_1px)] [background-size:6px_2px]"
      />
      <div className="relative">
        <span className="absolute -inset-3 rounded-full bg-bordo-50 blur-md" aria-hidden />
        <span className="relative flex size-12 items-center justify-center rounded-full bg-white border border-bordo-200 text-bordo-700 font-heading text-lg">
          ø
        </span>
      </div>
      <div className="space-y-1">
        <div className="font-heading text-xl text-bordo-900">El libro está en blanco</div>
        <div className="text-sm text-muted-foreground max-w-xs mx-auto">
          Todavía no escribiste ninguna categoría de {tipo}. Comenzá por la primera partida.
        </div>
      </div>
      <button
        onClick={onCrear}
        className="inline-flex items-center gap-2 rounded-full bg-bordo-900 hover:bg-bordo-950 text-white text-xs font-heading uppercase tracking-editorial px-4 py-2.5 transition-colors mt-2"
      >
        <Plus className="size-3.5" />
        Abrir el libro
      </button>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Decorative corner brackets                                 */
/* ─────────────────────────────────────────────────────────── */

function CornerMarks() {
  const lineClass = "absolute bg-bordo-300/40";
  return (
    <>
      <span aria-hidden className={`${lineClass} top-3 left-3 h-3 w-px`} />
      <span aria-hidden className={`${lineClass} top-3 left-3 h-px w-3`} />
      <span aria-hidden className={`${lineClass} top-3 right-3 h-3 w-px`} />
      <span aria-hidden className={`${lineClass} top-3 right-3 h-px w-3`} />
      <span aria-hidden className={`${lineClass} bottom-3 left-3 h-3 w-px`} />
      <span aria-hidden className={`${lineClass} bottom-3 left-3 h-px w-3`} />
      <span aria-hidden className={`${lineClass} bottom-3 right-3 h-3 w-px`} />
      <span aria-hidden className={`${lineClass} bottom-3 right-3 h-px w-3`} />
    </>
  );
}
