"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowRight,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  NotebookPen,
  Plus,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatFecha,
  formatImporte,
  NOMBRE_TIPO_ASIENTO,
  type EstadoAsiento,
  type TipoAsiento,
} from "@/lib/contabilidad/formato";
import { easeSmooth, fadeInUp, staggerContainerFast } from "@/lib/motion";
import type { AsientoLibro, FiltrosLibro, LineaLibro } from "@/lib/contabilidad/asientos";
import { exportarLibroDiario } from "@/app/(dashboard)/contabilidad/asientos/actions";
import { BadgeEstado, BadgeTipo, EncabezadoPagina, ImporteAnimado, MarcaRevertido } from "./ui-asiento";

// ------------------------------------------------------------
// Fechas (cliente)
// ------------------------------------------------------------

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function finDeMes(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function presets(hoy: string) {
  const [y, m] = hoy.split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return [
    { etiqueta: "Este mes", desde: iso(y, m, 1), hasta: iso(y, m, finDeMes(y, m)) },
    { etiqueta: "Mes anterior", desde: iso(py, pm, 1), hasta: iso(py, pm, finDeMes(py, pm)) },
    { etiqueta: "Este año", desde: iso(y, 1, 1), hasta: iso(y, 12, 31) },
  ];
}

const TIPOS = Object.keys(NOMBRE_TIPO_ASIENTO) as TipoAsiento[];

const claseControl =
  "h-10 rounded-lg border border-linea bg-white px-3 text-sm outline-none transition-all focus:border-bordo-700 focus:ring-3 focus:ring-bordo-800/10";

// ------------------------------------------------------------
// Componente
// ------------------------------------------------------------

export function LibroDiario({
  asientos,
  total,
  error,
  filtros,
  porPagina,
  totales,
  puedeEscribir,
  ctaApertura,
  hoy,
}: {
  asientos: AsientoLibro[];
  total: number;
  error: string | null;
  filtros: FiltrosLibro;
  porPagina: number;
  totales: { debe: number; haber: number; borradores: number } | null;
  puedeEscribir: boolean;
  ctaApertura: { href: string; continuar: boolean; ejercicio: string } | null;
  hoy: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [navegando, startNav] = useTransition();
  const [exportando, startExport] = useTransition();
  const [texto, setTexto] = useState(filtros.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const paginas = Math.max(1, Math.ceil(total / porPagina));

  function urlCon(cambios: Partial<Record<keyof FiltrosLibro, string | number | null>>) {
    const base: Record<string, string> = {
      desde: filtros.desde,
      hasta: filtros.hasta,
      estado: filtros.estado ?? "",
      tipo: filtros.tipo ?? "",
      q: filtros.q,
      pagina: String(filtros.pagina),
    };
    for (const [k, v] of Object.entries(cambios)) base[k] = v === null || v === undefined ? "" : String(v);
    if (!("pagina" in cambios)) base.pagina = "1";
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(base)) {
      if (!v || (k === "pagina" && v === "1")) continue;
      p.set(k, v);
    }
    const qs = p.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function filtrar(cambios: Partial<Record<keyof FiltrosLibro, string | number | null>>) {
    startNav(() => router.replace(urlCon(cambios), { scroll: false }));
  }

  function buscar(v: string) {
    setTexto(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => filtrar({ q: v.trim() }), 350);
  }

  function exportar() {
    startExport(async () => {
      const r = await exportarLibroDiario({ ...filtros, pagina: 1 });
      if (!r.ok || !r.filas) {
        toast.error(r.error ?? "No se pudo exportar");
        return;
      }
      if (r.filas.length === 0) {
        toast.info("No hay asientos confirmados para exportar en ese rango");
        return;
      }
      const XLSX = await import("xlsx");
      const encabezado = [
        "Fecha",
        "N°",
        "Tipo",
        "Estado",
        "Asiento",
        "Revertido",
        "Código",
        "Cuenta",
        "Detalle",
        "Debe",
        "Haber",
        "Moneda",
        "Importe origen",
        "TC",
      ];
      let debe = 0;
      let haber = 0;
      const filas = r.filas.map((f) => {
        debe += f.debe;
        haber += f.haber;
        return [
          formatFecha(f.fecha),
          f.numero ?? "",
          NOMBRE_TIPO_ASIENTO[f.tipo as TipoAsiento] ?? f.tipo,
          f.estado === "borrador" ? "Borrador" : "Confirmado",
          f.asiento,
          f.revertido ? "Sí" : "",
          f.codigo,
          f.cuenta,
          f.detalle,
          f.debe,
          f.haber,
          f.moneda,
          f.importe_origen ?? "",
          f.tc ?? "",
        ];
      });
      const ws = XLSX.utils.aoa_to_sheet([
        [`Libro diario del ${formatFecha(filtros.desde)} al ${formatFecha(filtros.hasta)} (solo asientos confirmados)`],
        [],
        encabezado,
        ...filas,
        [],
        ["", "", "", "", "", "", "", "", "Totales", Math.round(debe * 100) / 100, Math.round(haber * 100) / 100],
      ]);
      ws["!cols"] = [10, 6, 12, 11, 40, 9, 12, 32, 30, 14, 14, 8, 14, 10].map((wch) => ({ wch }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Libro diario");
      XLSX.writeFile(wb, `libro-diario_${filtros.desde}_${filtros.hasta}.xlsx`);
      toast.success(`Exportadas ${r.filas.length} líneas`);
    });
  }

  const hayFiltrosExtra = !!(filtros.estado || filtros.tipo || filtros.q);
  const claveLista = `${filtros.desde}|${filtros.hasta}|${filtros.estado}|${filtros.tipo}|${filtros.q}|${filtros.pagina}`;
  const cuadra = totales ? Math.round(totales.debe * 100) === Math.round(totales.haber * 100) : true;

  return (
    <div className="space-y-5 pb-8">
      <EncabezadoPagina
        eyebrow="Contabilidad"
        titulo="Libro diario"
        descripcion={`Asientos del ${formatFecha(filtros.desde)} al ${formatFecha(filtros.hasta)}, ordenados por fecha y número.`}
      >
        <motion.button
          type="button"
          onClick={exportar}
          disabled={exportando}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-linea bg-white px-4 text-sm font-medium text-foreground transition-colors hover:border-bordo-200 hover:bg-superficie disabled:opacity-60"
        >
          {exportando ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4 text-emerald-700" />}
          Exportar Excel
        </motion.button>
        {puedeEscribir && (
          <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}>
            <Link
              href="/contabilidad/asientos/nuevo"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-bordo-800 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-bordo-900"
            >
              <Plus className="size-4" />
              Nuevo asiento
            </Link>
          </motion.div>
        )}
      </EncabezadoPagina>

      {/* Saldos iniciales */}
      {ctaApertura && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...easeSmooth, delay: 0.1 }}
          className="flex flex-col gap-3 rounded-2xl border border-dorado-300 bg-gradient-to-r from-dorado-50 to-white p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-dorado-100 text-dorado-800">
              <BookOpenCheck className="size-5" />
            </div>
            <div>
              <div className="font-heading text-sm text-foreground">
                {ctaApertura.continuar ? "Los saldos iniciales están en borrador" : "Falta cargar los saldos iniciales"}
              </div>
              <div className="text-xs text-muted-foreground">
                {ctaApertura.continuar
                  ? `Revisá y confirmá el asiento de apertura de ${ctaApertura.ejercicio}.`
                  : `El primer ejercicio (${ctaApertura.ejercicio}) arranca con un asiento de apertura con el saldo de cada cuenta.`}
              </div>
            </div>
          </div>
          <Link
            href={ctaApertura.href}
            className="group inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-dorado-300 px-4 text-sm font-medium text-bordo-950 transition-colors hover:bg-dorado-400"
          >
            {ctaApertura.continuar ? "Continuar" : "Cargar saldos iniciales"}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </motion.div>
      )}

      {/* Filtros */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...easeSmooth, delay: 0.05 }}
        className="space-y-3 rounded-2xl border border-linea bg-white p-3"
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[9.5rem_9.5rem_9rem_10rem_minmax(0,1fr)]">
          <label className="space-y-1">
            <span className="px-0.5 text-[10px] uppercase tracking-editorial text-muted-foreground">Desde</span>
            <input
              type="date"
              value={filtros.desde}
              onChange={(e) => e.target.value && filtrar({ desde: e.target.value })}
              className={cn(claseControl, "w-full tabular-nums")}
            />
          </label>
          <label className="space-y-1">
            <span className="px-0.5 text-[10px] uppercase tracking-editorial text-muted-foreground">Hasta</span>
            <input
              type="date"
              value={filtros.hasta}
              onChange={(e) => e.target.value && filtrar({ hasta: e.target.value })}
              className={cn(claseControl, "w-full tabular-nums")}
            />
          </label>
          <label className="space-y-1">
            <span className="px-0.5 text-[10px] uppercase tracking-editorial text-muted-foreground">Estado</span>
            <select
              value={filtros.estado ?? ""}
              onChange={(e) => filtrar({ estado: e.target.value || null })}
              className={cn(claseControl, "w-full")}
            >
              <option value="">Todos</option>
              <option value="confirmado">Confirmados</option>
              <option value="borrador">Borradores</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="px-0.5 text-[10px] uppercase tracking-editorial text-muted-foreground">Tipo</span>
            <select
              value={filtros.tipo ?? ""}
              onChange={(e) => filtrar({ tipo: e.target.value || null })}
              className={cn(claseControl, "w-full")}
            >
              <option value="">Todos</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {NOMBRE_TIPO_ASIENTO[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 sm:col-span-2 lg:col-span-1">
            <span className="px-0.5 text-[10px] uppercase tracking-editorial text-muted-foreground">Buscar</span>
            <div className="relative">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={texto}
                onChange={(e) => buscar(e.target.value)}
                placeholder="Texto en la descripción…"
                className={cn(claseControl, "w-full pr-9 pl-9")}
              />
              {texto && (
                <button
                  type="button"
                  aria-label="Limpiar búsqueda"
                  onClick={() => buscar("")}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-superficie hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {presets(hoy).map((p) => {
            const activo = p.desde === filtros.desde && p.hasta === filtros.hasta;
            return (
              <motion.button
                key={p.etiqueta}
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => filtrar({ desde: p.desde, hasta: p.hasta })}
                className={cn(
                  "relative rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  activo ? "text-bordo-800" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {activo && (
                  <motion.span
                    layoutId="preset-activo"
                    className="absolute inset-0 rounded-full bg-bordo-50 ring-1 ring-bordo-100"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative">{p.etiqueta}</span>
              </motion.button>
            );
          })}
          {hayFiltrosExtra && (
            <button
              type="button"
              onClick={() => {
                if (timer.current) clearTimeout(timer.current);
                setTexto("");
                filtrar({ estado: null, tipo: null, q: "" });
              }}
              className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-superficie hover:text-foreground"
            >
              <X className="size-3" />
              Limpiar filtros
            </button>
          )}
          <AnimatePresence>
            {navegando && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", !hayFiltrosExtra && "ml-auto")}
              >
                <Loader2 className="size-3.5 animate-spin" />
                Cargando…
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          No se pudo leer el libro diario: {error}
        </div>
      )}

      {/* Lista */}
      <div className={cn("transition-opacity duration-200", navegando && "pointer-events-none opacity-50")}>
        {asientos.length === 0 && !error ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center rounded-2xl border border-dashed border-linea bg-white px-4 py-14 text-center"
          >
            <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-superficie">
              <NotebookPen className="size-6 text-muted-foreground" />
            </div>
            <div className="font-heading text-base text-foreground">No hay asientos en este período</div>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {hayFiltrosExtra ? "Probá sacando algún filtro o ampliando las fechas." : "Cambiá el rango de fechas o cargá un asiento nuevo."}
            </p>
            {puedeEscribir && (
              <Link
                href="/contabilidad/asientos/nuevo"
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-bordo-800 px-4 text-sm font-medium text-white transition-colors hover:bg-bordo-900"
              >
                <Plus className="size-4" />
                Nuevo asiento
              </Link>
            )}
          </motion.div>
        ) : (
          <motion.ol
            key={claveLista}
            initial="hidden"
            animate="visible"
            variants={staggerContainerFast}
            className="space-y-3"
          >
            {asientos.map((a) => (
              <TarjetaAsiento key={a.id} asiento={a} />
            ))}
          </motion.ol>
        )}
      </div>

      {/* Paginado */}
      {paginas > 1 && (
        <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Paginado">
          <PaginaLink href={urlCon({ pagina: filtros.pagina - 1 })} deshabilitado={filtros.pagina <= 1}>
            <ChevronLeft className="size-4" />
            Anterior
          </PaginaLink>
          <span className="text-xs text-muted-foreground tabular-nums">
            Página {filtros.pagina} de {paginas} · {total} asientos
          </span>
          <PaginaLink href={urlCon({ pagina: filtros.pagina + 1 })} deshabilitado={filtros.pagina >= paginas}>
            Siguiente
            <ChevronRight className="size-4" />
          </PaginaLink>
        </nav>
      )}

      {/* Totales del período */}
      {totales && total > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...easeSmooth, delay: 0.15 }}
          className="flex flex-col gap-3 rounded-2xl border border-linea bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <div className="font-heading text-[11px] uppercase tracking-editorial text-muted-foreground">
              Totales del período · confirmados
            </div>
            <div className="text-xs text-muted-foreground">
              {total} asiento{total === 1 ? "" : "s"}
              {totales.borradores > 0 &&
                ` · ${totales.borradores} en borrador, fuera de los totales`}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">Σ Debe</div>
              <ImporteAnimado valor={totales.debe} className="font-heading text-lg text-foreground" />
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">Σ Haber</div>
              <ImporteAnimado valor={totales.haber} className="font-heading text-lg text-foreground" />
            </div>
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                cuadra ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
              )}
            >
              {cuadra ? "Cuadra" : "No cuadra"}
            </span>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function PaginaLink({
  href,
  deshabilitado,
  children,
}: {
  href: string;
  deshabilitado: boolean;
  children: React.ReactNode;
}) {
  const clase =
    "inline-flex h-9 items-center gap-1 rounded-lg border border-linea bg-white px-3 text-sm font-medium transition-colors";
  if (deshabilitado) {
    return <span className={cn(clase, "pointer-events-none opacity-40")}>{children}</span>;
  }
  return (
    <Link href={href} className={cn(clase, "hover:border-bordo-200 hover:text-bordo-800")}>
      {children}
    </Link>
  );
}

// ------------------------------------------------------------
// Tarjeta de asiento
// ------------------------------------------------------------

function TarjetaAsiento({ asiento: a }: { asiento: AsientoLibro }) {
  const revertido = !!a.revertido_por_id;
  return (
    <motion.li variants={fadeInUp} transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}>
      <motion.div
        whileHover={{ y: -2 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className={cn(
          "overflow-hidden rounded-2xl border bg-white transition-shadow hover:shadow-card-hover",
          a.estado === "borrador" ? "border-dorado-300/70" : "border-linea",
          revertido && "opacity-75"
        )}
      >
        <Link
          href={`/contabilidad/asientos/${a.id}`}
          className="group flex flex-col gap-2 border-b border-linea px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
        >
          <div className="flex shrink-0 items-baseline gap-2">
            <span
              className={cn(
                "font-heading text-base tabular-nums",
                a.numero ? "text-bordo-800" : "text-dorado-700"
              )}
            >
              {a.numero ? `N° ${a.numero}` : "s/n"}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">{formatFecha(a.fecha)}</span>
          </div>
          <div className={cn("min-w-0 flex-1 text-sm text-foreground", revertido && "line-through decoration-rose-300")}>
            <span className="line-clamp-2 sm:line-clamp-1">{a.descripcion}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <BadgeTipo tipo={a.tipo} />
            {a.estado === "borrador" && <BadgeEstado estado={a.estado as EstadoAsiento} />}
            {revertido && <MarcaRevertido />}
            <span className="ml-auto pl-2 font-heading text-sm text-foreground tabular-nums sm:ml-2">
              {formatImporte(a.total)}
            </span>
            <ArrowRight className="size-4 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-bordo-800" />
          </div>
        </Link>
        <ul className="divide-y divide-linea/60">
          {a.lineas.map((l) => (
            <FilaLibro key={l.id} linea={l} />
          ))}
        </ul>
      </motion.div>
    </motion.li>
  );
}

function FilaLibro({ linea: l }: { linea: LineaLibro }) {
  const esHaber = l.haber > 0;
  const importe = esHaber ? l.haber : l.debe;
  const origen =
    l.moneda && l.importe_origen !== null && l.tc !== null ? (
      <div className="text-[11px] text-sky-800 tabular-nums">
        {formatImporte(l.importe_origen, l.moneda)} × {String(l.tc).replace(".", ",")}
      </div>
    ) : null;

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-4 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_9rem_9rem]">
      <div className={cn("min-w-0", esHaber && "pl-5 sm:pl-8")}>
        <div className="flex min-w-0 items-baseline gap-2">
          {esHaber && <span className="text-xs text-muted-foreground italic">a</span>}
          <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{l.cuenta_codigo}</span>
          <span className="truncate text-foreground/90">{l.cuenta_nombre}</span>
        </div>
        {l.descripcion && <div className="truncate text-xs text-muted-foreground">{l.descripcion}</div>}
      </div>
      {/* Mobile: una sola columna con D/H */}
      <div className="text-right sm:hidden">
        <div className="tabular-nums">
          <span className="mr-1 text-[10px] text-muted-foreground">{esHaber ? "H" : "D"}</span>
          {formatImporte(importe)}
        </div>
        {origen}
      </div>
      <div className="hidden text-right sm:block">
        {!esHaber && (
          <>
            <div className="tabular-nums">{formatImporte(l.debe)}</div>
            {origen}
          </>
        )}
      </div>
      <div className="hidden text-right sm:block">
        {esHaber && (
          <>
            <div className="tabular-nums">{formatImporte(l.haber)}</div>
            {origen}
          </>
        )}
      </div>
    </li>
  );
}
