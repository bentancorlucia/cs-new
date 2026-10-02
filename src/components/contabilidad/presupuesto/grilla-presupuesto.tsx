"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Copy,
  Eraser,
  Filter,
  Loader2,
  Lock,
  MoreHorizontal,
  Plus,
  Save,
  SplitSquareHorizontal,
  Tag,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BotonAnimado } from "@/components/contabilidad/ejercicios/boton-animado";
import { ConfirmarDialog } from "@/components/contabilidad/ejercicios/confirmar-dialog";
import { EnteroAnimado, ImporteAnimado } from "@/components/contabilidad/reportes/importe-animado";
import { easeSmooth, fadeInUp, springSmooth, staggerContainer } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { redondear, type EjercicioResumen } from "@/lib/contabilidad/reportes";
import {
  MESES_CORTOS,
  ancestros,
  formatPresupuesto,
  parsearImporte,
  type CentroPresupuesto,
  type ClaseResultado,
  type CuentaPresupuesto,
  type LineaPresupuesto,
  type PresupuestoResumen,
} from "@/lib/contabilidad/presupuesto";
import {
  aprobarPresupuesto,
  eliminarPresupuesto,
  guardarLineasPresupuesto,
} from "@/app/(dashboard)/contabilidad/presupuesto/actions";
import { EstadoBadge } from "./estado-badge";
import { EditarPresupuestoDialog } from "./editar-presupuesto-dialog";
import { Notas } from "./presupuesto-lista";
import { AgregarCuentaDialog, DialogoFila, type ModoFila } from "./dialogos-grilla";

/** Importes por fila (cuenta + centro), 12 meses. */
type Valores = Record<string, number[]>;

const SIN_CENTRO = "sin";
const TODOS = "todos";

export function claveFila(cuentaId: string, centroId: string | null): string {
  return `${cuentaId}|${centroId ?? ""}`;
}

function partirClave(clave: string): { cuentaId: string; centroId: string | null } {
  const [cuentaId, centroId] = clave.split("|");
  return { cuentaId, centroId: centroId || null };
}

const ceros = () => Array.from({ length: 12 }, () => 0);

function desdeLineas(lineas: LineaPresupuesto[]): Valores {
  const v: Valores = {};
  for (const l of lineas) {
    const k = claveFila(l.cuenta_id, l.centro_costo_id);
    (v[k] ??= ceros())[l.mes - 1] = l.importe;
  }
  return v;
}

function clonar(v: Valores): Valores {
  return Object.fromEntries(Object.entries(v).map(([k, m]) => [k, [...m]]));
}

const suma = (m: number[]) => redondear(m.reduce((s, x) => s + x, 0));

type Item =
  | { tipo: "seccion"; clase: ClaseResultado }
  | { tipo: "grupo"; cuenta: CuentaPresupuesto; profundidad: number; meses: number[]; colapsado: boolean }
  | {
      tipo: "fila";
      clave: string;
      indice: number;
      cuenta: CuentaPresupuesto;
      centro: CentroPresupuesto | null;
      profundidad: number;
    };

