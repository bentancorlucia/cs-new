"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownWideNarrow, FileSpreadsheet, HandCoins, Search, Settings2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte, NOMBRE_MES } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";
import { MEDIOS, NOMBRE_MEDIO, r2, type ConfigCuotas, type Disciplina, type FilaMorosidad } from "@/lib/socios/cuotas";
import { guardarConfigCuotas } from "@/app/(dashboard)/cuotas/actions";
import { exportarExcel } from "@/components/contabilidad/reportes/acciones-reporte";
import {
  Aviso,
  BadgeAlDia,
  BadgeMedio,
  Boton,
  Campo,
  EncabezadoPagina,
  Explicacion,
  Filtros,
  ImporteAnimado,
  Kpi,
  NumeroAnimado,
  Panel,
  Vacio,
  claseControl,
} from "./ui";

type Estado = "todos" | "al_dia" | "morosos" | "con_deuda" | "a_favor";
type Orden = "deuda_vencida" | "deuda_total" | "vencidas" | "nombre";
const PAGINA = 100;

export function MorosidadVista({
  filas,
  error,
  hoy,
  config,
  disciplinas,
  puedeCobrar,
  puedeConfigurar,
}: {
  filas: FilaMorosidad[];
  error: string | null;
  hoy: string;
  config: ConfigCuotas | null;
  disciplinas: Disciplina[];
  puedeCobrar: boolean;
  puedeConfigurar: boolean;
}) {
  const [estado, setEstado] = useState<Estado>("todos");
  const [medio, setMedio] = useState("");
  const [disc, setDisc] = useState<number | "">("");
  const [soloSocios, setSoloSocios] = useState(true);
  const [orden, setOrden] = useState<Orden>("deuda_vencida");
  const [texto, setTexto] = useState("");
  const [limite, setLimite] = useState(PAGINA);
  const q = useDeferredValue(texto.trim().toLowerCase());
  const nombreDisc = useMemo(() => new Map(disciplinas.map((d) => [d.id, d.nombre])), [disciplinas]);

  const base = useMemo(() => filas.filter((f) => !soloSocios || f.es_socio), [filas, soloSocios]);
  const lista = useMemo(() => {
    const out = base
      .filter((f) =>
        estado === "todos"
          ? true
          : estado === "al_dia"
            ? f.al_dia
            : estado === "morosos"
              ? !f.al_dia
              : estado === "con_deuda"
                ? f.deuda_total > 0
                : f.saldo_a_favor > 0
      )
      .filter((f) => !medio || (medio === "sin" ? !f.medio : f.medio === medio))
      .filter((f) => !disc || f.disciplinas.includes(disc) || f.medioDisciplina === disc)
      .filter((f) => !q || `${f.persona} ${f.cedula} ${f.numero_socio ?? ""}`.toLowerCase().includes(q));
    const cmp: Record<Orden, (a: FilaMorosidad, b: FilaMorosidad) => number> = {
      deuda_vencida: (a, b) => b.deuda_vencida - a.deuda_vencida || b.deuda_total - a.deuda_total,
      deuda_total: (a, b) => b.deuda_total - a.deuda_total,
      vencidas: (a, b) => b.cuotas_vencidas - a.cuotas_vencidas || b.deuda_vencida - a.deuda_vencida,
      nombre: (a, b) => a.persona.localeCompare(b.persona, "es"),
    };
    return out.sort((a, b) => cmp[orden](a, b) || a.persona.localeCompare(b.persona, "es"));
  }, [base, estado, medio, disc, q, orden]);

  const socios = filas.filter((f) => f.es_socio);
  const tot = {
    alDia: socios.filter((f) => f.al_dia).length,
    morosos: socios.filter((f) => !f.al_dia).length,
    vencida: r2(lista.reduce((s, f) => s + f.deuda_vencida, 0)),
    total: r2(lista.reduce((s, f) => s + f.deuda_total, 0)),
  };

  async function excel() {
    await exportarExcel(`morosidad_${hoy}`, [
      {
        nombre: "Morosidad",
        titulo: "Situación de cuotas de socios",
        subtitulo: `Al ${formatFecha(hoy)} · ${lista.length} personas`,
        columnas: [
          { titulo: "Nº socio", tipo: "entero", ancho: 10 },
          { titulo: "Persona", ancho: 32 },
          { titulo: "Cédula", ancho: 14 },
          { titulo: "Socio vigente", ancho: 10 },
          { titulo: "Medio de cobro", ancho: 24 },
          { titulo: "Disciplinas", ancho: 30 },
          { titulo: "Cuotas vencidas", tipo: "entero", ancho: 10 },
          { titulo: "Deuda vencida", tipo: "importe" },
          { titulo: "Deuda total", tipo: "importe" },
          { titulo: "Saldo a favor", tipo: "importe" },
          { titulo: "Al día", ancho: 8 },
        ],
        filas: lista.map((f) => [
          f.numero_socio,
          f.persona,
          f.cedula,
          f.es_socio ? "Sí" : "No",
          f.medio ? NOMBRE_MEDIO[f.medio] + (f.medioDisciplina ? ` (${nombreDisc.get(f.medioDisciplina) ?? ""})` : "") : "",
          f.disciplinas.map((d) => nombreDisc.get(d) ?? d).join(", "),
          f.cuotas_vencidas,
          f.deuda_vencida,
          f.deuda_total,
          f.saldo_a_favor,
          f.al_dia ? "Sí" : "No",
        ]),
      },
    ]);
  }

  return (
    <div className="space-y-5">
      <EncabezadoPagina eyebrow="Cuotas y cobranza" titulo="Morosidad" descripcion={`Situación de cada persona al ${formatFecha(hoy)}.`}>
        <Boton variante="secundario" onClick={excel} disabled={lista.length === 0}>
          <FileSpreadsheet className="size-4" />
          Exportar a Excel
        </Boton>
      </EncabezadoPagina>

      {error && <Aviso titulo="No se pudo leer la situación">{error}</Aviso>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Socios al día" tono="bueno" delay={0.03} detalle={`de ${socios.length} vigentes`}>
          <NumeroAnimado valor={tot.alDia} />
        </Kpi>
        <Kpi etiqueta="Socios morosos" tono={tot.morosos ? "alerta" : "neutro"} delay={0.06}>
          <NumeroAnimado valor={tot.morosos} />
        </Kpi>
        <Kpi etiqueta="Deuda vencida (filtro)" tono={tot.vencida ? "alerta" : "neutro"} delay={0.09}>
          <ImporteAnimado valor={tot.vencida} moneda="UYU" />
        </Kpi>
        <Kpi etiqueta="Deuda total (filtro)" delay={0.12}>
          <ImporteAnimado valor={tot.total} moneda="UYU" />
        </Kpi>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeSmooth, delay: 0.05 }} className="space-y-3 rounded-2xl border border-linea bg-white p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_12rem_12rem]">
          <div className="relative self-end">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre, cédula o número…" className={cn(claseControl, "pl-9")} />
          </div>
          <Campo etiqueta="Medio de cobro">
            <select value={medio} onChange={(e) => setMedio(e.target.value)} className={claseControl}>
              <option value="">Todos</option>
              {MEDIOS.map((m) => (
                <option key={m} value={m}>
                  {NOMBRE_MEDIO[m]}
                </option>
              ))}
              <option value="sin">Sin medio</option>
            </select>
          </Campo>
          <Campo etiqueta="Disciplina">
            <select value={disc} onChange={(e) => setDisc(e.target.value ? Number(e.target.value) : "")} className={claseControl}>
              <option value="">Todas</option>
              {disciplinas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Ordenar por">
            <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)} className={claseControl}>
              <option value="deuda_vencida">Deuda vencida</option>
              <option value="deuda_total">Deuda total</option>
              <option value="vencidas">Cuotas vencidas</option>
              <option value="nombre">Nombre</option>
            </select>
          </Campo>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Filtros<Estado>
            id="morosidad"
            valor={estado}
            onChange={(v) => {
              setEstado(v);
              setLimite(PAGINA);
            }}
            opciones={[
              { valor: "todos", etiqueta: "Todos", cantidad: base.length },
              { valor: "al_dia", etiqueta: "Al día", cantidad: base.filter((f) => f.al_dia).length },
              { valor: "morosos", etiqueta: "Morosos", cantidad: base.filter((f) => !f.al_dia).length },
              { valor: "con_deuda", etiqueta: "Con deuda", cantidad: base.filter((f) => f.deuda_total > 0).length },
              { valor: "a_favor", etiqueta: "Saldo a favor", cantidad: base.filter((f) => f.saldo_a_favor > 0).length },
            ]}
          />
          <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={soloSocios} onChange={(e) => setSoloSocios(e.target.checked)} className="size-4 accent-bordo-800" />
            Solo socios vigentes
          </label>
        </div>
      </motion.div>

      {lista.length === 0 ? (
        <Vacio icono={UserRound} titulo="Nadie con ese filtro" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-linea bg-white">
          <div className="hidden grid-cols-[minmax(0,1fr)_11rem_6rem_9rem_9rem_7.5rem] gap-3 border-b border-linea bg-superficie/50 px-4 py-2 text-[10px] uppercase tracking-editorial text-muted-foreground lg:grid">
            <span>Persona</span>
            <span>Medio</span>
            <span className="text-right">Vencidas</span>
            <span className="text-right">Deuda vencida</span>
            <span className="text-right">Deuda total</span>
            <span />
          </div>
          <ul className="divide-y divide-linea">
            <AnimatePresence initial={false}>
              {lista.slice(0, limite).map((f, i) => (
                <motion.li
                  key={f.persona_id}
                  layout="position"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { delay: Math.min(i, 20) * 0.015 } }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 text-sm lg:grid-cols-[minmax(0,1fr)_11rem_6rem_9rem_9rem_7.5rem]"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{f.persona}</span>
                      {!f.es_socio && <span className="shrink-0 text-[11px] text-muted-foreground">(no es socio)</span>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      CI {f.cedula}
                      {f.numero_socio ? ` · Nº ${f.numero_socio}` : ""}
                      {f.disciplinas.length > 0 && ` · ${f.disciplinas.map((d) => nombreDisc.get(d) ?? d).join(", ")}`}
                    </div>
                  </div>
                  <div className="justify-self-end lg:justify-self-start">
                    <BadgeAlDia alDia={f.al_dia} vencidas={f.cuotas_vencidas} />
                  </div>
                  <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs lg:contents">
                    <span className="lg:order-none">
                      <BadgeMedio medio={f.medio} detalle={f.medioDisciplina ? nombreDisc.get(f.medioDisciplina) : null} />
                    </span>
                    <span className="hidden text-right tabular-nums lg:block">{f.cuotas_vencidas}</span>
                    <span className={cn("tabular-nums lg:text-right lg:text-sm", f.deuda_vencida > 0 && "text-rose-700")}>
                      <span className="lg:hidden">Vencida </span>
                      {formatImporte(f.deuda_vencida)}
                    </span>
                    <span className="tabular-nums lg:text-right lg:text-sm">
                      <span className="lg:hidden">Total </span>
                      {formatImporte(f.deuda_total)}
                      {f.saldo_a_favor > 0 && <span className="block text-[11px] text-sky-700">a favor {formatImporte(f.saldo_a_favor)}</span>}
                    </span>
                    <span className="ml-auto flex items-center gap-1 lg:ml-0 lg:justify-end">
                      <Link
                        href={`/secretaria/socios/${f.persona_id}`}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-superficie hover:text-bordo-800"
                        title="Ficha del socio"
                        aria-label={`Ficha de ${f.persona}`}
                      >
                        <UserRound className="size-4" />
                      </Link>
                      {puedeCobrar && (
                        <Link
                          href={`/cuotas/cobros/nuevo?persona=${f.persona_id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-linea px-2 py-1 text-xs text-bordo-800 transition-colors hover:border-bordo-200 hover:bg-bordo-50"
                        >
                          <HandCoins className="size-3.5" />
                          Cobrar
                        </Link>
                      )}
                    </span>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {lista.length > limite && (
            <div className="border-t border-linea p-3 text-center">
              <Boton variante="secundario" onClick={() => setLimite((l) => l + PAGINA * 3)}>
                <ArrowDownWideNarrow className="size-4" />
                Mostrar más ({lista.length - limite})
              </Boton>
            </div>
          )}
        </div>
      )}

      {config && <Configuracion config={config} puedeEditar={puedeConfigurar} />}
    </div>
  );
}

function Configuracion({ config, puedeEditar }: { config: ConfigCuotas; puedeEditar: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({
    tolerancia_cuotas: String(config.tolerancia_cuotas),
    tolerancia_debito: String(config.tolerancia_debito),
    dia_vencimiento: String(config.dia_vencimiento),
    mes_cuota_anual: config.mes_cuota_anual,
    cobrar_mes_alta: config.cobrar_mes_alta,
    baja_con_deuda: config.baja_con_deuda as "mantener" | "anular",
  });
  const [guardando, start] = useTransition();
  const cambiado =
    f.tolerancia_cuotas !== String(config.tolerancia_cuotas) ||
    f.tolerancia_debito !== String(config.tolerancia_debito) ||
    f.dia_vencimiento !== String(config.dia_vencimiento) ||
    f.mes_cuota_anual !== config.mes_cuota_anual ||
    f.cobrar_mes_alta !== config.cobrar_mes_alta ||
    f.baja_con_deuda !== config.baja_con_deuda;

  function guardar() {
    start(async () => {
      const r = await guardarConfigCuotas({
        tolerancia_cuotas: Number(f.tolerancia_cuotas),
        tolerancia_debito: Number(f.tolerancia_debito),
        dia_vencimiento: Number(f.dia_vencimiento),
        mes_cuota_anual: f.mes_cuota_anual,
        cobrar_mes_alta: f.cobrar_mes_alta,
        baja_con_deuda: f.baja_con_deuda,
      });
      if (r.ok) {
        toast.success("Configuración guardada");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Panel titulo="Configuración de la cobranza" icono={Settings2} delay={0.1}>
      <fieldset disabled={!puedeEditar || guardando} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Campo etiqueta="Tolerancia (cuotas vencidas)" ayuda="Hasta cuántas impagas sigue al día (transferencia y efectivo).">
          <input type="number" min={0} max={36} value={f.tolerancia_cuotas} onChange={(e) => setF({ ...f, tolerancia_cuotas: e.target.value })} className={claseControl} />
        </Campo>
        <Campo etiqueta="Tolerancia con débito Visa" ayuda="Para quienes pagan por débito (los rechazos tardan en volver).">
          <input type="number" min={0} max={36} value={f.tolerancia_debito} onChange={(e) => setF({ ...f, tolerancia_debito: e.target.value })} className={claseControl} />
        </Campo>
        <Campo etiqueta="Día de vencimiento" ayuda="Del mes de la cuota (1 a 28).">
          <input type="number" min={1} max={28} value={f.dia_vencimiento} onChange={(e) => setF({ ...f, dia_vencimiento: e.target.value })} className={claseControl} />
        </Campo>
        <Campo etiqueta="Mes de la cuota anual" ayuda="En ese lote se emiten las cuotas anuales.">
          <select value={f.mes_cuota_anual} onChange={(e) => setF({ ...f, mes_cuota_anual: Number(e.target.value) })} className={claseControl}>
            {NOMBRE_MES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Mes del alta" ayuda="Si el mes en que alguien se hace socio se cobra.">
          <select value={f.cobrar_mes_alta ? "si" : "no"} onChange={(e) => setF({ ...f, cobrar_mes_alta: e.target.value === "si" })} className={claseControl}>
            <option value="si">Se cobra entero</option>
            <option value="no">Queda bonificado</option>
          </select>
        </Campo>
        <Campo etiqueta="Deuda al dar de baja" ayuda="Lo que se propone por defecto en la baja.">
          <select value={f.baja_con_deuda} onChange={(e) => setF({ ...f, baja_con_deuda: e.target.value as "mantener" | "anular" })} className={claseControl}>
            <option value="mantener">Se mantiene</option>
            <option value="anular">Se anula con nota de crédito</option>
          </select>
        </Campo>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-linea px-4 py-3">
        <Explicacion>
          {puedeEditar ? "Cambia cómo se calcula la morosidad y cómo se emiten los próximos lotes; no toca lo ya emitido." : "Solo tesorería puede cambiar la configuración."}
        </Explicacion>
        {puedeEditar && (
          <AnimatePresence>
            {cambiado && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                <Boton onClick={guardar} pendiente={guardando}>
                  Guardar cambios
                </Boton>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </Panel>
  );
}
