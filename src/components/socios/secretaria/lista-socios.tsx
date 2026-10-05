"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Download, FileSpreadsheet, Link2, Search, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { formatCedula, NOMBRE_MEDIO, normalizarTexto, soloDigitos, MEDIOS_COBRO } from "@/lib/socios/esquemas";
import type { Disciplina, FilaPadron, Kpis } from "@/lib/socios/padron";
import {
  BadgeEstadoSocio,
  BadgeSituacion,
  Boton,
  BotonLink,
  EncabezadoPagina,
  EtiquetaMedio,
  Filtros,
  ImporteAnimado,
  Kpi,
  NumeroAnimado,
  Vacio,
  claseControl,
} from "./ui";

type FiltroEstado = "vigentes" | "bajas" | "todos";
type FiltroSituacion = "todas" | "al_dia" | "con_deuda" | "morosos";

export interface FiltrosIniciales {
  q?: string;
  estado?: FiltroEstado;
  situacion?: FiltroSituacion;
  disciplina?: string;
  medio?: string;
}

const POR_PAGINA = 50;

export function ListaSocios({
  filas,
  kpis,
  disciplinas,
  hoy,
  puedeGestionar,
  iniciales,
}: {
  filas: FilaPadron[];
  kpis: Kpis;
  disciplinas: Disciplina[];
  hoy: string;
  puedeGestionar: boolean;
  iniciales: FiltrosIniciales;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState(iniciales.q ?? "");
  const [estado, setEstado] = useState<FiltroEstado>(iniciales.estado ?? "vigentes");
  const [situacion, setSituacion] = useState<FiltroSituacion>(iniciales.situacion ?? "todas");
  const [disciplina, setDisciplina] = useState(iniciales.disciplina ?? "");
  const [medio, setMedio] = useState(iniciales.medio ?? "");
  const [limite, setLimite] = useState(POR_PAGINA);
  const [exportando, setExportando] = useState(false);
  const q = useDeferredValue(busqueda);

  const indice = useMemo(
    () =>
      new Map(
        filas.map((f) => [
          f.id,
          `${normalizarTexto(`${f.nombre} ${f.apellido} ${f.apellido} ${f.nombre}`)} ${f.cedula} ${f.numero ?? ""}`,
        ])
      ),
    [filas]
  );

  const porEstado = useMemo(
    () =>
      filas.filter((f) =>
        estado === "todos" ? true : estado === "vigentes" ? f.estado === "vigente" : f.estado === "baja"
      ),
    [filas, estado]
  );

  const visibles = useMemo(() => {
    const texto = normalizarTexto(q);
    const digitos = soloDigitos(q);
    const palabras = texto.split(" ").filter(Boolean);
    return porEstado
      .filter((f) => {
        if (palabras.length) {
          const idx = indice.get(f.id) ?? "";
          const coincideTexto = palabras.every((p) => idx.includes(p));
          const coincideNumero = digitos.length > 0 && digitos === q.trim() && (f.cedula.includes(digitos) || String(f.numero ?? "") === digitos);
          if (!coincideTexto && !coincideNumero) return false;
        }
        if (disciplina && !f.disciplinas.some((d) => String(d.id) === disciplina)) return false;
        if (medio === "sin" ? f.medio !== null : medio && f.medio !== medio) return false;
        if (situacion === "al_dia" && f.alDia !== true) return false;
        if (situacion === "con_deuda" && !(f.deudaVencida > 0)) return false;
        if (situacion === "morosos" && f.alDia !== false) return false;
        return true;
      })
      .sort(
        (a, b) =>
          a.apellido.localeCompare(b.apellido, "es") || a.nombre.localeCompare(b.nombre, "es") || a.id - b.id
      );
  }, [porEstado, q, indice, disciplina, medio, situacion]);

  const cantidades = useMemo(
    () => ({
      vigentes: filas.filter((f) => f.estado === "vigente").length,
      bajas: filas.filter((f) => f.estado === "baja").length,
      todos: filas.length,
    }),
    [filas]
  );

  const hayFiltros = !!busqueda || situacion !== "todas" || !!disciplina || !!medio;
  const limpiar = () => {
    setBusqueda("");
    setSituacion("todas");
    setDisciplina("");
    setMedio("");
    setLimite(POR_PAGINA);
  };

  async function exportar() {
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const datos = visibles.map((f) => [
        f.numero ?? "",
        f.apellido,
        f.nombre,
        formatCedula(f.cedula),
        { vigente: "Socio", baja: "Baja", programado: "Alta programada", sin_alta: "Sin membresía" }[f.estado],
        f.alta ? formatFecha(f.alta) : "",
        f.baja ? formatFecha(f.baja) : "",
        f.disciplinas.map((d) => `${d.nombre} (${d.plan})`).join("; "),
        f.medio
          ? f.medio === "transferencia_disciplina" && f.medioDisciplina
            ? `Cuenta de ${f.medioDisciplina}`
            : NOMBRE_MEDIO[f.medio]
          : "",
        f.alDia === null ? "" : f.cuotasVencidas === 0 ? "Al día" : f.alDia ? "Al día (con vencidas)" : "Moroso",
        f.cuotasVencidas,
        f.deudaVencida,
        f.deudaTotal,
        f.saldoAFavor,
        f.email ?? "",
        f.telefono ?? "",
        f.vinculado ? "Sí" : "No",
      ]);
      const ws = XLSX.utils.aoa_to_sheet([
        [
          "Número",
          "Apellido",
          "Nombre",
          "Cédula",
          "Estado",
          "Alta",
          "Baja",
          "Disciplinas",
          "Medio de cobro",
          "Situación",
          "Cuotas vencidas",
          "Deuda vencida",
          "Deuda total",
          "Saldo a favor",
          "Email",
          "Teléfono",
          "Cuenta web",
        ],
        ...datos,
      ]);
      ws["!cols"] = [8, 20, 20, 13, 14, 11, 11, 40, 26, 20, 10, 13, 13, 13, 28, 16, 10].map((wch) => ({ wch }));
      for (let r = 1; r <= datos.length; r++) {
        for (const c of [11, 12, 13]) {
          const celda = ws[XLSX.utils.encode_cell({ r, c })];
          if (celda) celda.z = "#,##0.00";
        }
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Socios");
      XLSX.writeFile(wb, `socios-${hoy}.xlsx`);
      toast.success(`Exportados ${datos.length} socios`);
    } catch {
      toast.error("No se pudo generar el Excel");
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="space-y-5 pb-10">
      <EncabezadoPagina
        eyebrow="Secretaría"
        titulo="Socios"
        descripcion="Padrón de socios: membresías, disciplinas, medio de cobro y situación de cuotas."
      >
        <Boton variante="secundario" onClick={exportar} pendiente={exportando} disabled={visibles.length === 0}>
          {!exportando && <Download className="size-4" />}
          Exportar
        </Boton>
        {puedeGestionar && (
          <>
            <BotonLink href="/secretaria/socios/importar" variante="secundario">
              <FileSpreadsheet className="size-4" />
              Importar
            </BotonLink>
            <BotonLink href="/secretaria/socios/nuevo">
              <UserPlus className="size-4" />
              Nuevo socio
            </BotonLink>
          </>
        )}
      </EncabezadoPagina>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Socios vigentes" delay={0}>
          <NumeroAnimado valor={kpis.vigentes} />
        </Kpi>
        <Kpi etiqueta="Altas del mes" tono={kpis.altasMes > 0 ? "bueno" : "neutro"} delay={0.05}>
          <NumeroAnimado valor={kpis.altasMes} />
        </Kpi>
        <Kpi etiqueta="Bajas del mes" delay={0.1}>
          <NumeroAnimado valor={kpis.bajasMes} />
        </Kpi>
        <Kpi
          etiqueta="Con deuda vencida"
          tono={kpis.conDeuda > 0 ? "alerta" : "neutro"}
          delay={0.15}
          detalle={
            kpis.conDeuda > 0 ? (
              <>
                {kpis.morosos} fuera de tolerancia · <ImporteAnimado valor={kpis.deudaVencida} moneda="UYU" />
              </>
            ) : (
              "Nadie con cuotas vencidas"
            )
          }
        >
          <NumeroAnimado valor={kpis.conDeuda} />
        </Kpi>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="space-y-3 rounded-2xl border border-linea bg-white p-3 sm:p-4"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setLimite(POR_PAGINA);
              }}
              placeholder="Buscar por nombre, cédula o número de socio"
              aria-label="Buscar socios"
              className={cn(claseControl, "pl-9")}
            />
          </div>
          <Filtros
            id="estado-socios"
            valor={estado}
            onChange={(v) => {
              setEstado(v);
              setLimite(POR_PAGINA);
            }}
            opciones={[
              { valor: "vigentes", etiqueta: "Vigentes", cantidad: cantidades.vigentes },
              { valor: "bajas", etiqueta: "Bajas", cantidad: cantidades.bajas },
              { valor: "todos", etiqueta: "Todos", cantidad: cantidades.todos },
            ]}
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select
            value={disciplina}
            onChange={(e) => setDisciplina(e.target.value)}
            aria-label="Disciplina"
            className={claseControl}
          >
            <option value="">Todas las disciplinas</option>
            {disciplinas.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
          <select
            value={situacion}
            onChange={(e) => setSituacion(e.target.value as FiltroSituacion)}
            aria-label="Situación de cuotas"
            className={claseControl}
          >
            <option value="todas">Cualquier situación</option>
            <option value="al_dia">Al día</option>
            <option value="con_deuda">Con cuotas vencidas</option>
            <option value="morosos">Morosos (fuera de tolerancia)</option>
          </select>
          <select value={medio} onChange={(e) => setMedio(e.target.value)} aria-label="Medio de cobro" className={claseControl}>
            <option value="">Cualquier medio de cobro</option>
            {MEDIOS_COBRO.map((m) => (
              <option key={m} value={m}>
                {NOMBRE_MEDIO[m]}
              </option>
            ))}
            <option value="sin">Sin medio de cobro</option>
          </select>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-foreground tabular-nums">{visibles.length.toLocaleString("es-UY")}</span>{" "}
            {visibles.length === 1 ? "persona" : "personas"}
          </span>
          <AnimatePresence>
            {hayFiltros && (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                whileTap={{ scale: 0.95 }}
                onClick={limpiar}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium text-bordo-800 hover:bg-bordo-50"
              >
                <X className="size-3.5" />
                Limpiar filtros
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {visibles.length === 0 ? (
        <Vacio
          icono={Users}
          titulo={filas.length === 0 ? "Todavía no hay socios en el padrón" : "Nadie coincide con la búsqueda"}
          texto={
            filas.length === 0
              ? "Cargá el primero con “Nuevo socio” o migrá el padrón desde un Excel."
              : "Probá con otro nombre o sacá algún filtro."
          }
        >
          {filas.length === 0 && puedeGestionar ? (
            <>
              <BotonLink href="/secretaria/socios/nuevo">
                <UserPlus className="size-4" />
                Nuevo socio
              </BotonLink>
              <BotonLink href="/secretaria/socios/importar" variante="secundario">
                <FileSpreadsheet className="size-4" />
                Importar Excel
              </BotonLink>
            </>
          ) : hayFiltros ? (
            <Boton variante="secundario" onClick={limpiar}>
              Limpiar filtros
            </Boton>
          ) : null}
        </Vacio>
      ) : (
        <>
          {/* Escritorio */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="hidden overflow-hidden rounded-2xl border border-linea bg-white md:block"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-linea bg-superficie/60 text-left text-[11px] uppercase tracking-editorial text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">N°</th>
                    <th className="px-3 py-2.5 font-medium">Socio</th>
                    <th className="px-3 py-2.5 font-medium">Cédula</th>
                    <th className="px-3 py-2.5 font-medium">Disciplinas</th>
                    <th className="px-3 py-2.5 font-medium">Medio de cobro</th>
                    <th className="px-3 py-2.5 font-medium">Situación</th>
                    <th className="px-3 py-2.5 text-center font-medium">Web</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {visibles.slice(0, limite).map((f, i) => (
                      <motion.tr
                        key={f.id}
                        layout="position"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25, delay: Math.min(i, 15) * 0.015 }}
                        onClick={() => router.push(`/secretaria/socios/${f.id}`)}
                        className="group cursor-pointer border-b border-linea/70 last:border-0 hover:bg-bordo-50/40"
                      >
                        <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{f.numero ?? "—"}</td>
                        <td className="max-w-[16rem] px-3 py-2.5">
                          <Link
                            href={`/secretaria/socios/${f.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="block truncate font-medium text-foreground group-hover:text-bordo-800"
                          >
                            {f.apellido}, {f.nombre}
                          </Link>
                          {f.estado !== "vigente" && (
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <BadgeEstadoSocio estado={f.estado} />
                              {f.baja && <span className="text-[11px] text-muted-foreground">{formatFecha(f.baja)}</span>}
                            </div>
                          )}
                          {f.estado === "vigente" && f.baja && <BajaProgramada fecha={f.baja} className="mt-0.5" />}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-muted-foreground">
                          {formatCedula(f.cedula)}
                        </td>
                        <td className="px-3 py-2.5">
                          <Disciplinas lista={f.disciplinas} />
                        </td>
                        <td className="max-w-[12rem] px-3 py-2.5">
                          {f.estado === "vigente" ? <EtiquetaMedio medio={f.medio} disciplina={f.medioDisciplina} varias={f.disciplinas.length > 1} /> : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <BadgeSituacion cuotasVencidas={f.cuotasVencidas} alDia={f.alDia} />
                          {f.deudaVencida > 0 && (
                            <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                              {formatImporte(f.deudaVencida, "UYU")}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {f.vinculado ? (
                            <Link2 className="mx-auto size-4 text-emerald-600" aria-label="Cuenta web vinculada" />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="pr-3">
                          <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* Mobile */}
          <div className="space-y-2 md:hidden">
            <AnimatePresence initial={false}>
              {visibles.slice(0, limite).map((f, i) => (
                <motion.div
                  key={f.id}
                  layout="position"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i, 10) * 0.02 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <Link
                    href={`/secretaria/socios/${f.id}`}
                    className="block rounded-2xl border border-linea bg-white p-3.5 transition-colors active:bg-superficie"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">
                          {f.apellido}, {f.nombre}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                          {f.numero ? `N° ${f.numero} · ` : ""}CI {formatCedula(f.cedula)}
                        </div>
                        {f.estado === "vigente" && f.baja && <BajaProgramada fecha={f.baja} className="mt-1" />}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {f.vinculado && <Link2 className="size-3.5 text-emerald-600" aria-label="Cuenta web vinculada" />}
                        {f.estado === "vigente" ? (
                          <BadgeSituacion cuotasVencidas={f.cuotasVencidas} alDia={f.alDia} />
                        ) : (
                          <BadgeEstadoSocio estado={f.estado} />
                        )}
                      </div>
                    </div>
                    {(f.disciplinas.length > 0 || f.estado === "vigente") && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <Disciplinas lista={f.disciplinas} />
                        {f.estado === "vigente" && <EtiquetaMedio medio={f.medio} disciplina={f.medioDisciplina} varias={f.disciplinas.length > 1} />}
                      </div>
                    )}
                  </Link>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {visibles.length > limite && (
            <div className="flex justify-center">
              <Boton variante="secundario" onClick={() => setLimite((l) => l + POR_PAGINA * 2)}>
                Mostrar más ({(visibles.length - limite).toLocaleString("es-UY")} restantes)
              </Boton>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Disciplinas({ lista }: { lista: FilaPadron["disciplinas"] }) {
  if (lista.length === 0) return <span className="text-xs text-muted-foreground">Solo social</span>;
  // Una pastilla por disciplina (el día de un cambio de categoría hay dos planes de la misma).
  const porDisciplina = new Map<number, { id: number; nombre: string; planes: string[] }>();
  for (const d of lista) {
    const x = porDisciplina.get(d.id) ?? { id: d.id, nombre: d.nombre, planes: [] };
    x.planes.push(d.plan);
    porDisciplina.set(d.id, x);
  }
  return (
    <div className="flex flex-wrap gap-1">
      {[...porDisciplina.values()].map((d) => (
        <span
          key={d.id}
          title={d.planes.join(" · ")}
          className="inline-flex h-5 items-center rounded-md bg-bordo-50 px-1.5 text-[11px] font-medium text-bordo-800"
        >
          {d.nombre}
        </span>
      ))}
    </div>
  );
}

/** Sigue vigente pero ya tiene la baja cargada (desde la disciplina o secretaría). */
function BajaProgramada({ fecha, className }: { fecha: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800",
        className
      )}
    >
      Baja el {formatFecha(fecha)}
    </span>
  );
}