export function GrillaPresupuesto({
  presupuesto,
  ejercicio,
  cuentas,
  centros,
  lineas,
  puedeEscribir,
  versionVigente,
}: {
  presupuesto: PresupuestoResumen;
  ejercicio: EjercicioResumen;
  cuentas: CuentaPresupuesto[];
  centros: CentroPresupuesto[];
  lineas: LineaPresupuesto[];
  puedeEscribir: boolean;
  /** Versión del aprobado vigente del ejercicio (para avisar al aprobar). */
  versionVigente: number | null;
}) {
  const router = useRouter();
  const reducir = useReducedMotion();
  const editable = puedeEscribir && presupuesto.estado === "borrador";

  const [original, setOriginal] = useState<Valores>(() => desdeLineas(lineas));
  const [valores, setValores] = useState<Valores>(() => desdeLineas(lineas));
  const [filtro, setFiltro] = useState<string>(TODOS);
  const [colapsados, setColapsados] = useState<Set<string>>(() => new Set());
  const [guardando, startGuardar] = useTransition();
  const [dialogoFila, setDialogoFila] = useState<{ clave: string; modo: ModoFila } | null>(null);
  const [agregar, setAgregar] = useState(false);
  const [confirmar, setConfirmar] = useState<"aprobar" | "eliminar" | null>(null);
  const [editandoNombre, setEditandoNombre] = useState(false);
  /** Fila recién agregada: se enfoca su primera celda después del render. */
  const enfocar = useRef<string | null>(null);
  const tablaRef = useRef<HTMLDivElement>(null);

  const cuentaPorId = useMemo(() => new Map(cuentas.map((c) => [c.id, c])), [cuentas]);
  const centroPorId = useMemo(() => new Map(centros.map((c) => [c.id, c])), [centros]);
  const ramas = useMemo(() => ancestros(cuentas), [cuentas]);

  // ---------- Cambios pendientes ----------
  const cambios = useMemo(() => {
    const lista: { cuenta_id: string; centro_costo_id: string | null; mes: number; importe: number }[] = [];
    const claves = new Set([...Object.keys(valores), ...Object.keys(original)]);
    for (const k of claves) {
      const actual = valores[k] ?? ceros();
      const antes = original[k] ?? ceros();
      for (let m = 0; m < 12; m++) {
        if (actual[m] !== antes[m]) {
          const { cuentaId, centroId } = partirClave(k);
          lista.push({ cuenta_id: cuentaId, centro_costo_id: centroId, mes: m + 1, importe: actual[m] });
        }
      }
    }
    return lista;
  }, [valores, original]);
  const pendientes = cambios.length;

  useEffect(() => {
    if (pendientes === 0) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [pendientes]);

  // ---------- Filas visibles y árbol ----------
  const { items, totales, centrosUsados, cantidadFilas } = useMemo(() => {
    const usados = new Set<string>();
    const visibles: { clave: string; cuenta: CuentaPresupuesto; centro: CentroPresupuesto | null }[] = [];
    for (const clave of Object.keys(valores)) {
      const { cuentaId, centroId } = partirClave(clave);
      const cuenta = cuentaPorId.get(cuentaId);
      if (!cuenta) continue;
      if (centroId) usados.add(centroId);
      if (filtro === SIN_CENTRO && centroId) continue;
      if (filtro !== TODOS && filtro !== SIN_CENTRO && centroId !== filtro) continue;
      visibles.push({ clave, cuenta, centro: centroId ? centroPorId.get(centroId) ?? null : null });
    }
    visibles.sort((a, b) => {
      const c = cuentas.indexOf(a.cuenta) - cuentas.indexOf(b.cuenta);
      if (c !== 0) return c;
      return (a.centro?.codigo ?? "").localeCompare(b.centro?.codigo ?? "");
    });

    // Subtotales por agrupadora (sin la raíz de la clase)
    const porGrupo = new Map<string, number[]>();
    const tot: Record<ClaseResultado, number[]> = { ingreso: ceros(), egreso: ceros() };
    for (const f of visibles) {
      const meses = valores[f.clave];
      for (let m = 0; m < 12; m++) tot[f.cuenta.clase][m] += meses[m];
      for (const g of ramas.get(f.cuenta.id) ?? []) {
        const acc = porGrupo.get(g.id) ?? ceros();
        for (let m = 0; m < 12; m++) acc[m] += meses[m];
        porGrupo.set(g.id, acc);
      }
    }

    const lista: Item[] = [];
    let indice = 0;
    for (const clase of ["ingreso", "egreso"] as const) {
      const deClase = visibles.filter((f) => f.cuenta.clase === clase);
      if (deClase.length === 0) continue;
      lista.push({ tipo: "seccion", clase });
      let abiertos: string[] = [];
      for (const f of deClase) {
        const grupos = (ramas.get(f.cuenta.id) ?? []).filter((g) => g.padre_id !== null);
        // Cabeceras de grupo nuevas
        let comun = 0;
        while (comun < abiertos.length && comun < grupos.length && abiertos[comun] === grupos[comun].id) comun++;
        abiertos = abiertos.slice(0, comun);
        for (let i = comun; i < grupos.length; i++) {
          const g = grupos[i];
          abiertos.push(g.id);
          const padreColapsado = grupos.slice(0, i).some((x) => colapsados.has(x.id));
          if (!padreColapsado) {
            lista.push({
              tipo: "grupo",
              cuenta: g,
              profundidad: i,
              meses: (porGrupo.get(g.id) ?? ceros()).map(redondear),
              colapsado: colapsados.has(g.id),
            });
          }
        }
        if (grupos.some((g) => colapsados.has(g.id))) continue;
        lista.push({ tipo: "fila", clave: f.clave, indice: indice++, cuenta: f.cuenta, centro: f.centro, profundidad: grupos.length });
      }
    }
    return {
      items: lista,
      totales: { ingreso: tot.ingreso.map(redondear), egreso: tot.egreso.map(redondear) },
      centrosUsados: usados,
      cantidadFilas: visibles.length,
    };
  }, [valores, filtro, colapsados, cuentaPorId, centroPorId, cuentas, ramas]);

  const resultadoMeses = totales.ingreso.map((x, m) => redondear(x - totales.egreso[m]));
  const totalIngresos = suma(totales.ingreso);
  const totalEgresos = suma(totales.egreso);
  const resultado = redondear(totalIngresos - totalEgresos);

  // ---------- Edición ----------
  const asignar = useCallback((clave: string, mes: number, importe: number) => {
    setValores((v) => {
      const actual = v[clave] ?? ceros();
      if (actual[mes] === importe) return v;
      const nuevo = [...actual];
      nuevo[mes] = importe;
      return { ...v, [clave]: nuevo };
    });
  }, []);

  const asignarFila = useCallback((clave: string, meses: number[]) => {
    setValores((v) => ({ ...v, [clave]: meses.map(redondear) }));
  }, []);

  /** Pasa el foco a otra celda; false si no existe (primera o última fila). */
  const mover = useCallback((fila: number, mes: number): boolean => {
    const el = tablaRef.current?.querySelector<HTMLInputElement>(`[data-celda="${fila}-${mes}"]`);
    el?.focus();
    return !!el;
  }, []);

  useEffect(() => {
    if (!enfocar.current) return;
    const clave = enfocar.current;
    enfocar.current = null;
    const item = items.find((i) => i.tipo === "fila" && i.clave === clave);
    if (item && item.tipo === "fila") {
      requestAnimationFrame(() => {
        const el = tablaRef.current?.querySelector<HTMLInputElement>(`[data-celda="${item.indice}-0"]`);
        el?.scrollIntoView({ block: "center", inline: "nearest", behavior: reducir ? "auto" : "smooth" });
        el?.focus({ preventScroll: true });
      });
    }
  }, [items, reducir]);

  function agregarFila(cuentaId: string, centroId: string | null) {
    const clave = claveFila(cuentaId, centroId);
    if (valores[clave]) {
      toast.info("Esa cuenta ya está en la grilla con ese centro de costo");
    } else {
      setValores((v) => ({ ...v, [clave]: ceros() }));
    }
    // Que la fila quede visible con el filtro actual y sin grupos colapsados.
    if (filtro !== TODOS && (filtro === SIN_CENTRO ? centroId !== null : filtro !== centroId)) setFiltro(TODOS);
    setColapsados((s) => {
      const n = new Set(s);
      for (const g of ramas.get(cuentaId) ?? []) n.delete(g.id);
      return n;
    });
    enfocar.current = clave;
  }

  function descartar() {
    setValores(clonar(original));
  }

  function guardar() {
    if (pendientes === 0) return;
    const lote = cambios;
    startGuardar(async () => {
      const r = await guardarLineasPresupuesto({ presupuestoId: presupuesto.id, lineas: lote });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      // Lo guardado pasa a ser el original; las filas que quedaron en cero se van.
      const limpio: Valores = {};
      for (const [k, m] of Object.entries(valores)) if (m.some((x) => x !== 0)) limpio[k] = [...m];
      setOriginal(limpio);
      setValores(clonar(limpio));
      toast.success(`Guardado: ${lote.length} ${lote.length === 1 ? "celda" : "celdas"}`);
      router.refresh();
    });
  }

  const toggleGrupo = (id: string) =>
    setColapsados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const filaDialogo = dialogoFila ? partirClave(dialogoFila.clave) : null;
  const opcionesCentro = centros.filter((c) => c.activo || centrosUsados.has(c.id));
  const anio = Number(ejercicio.fecha_inicio.slice(0, 4));

  return (
    <div className="space-y-5 pb-8">
      {/* Encabezado */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={easeSmooth}>
            <Link
              href={`/contabilidad/presupuesto?ejercicio=${ejercicio.id}`}
              className="group inline-flex items-center gap-1 text-[11px] font-heading uppercase tracking-editorial text-bordo-700 hover:text-bordo-900"
            >
              <ArrowLeft className="size-3 transition-transform group-hover:-translate-x-0.5" />
              Presupuesto · {ejercicio.nombre}
            </Link>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...easeSmooth, delay: 0.05 }}
            className="font-display text-2xl uppercase tracking-tightest text-foreground sm:text-3xl"
          >
            {presupuesto.nombre}
          </motion.h1>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...easeSmooth, delay: 0.12 }}
            className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
          >
            <span className="font-heading">Versión {presupuesto.version}</span>
            <EstadoBadge estado={presupuesto.estado} />
            {!editable && (
              <span className="inline-flex items-center gap-1">
                <Lock className="size-3" />
                {presupuesto.estado === "borrador" ? "Solo lectura" : "Congelado: para cambiarlo, reformulalo"}
              </span>
            )}
            {editable && (
              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setEditandoNombre(true)}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-heading text-bordo-800 transition-colors hover:bg-bordo-50"
              >
                <Tag className="size-3" />
                Nombre y notas
              </motion.button>
            )}
          </motion.div>
          <AnimatePresence initial={false}>
            {presupuesto.notas && <Notas key={presupuesto.notas} texto={presupuesto.notas} />}
          </AnimatePresence>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...easeSmooth, delay: 0.15 }}
          className="flex flex-wrap gap-2"
        >
          {presupuesto.estado !== "borrador" && (
            <Link
              href={`/contabilidad/presupuesto/ejecucion?ejercicio=${ejercicio.id}&presupuesto=${presupuesto.id}`}
              className={cn(buttonVariants({ variant: "outline" }), "rounded-full px-3.5")}
            >
              <BarChart3 className="size-3.5" />
              Ver ejecución
            </Link>
          )}
          {editable && (
            <>
              <BotonAnimado
                variant="ghost"
                onClick={() => setConfirmar("eliminar")}
                className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
              >
                Eliminar borrador
              </BotonAnimado>
              <BotonAnimado
                variant="outline"
                onClick={() => setConfirmar("aprobar")}
                disabled={pendientes > 0 || Object.keys(original).length === 0}
                title={
                  pendientes > 0
                    ? "Guardá los cambios antes de aprobar"
                    : Object.keys(original).length === 0
                      ? "El presupuesto está vacío"
                      : undefined
                }
                className="border-emerald-200 text-emerald-800 hover:bg-emerald-50"
              >
                <CheckCircle2 className="size-3.5" />
                Aprobar
              </BotonAnimado>
              <BotonAnimado
                onClick={guardar}
                disabled={pendientes === 0 || guardando}
                className="bg-bordo-800 text-white hover:bg-bordo-900"
              >
                {guardando ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                Guardar
                <AnimatePresence>
                  {pendientes > 0 && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={springSmooth}
                      className="ml-0.5 rounded-full bg-white/20 px-1.5 text-[11px] tabular-nums"
                    >
                      {pendientes}
                    </motion.span>
                  )}
                </AnimatePresence>
              </BotonAnimado>
            </>
          )}
        </motion.div>
      </div>

      {/* Totales */}
      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <Kpi titulo="Ingresos" valor={totalIngresos} tono="text-emerald-700" />
        <Kpi titulo="Egresos" valor={totalEgresos} tono="text-rose-700" />
        <Kpi
          titulo={resultado >= 0 ? "Superávit" : "Déficit"}
          valor={Math.abs(resultado)}
          tono={resultado >= 0 ? "text-emerald-700" : "text-rose-700"}
          destacado
        />
      </motion.div>

      {/* Barra de herramientas */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...easeSmooth, delay: 0.1 }}
        className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <Filter className="size-3.5 shrink-0 text-bordo-700" />
          <span className="shrink-0 font-heading uppercase tracking-editorial">Centro de costo</span>
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-lg border border-linea bg-white px-2 text-sm text-foreground outline-none transition-all focus:border-bordo-700 focus:ring-3 focus:ring-bordo-800/10 sm:flex-none"
          >
            <option value={TODOS}>Todos</option>
            <option value={SIN_CENTRO}>Sin centro</option>
            {opcionesCentro.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
                {centrosUsados.has(c.id) ? " •" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {cantidadFilas} {cantidadFilas === 1 ? "fila" : "filas"}
          </span>
          {editable && (
            <BotonAnimado size="sm" variant="outline" onClick={() => setAgregar(true)}>
              <Plus className="size-3.5" />
              Agregar cuenta
            </BotonAnimado>
          )}
        </div>
      </motion.div>

      {/* Grilla */}
      <motion.div
        ref={tablaRef}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...easeSmooth, delay: 0.15 }}
        className="max-h-[calc(100dvh-12rem)] overflow-auto overscroll-x-contain rounded-2xl border border-linea bg-white shadow-card"
      >
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
            <p className="font-heading text-base text-foreground">
              {Object.keys(valores).length === 0 ? "El presupuesto no tiene importes" : "No hay filas con este centro de costo"}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {editable
                ? "Agregá las cuentas de ingresos y egresos que querés presupuestar y cargá los importes de cada mes."
                : "Cambiá el filtro para ver otras filas."}
            </p>
            {editable && (
              <BotonAnimado onClick={() => setAgregar(true)} className="bg-bordo-800 text-white hover:bg-bordo-900">
                <Plus className="size-3.5" />
                Agregar cuenta
              </BotonAnimado>
            )}
          </div>
        ) : (
          <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr className="text-[10px] font-heading uppercase tracking-editorial text-muted-foreground">
                <th className="sticky left-0 top-0 z-30 w-36 min-w-36 border-b border-linea bg-white px-3 py-2.5 text-left sm:w-72 sm:min-w-72">
                  Cuenta
                </th>
                {MESES_CORTOS.map((m) => (
                  <th key={m} className="sticky top-0 z-20 min-w-[5.75rem] border-b border-linea bg-white px-2 py-2.5 text-right">
                    {m}
                  </th>
                ))}
                <th className="sticky top-0 z-20 min-w-[7rem] border-b border-l border-linea bg-superficie px-3 py-2.5 text-right text-bordo-900">
                  Total {anio}
                </th>
                {editable && <th className="sticky top-0 z-20 w-10 border-b border-linea bg-white" aria-label="Acciones" />}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {items.map((item, i) => {
                  if (item.tipo === "seccion") {
                    return (
                      <motion.tr key={`s-${item.clase}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <td
                          colSpan={editable ? 15 : 14}
                          className={cn(
                            "border-b border-linea px-3 pb-1.5 pt-4 font-heading text-[11px] uppercase tracking-editorial",
                            item.clase === "ingreso" ? "text-emerald-800" : "text-rose-800"
                          )}
                        >
                          <span className="sticky left-3 inline-flex items-center gap-2">
                            <span className={cn("size-2 rounded-full", item.clase === "ingreso" ? "bg-emerald-500" : "bg-rose-500")} />
                            {item.clase === "ingreso" ? "Ingresos" : "Egresos"}
                          </span>
                        </td>
                      </motion.tr>
                    );
                  }
                  if (item.tipo === "grupo") {
                    return (
                      <motion.tr
                        key={`g-${item.cuenta.id}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-foreground/80 [&>td]:bg-[#f9f7f3]"
                      >
                        <td className="sticky left-0 z-10 border-b border-linea/70 bg-[#f9f7f3] px-3 py-1.5">
                          <button
                            type="button"
                            onClick={() => toggleGrupo(item.cuenta.id)}
                            aria-expanded={!item.colapsado}
                            className="flex w-full min-w-0 items-center gap-1.5 text-left font-heading"
                            style={{ paddingLeft: item.profundidad * 12 }}
                          >
                            <motion.span animate={{ rotate: item.colapsado ? 0 : 90 }} transition={springSmooth} className="shrink-0">
                              <ChevronRight className="size-3.5 text-bordo-700" />
                            </motion.span>
                            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{item.cuenta.codigo}</span>
                            <span className="truncate">{item.cuenta.nombre}</span>
                          </button>
                        </td>
                        {item.meses.map((v, m) => (
                          <td key={m} className="border-b border-linea/70 px-2 py-1.5 text-right tabular-nums">
                            {formatPresupuesto(v)}
                          </td>
                        ))}
                        <td className="border-b border-l border-linea/70 bg-superficie px-3 py-1.5 text-right font-heading tabular-nums">
                          {formatPresupuesto(suma(item.meses))}
                        </td>
                        {editable && <td className="border-b border-linea/70" />}
                      </motion.tr>
                    );
                  }
                  const meses = valores[item.clave] ?? ceros();
                  const antes = original[item.clave];
                  const nueva = !antes;
                  return (
                    <motion.tr
                      key={item.clave}
                      initial={{ opacity: 0, y: reducir ? 0 : 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25, delay: reducir ? 0 : Math.min(i * 0.008, 0.3) }}
                      className="group/fila"
                    >
                      <td className="sticky left-0 z-10 border-b border-linea/60 bg-white px-3 py-1 transition-colors group-hover/fila:bg-[#fcfbf9]">
                        <div className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: item.profundidad * 12 + 4 }}>
                          <span className="hidden shrink-0 font-mono text-[10px] text-muted-foreground sm:inline">
                            {item.cuenta.codigo}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-foreground" title={`${item.cuenta.codigo} ${item.cuenta.nombre}`}>
                              {item.cuenta.nombre}
                            </span>
                            {item.centro && (
                              <span className="block truncate text-[10px] text-bordo-700">{item.centro.nombre}</span>
                            )}
                          </span>
                          {nueva && (
                            <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-1.5 text-[9px] font-heading uppercase text-amber-800">
                              nueva
                            </span>
                          )}
                          {!item.cuenta.activa && (
                            <span className="ml-auto shrink-0 rounded-full bg-superficie px-1.5 text-[9px] text-muted-foreground">
                              inactiva
                            </span>
                          )}
                        </div>
                      </td>
                      {meses.map((v, m) => (
                        <td key={m} className="border-b border-linea/60 p-0.5">
                          <Celda
                            clave={item.clave}
                            fila={item.indice}
                            mes={m}
                            valor={v}
                            cambiada={v !== (antes?.[m] ?? 0)}
                            editable={editable}
                            onCommit={asignar}
                            onMover={mover}
                          />
                        </td>
                      ))}
                      <td className="border-b border-l border-linea/60 bg-superficie/60 px-3 py-1 text-right font-heading tabular-nums">
                        {formatPresupuesto(suma(meses)) || <span className="text-muted-foreground/60">0</span>}
                      </td>
                      {editable && (
                        <td className="border-b border-linea/60 px-1">
                          <AccionesFila
                            onRepartir={() => setDialogoFila({ clave: item.clave, modo: "repartir" })}
                            onCopiar={() => setDialogoFila({ clave: item.clave, modo: "copiar" })}
                            onVaciar={() => asignarFila(item.clave, ceros())}
                            etiqueta={item.cuenta.nombre}
                          />
                        </td>
                      )}
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
            <tfoot className="text-xs">
              <FilaTotal titulo="Total ingresos" meses={totales.ingreso} editable={editable} tono="text-emerald-800" />
              <FilaTotal titulo="Total egresos" meses={totales.egreso} editable={editable} tono="text-rose-800" />
              <FilaTotal titulo="Resultado" meses={resultadoMeses} editable={editable} resultado />
            </tfoot>
          </table>
        )}
      </motion.div>

      <p className="text-[11px] text-muted-foreground">
        Importes en pesos, ingresos y egresos en positivo. Escribí con punto de miles y coma decimal (1.250,50); Enter o las
        flechas ↑ ↓ pasan a la celda de abajo o de arriba. Un importe en 0 borra la celda al guardar.
        {filtro !== TODOS && " Los totales corresponden solo a las filas del filtro."}
      </p>

      {/* Barra de cambios pendientes */}
      <AnimatePresence>
        {editable && pendientes > 0 && (
          <motion.div
            key="pendientes"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={springSmooth}
            className="sticky bottom-4 z-40 flex justify-center"
          >
            <div className="flex items-center gap-2 rounded-full border border-bordo-200 bg-white/95 py-1.5 pl-4 pr-1.5 shadow-lg backdrop-blur">
              <span className="text-xs text-foreground">
                <EnteroAnimado valor={pendientes} className="font-heading" />{" "}
                {pendientes === 1 ? "cambio sin guardar" : "cambios sin guardar"}
              </span>
              <Button size="sm" variant="ghost" className="rounded-full" onClick={descartar} disabled={guardando}>
                <Undo2 className="size-3.5" />
                <span className="hidden sm:inline">Descartar</span>
              </Button>
              <Button size="sm" className="rounded-full bg-bordo-800 text-white hover:bg-bordo-900" onClick={guardar} disabled={guardando}>
                {guardando ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                {guardando ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {editable && (
        <>
          <EditarPresupuestoDialog open={editandoNombre} onOpenChange={setEditandoNombre} presupuesto={presupuesto} />
          <AgregarCuentaDialog
            open={agregar}
            onOpenChange={setAgregar}
            cuentas={cuentas}
            centros={centros.filter((c) => c.activo)}
            centroInicial={filtro !== TODOS && filtro !== SIN_CENTRO ? filtro : null}
            onAgregar={agregarFila}
          />
          <DialogoFila
            abierto={!!dialogoFila}
            onOpenChange={(o) => !o && setDialogoFila(null)}
            modo={dialogoFila?.modo ?? "repartir"}
            titulo={
              filaDialogo
                ? `${cuentaPorId.get(filaDialogo.cuentaId)?.nombre ?? ""}${
                    filaDialogo.centroId ? ` · ${centroPorId.get(filaDialogo.centroId)?.nombre ?? ""}` : ""
                  }`
                : ""
            }
            meses={dialogoFila ? valores[dialogoFila.clave] ?? ceros() : ceros()}
            onAplicar={(meses) => dialogoFila && asignarFila(dialogoFila.clave, meses)}
          />
          <ConfirmarDialog
            open={confirmar === "aprobar"}
            onOpenChange={(o) => !o && setConfirmar(null)}
            titulo={`Aprobar la versión ${presupuesto.version}`}
            textoAccion="Aprobar"
            textoPendiente="Aprobando…"
            mensajeExito="Presupuesto aprobado"
            aviso={
              versionVigente
                ? `La versión ${versionVigente}, hoy vigente, pasa a «reemplazado» y deja de ser la referencia de la ejecución.`
                : undefined
            }
            accion={async () => {
              const r = await aprobarPresupuesto(presupuesto.id);
              if (r.ok) router.refresh();
              return r;
            }}
          >
            <p>
              Resultado presupuestado: <strong className="tabular-nums">{formatPresupuesto(resultado) || "0"}</strong>. Un
              presupuesto aprobado queda congelado: para cambiarlo hay que reformularlo en una versión nueva.
            </p>
          </ConfirmarDialog>
          <ConfirmarDialog
            open={confirmar === "eliminar"}
            onOpenChange={(o) => !o && setConfirmar(null)}
            titulo="Eliminar el borrador"
            textoAccion="Eliminar"
            textoPendiente="Eliminando…"
            mensajeExito="Borrador eliminado"
            destructivo
            accion={async () => {
              const r = await eliminarPresupuesto(presupuesto.id);
              if (r.ok) {
                setOriginal(valores); // sin aviso de cambios al salir
                router.push(`/contabilidad/presupuesto?ejercicio=${ejercicio.id}`);
              }
              return r;
            }}
          >
            <p>Se borra «{presupuesto.nombre}» con todos sus importes. Esta acción no se puede deshacer.</p>
          </ConfirmarDialog>
        </>
      )}
    </div>
  );
}

function Kpi({ titulo, valor, tono, destacado }: { titulo: string; valor: number; tono: string; destacado?: boolean }) {
  return (
    <motion.div
      variants={fadeInUp}
      transition={easeSmooth}
      className={cn(
        "min-w-0 rounded-2xl border p-3 sm:p-4",
        destacado ? "col-span-2 border-bordo-200 bg-bordo-50/40 sm:col-span-1" : "border-linea bg-white"
      )}
    >
      <div className="text-[10px] font-heading uppercase tracking-editorial text-muted-foreground sm:text-[11px]">{titulo}</div>
      <div className={cn("mt-1 truncate font-heading text-base sm:text-xl", tono)}>
        <ImporteAnimado valor={valor} />
      </div>
    </motion.div>
  );
}

function FilaTotal({
  titulo,
  meses,
  editable,
  tono,
  resultado,
}: {
  titulo: string;
  meses: number[];
  editable: boolean;
  tono?: string;
  resultado?: boolean;
}) {
  const total = suma(meses);
  const fondo = resultado ? "bg-bordo-800 text-white" : "bg-[#f9f7f3]";
  const fmt = (n: number) => (n < 0 ? `(${formatPresupuesto(-n)})` : formatPresupuesto(n) || "0");
  return (
    <tr className={cn("font-heading", fondo)}>
      <td className={cn("sticky left-0 z-10 border-t border-linea px-3 py-2 uppercase tracking-editorial text-[10px]", fondo, tono)}>
        {titulo}
      </td>
      {meses.map((v, m) => (
        <td
          key={m}
          className={cn(
            "border-t border-linea px-2 py-2 text-right tabular-nums",
            resultado && v < 0 && "text-rose-200",
            !resultado && tono
          )}
        >
          {fmt(v)}
        </td>
      ))}
      <td className={cn("border-l border-t border-linea px-3 py-2 text-right tabular-nums", resultado ? "bg-bordo-900" : "bg-superficie", !resultado && tono)}>
        {fmt(total)}
      </td>
      {editable && <td className="border-t border-linea" />}
    </tr>
  );
}

function AccionesFila({
  onRepartir,
  onCopiar,
  onVaciar,
  etiqueta,
}: {
  onRepartir: () => void;
  onCopiar: () => void;
  onVaciar: () => void;
  etiqueta: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Acciones de ${etiqueta}`}
            className="text-muted-foreground opacity-60 transition-opacity hover:bg-bordo-50 hover:text-bordo-700 group-hover/fila:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onClick={onRepartir}>
          <SplitSquareHorizontal className="size-3.5" />
          Repartir un total anual en 12 meses
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCopiar}>
          <Copy className="size-3.5" />
          Mismo importe en todos los meses
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onVaciar}>
          <Eraser className="size-3.5" />
          Vaciar la fila
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Celda de importe: muestra el valor con miles y edita en crudo; confirma al salir o con Enter. */
const Celda = memo(function Celda({
  clave,
  fila,
  mes,
  valor,
  cambiada,
  editable,
  onCommit,
  onMover,
}: {
  clave: string;
  fila: number;
  mes: number;
  valor: number;
  cambiada: boolean;
  editable: boolean;
  onCommit: (clave: string, mes: number, importe: number) => void;
  onMover: (fila: number, mes: number) => boolean;
}) {
  const [borrador, setBorrador] = useState<string | null>(null);
  const [error, setError] = useState(false);

  if (!editable) {
    return (
      <span className="block px-2 py-1.5 text-right tabular-nums text-foreground">
        {formatPresupuesto(valor) || <span className="text-muted-foreground/40">·</span>}
      </span>
    );
  }

  const confirmar = (): boolean => {
    if (borrador === null) return true;
    const n = parsearImporte(borrador);
    if (n === null) {
      setError(true);
      toast.error(`«${borrador}» no es un importe válido`);
      setBorrador(null);
      setTimeout(() => setError(false), 600);
      return false;
    }
    setBorrador(null);
    onCommit(clave, mes, n);
    return true;
  };

  return (
    <motion.input
      data-celda={`${fila}-${mes}`}
      inputMode="decimal"
      autoComplete="off"
      size={1}
      aria-label={`${MESES_CORTOS[mes]}`}
      value={borrador ?? formatPresupuesto(valor)}
      animate={error ? { x: [0, -4, 4, -2, 2, 0] } : { x: 0 }}
      transition={{ duration: 0.35 }}
      onFocus={(e) => {
        // Mismo texto que se muestra (parsearImporte lo entiende): seleccionarlo ya,
        // sin esperar un render, para que lo que se tipee lo reemplace.
        setBorrador(formatPresupuesto(valor));
        e.currentTarget.select();
      }}
      onChange={(e) => setBorrador(e.target.value)}
      onBlur={() => {
        confirmar();
      }}
      onKeyDown={(e) => {
        // Al mover el foco, el blur confirma la celda; si no hay a dónde ir, se confirma acá.
        if (e.key === "Enter" || e.key === "ArrowDown") {
          e.preventDefault();
          if (!onMover(fila + 1, mes)) confirmar();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (!onMover(fila - 1, mes)) confirmar();
        } else if (e.key === "Escape") {
          setBorrador(null);
          e.currentTarget.blur();
        }
      }}
      className={cn(
        "h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-right tabular-nums text-foreground outline-none transition-colors",
        "hover:border-linea focus:border-bordo-400 focus:bg-white focus:ring-2 focus:ring-bordo-100",
        cambiada && "border-amber-200 bg-amber-50 text-amber-900",
        error && "border-rose-300 bg-rose-50"
      )}
    />
  );
});
