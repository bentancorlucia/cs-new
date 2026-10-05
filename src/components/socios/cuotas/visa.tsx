"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Ban, ChevronDown, ClipboardCheck, CreditCard, FileSpreadsheet, History, ListChecks, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";
import { nombrePeriodo, r2, type CuentaDisponible, type FilaPlanilla, type LiquidacionVisaLista } from "@/lib/socios/cuotas";
import { anularLiquidacionVisa, leerPlanillaDebito } from "@/app/(dashboard)/cuotas/actions";
import { exportarExcel } from "@/components/contabilidad/reportes/acciones-reporte";
import { CargaVisa } from "./visa-carga";
import {
  BadgeEstado,
  Boton,
  Campo,
  DialogoAnular,
  EncabezadoPagina,
  Explicacion,
  Filtros,
  ImporteAnimado,
  Kpi,
  LinkAsiento,
  NumeroAnimado,
  Panel,
  Pastilla,
  Vacio,
  claseControl,
} from "./ui";

type Vista = "cargar" | "planilla" | "historial";

export function VisaVista({
  liquidaciones,
  cuentas,
  cuentaDefecto,
  hoy,
  puedeAplicar,
  cambiosPendientes = null,
}: {
  liquidaciones: LiquidacionVisaLista[];
  cuentas: CuentaDisponible[];
  cuentaDefecto: string | null;
  hoy: string;
  puedeAplicar: boolean;
  /** Cambios de las disciplinas pendientes de cargar en el portal (null si no se pudo leer). */
  cambiosPendientes?: number | null;
}) {
  const [vista, setVista] = useState<Vista>(puedeAplicar ? "cargar" : "historial");
  const opciones: { valor: Vista; etiqueta: string; cantidad?: number }[] = [
    ...(puedeAplicar ? [{ valor: "cargar" as const, etiqueta: "Cargar liquidación" }] : []),
    { valor: "planilla", etiqueta: "Planilla del débito" },
    { valor: "historial", etiqueta: "Historial", cantidad: liquidaciones.length },
  ];
  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Cuotas y cobranza"
        titulo="Débito Visa"
        descripcion="La planilla para cargar en el portal y la liquidación que devuelve Visa: cobrados, rechazos, comisión e IVA."
      />
      {!!cambiosPendientes && <AvisoCambios cantidad={cambiosPendientes} />}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-linea bg-white p-1.5">
        <Filtros<Vista> id="visa" valor={vista} onChange={setVista} opciones={opciones} />
      </motion.div>
      <AnimatePresence mode="wait">
        <motion.div key={vista} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
          {vista === "cargar" && puedeAplicar && (
            <CargaVisa cuentas={cuentas} cuentaDefecto={cuentaDefecto} hoy={hoy} alAplicar={() => setVista("historial")} />
          )}
          {vista === "planilla" && <Planilla hoy={hoy} />}
          {vista === "historial" && <Historial liquidaciones={liquidaciones} puedeAnular={puedeAplicar} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------
// Planilla del débito
// ------------------------------------------------------------

/** Aviso con link a los cambios de las disciplinas que faltan cargar en el portal. */
function AvisoCambios({ cantidad }: { cantidad: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={easeSmooth} whileHover={{ y: -1 }}>
      <Link
        href="/cuotas/cambios"
        className="group flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition-colors hover:bg-amber-100/70"
      >
        <ClipboardCheck className="size-5 shrink-0" />
        <span className="min-w-0 flex-1">
          <strong className="font-heading">
            {cantidad} cambio{cantidad === 1 ? "" : "s"} pendiente{cantidad === 1 ? "" : "s"} de cargar en el portal
          </strong>
          <span className="block text-xs opacity-80">Altas, bajas, tarjetas nuevas y cambios de cuota que hicieron las disciplinas o el club.</span>
        </span>
        <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </motion.div>
  );
}

function Planilla({ hoy }: { hoy: string }) {
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [filas, setFilas] = useState<FilaPlanilla[] | null>(null);
  const [mostrado, setMostrado] = useState<{ periodo: string; conDeuda: boolean } | null>(null);
  const [conDeuda, setConDeuda] = useState(false);
  const [conCero, setConCero] = useState(false);
  const [texto, setTexto] = useState("");
  const [cargando, start] = useTransition();

  function cargar(deuda = conDeuda) {
    start(async () => {
      const r = await leerPlanillaDebito(`${mes}-01`, deuda);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setFilas(r.data);
      setMostrado({ periodo: `${mes}-01`, conDeuda: deuda });
    });
  }

  const visibles = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return (filas ?? [])
      .filter((f) => conCero || f.importe > 0)
      .filter((f) =>
        !q || `${f.persona} ${f.cedula} ${f.titular_nombre ?? ""} ${f.ultimos4 ?? ""} ${f.emisor ?? ""} ${f.disciplinas.join(" ")}`.toLowerCase().includes(q)
      );
  }, [filas, conCero, texto]);
  const total = r2(visibles.reduce((s, f) => s + f.importe, 0));
  const vencidas = visibles.filter((f) => f.tarjetaVencida).length;
  const deudaFuera = r2((filas ?? []).reduce((s, f) => s + (mostrado?.conDeuda ? 0 : f.deudaAnterior), 0));

  async function excel() {
    if (!mostrado) return;
    await exportarExcel(`debito-visa_${mostrado.periodo.slice(0, 7)}`, [
      {
        nombre: "Débito",
        titulo: `Débito Visa — ${nombrePeriodo(mostrado.periodo)}`,
        subtitulo: `${visibles.length} adhesiones · total ${formatImporte(total, "UYU")}${mostrado.conDeuda ? " · con deuda anterior" : " · cuotas del mes"}`,
        columnas: [
          { titulo: "Nº socio", tipo: "entero", ancho: 10 },
          { titulo: "Socio", ancho: 32 },
          { titulo: "Cédula", ancho: 14 },
          { titulo: "Disciplina", ancho: 22 },
          { titulo: "Titular de la tarjeta", ancho: 28 },
          { titulo: "Documento del titular", ancho: 16 },
          { titulo: "Emisor", ancho: 12 },
          { titulo: "Tarjeta (últimos 4)", ancho: 12 },
          { titulo: "Vencimiento", ancho: 12 },
          { titulo: "Cuotas", tipo: "entero", ancho: 8 },
          { titulo: "Importe", tipo: "importe" },
        ],
        filas: visibles.map((f) => [
          f.numero_socio,
          f.persona,
          f.cedula,
          f.disciplinas.join(", ") || null,
          f.titular_nombre ?? f.persona,
          f.titular_documento ?? f.cedula,
          f.emisor,
          f.ultimos4,
          f.vencimiento ? f.vencimiento.slice(0, 7) : null,
          f.cuotas,
          f.importe,
        ]),
      },
    ]);
  }

  return (
    <Panel titulo="Planilla del débito" icono={ListChecks}>
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Campo etiqueta="Mes" className="w-44">
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={claseControl} />
          </Campo>
          <Boton onClick={() => cargar()} pendiente={cargando}>
            Armar planilla
          </Boton>
          {filas && (
            <Boton variante="secundario" onClick={excel} disabled={visibles.length === 0}>
              <FileSpreadsheet className="size-4" />
              Exportar a Excel
            </Boton>
          )}
        </div>
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={conDeuda}
            onChange={(e) => {
              setConDeuda(e.target.checked);
              if (filas) cargar(e.target.checked);
            }}
            className="size-4 accent-bordo-800"
          />
          Incluir deuda anterior
        </label>
        <Explicacion>
          Socios con débito Visa vigente a fin de mes y lo que se le carga a cada tarjeta: como hace tesorería, la cuota de ese mes. Con &quot;Incluir
          deuda anterior&quot; se suma también lo que quedó sin pagar de meses anteriores.
        </Explicacion>
        {filas && mostrado && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={easeSmooth} className="space-y-3">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Kpi
                etiqueta={`A debitar · ${nombrePeriodo(mostrado.periodo)}`}
                detalle={mostrado.conDeuda ? "Con deuda anterior" : deudaFuera > 0 ? `Sin ${formatImporte(deudaFuera)} de deuda anterior` : "Cuotas del mes"}
              >
                <ImporteAnimado valor={total} moneda="UYU" />
              </Kpi>
              <Kpi etiqueta="Adhesiones">
                <NumeroAnimado valor={visibles.length} />
              </Kpi>
              <Kpi etiqueta="Tarjetas vencidas" tono={vencidas ? "alerta" : "neutro"} detalle="Pedí la renovación antes de cargar">
                <NumeroAnimado valor={vencidas} />
              </Kpi>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative sm:w-72">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar…" className={cn(claseControl, "h-9 pl-9")} />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={conCero} onChange={(e) => setConCero(e.target.checked)} className="size-4 accent-bordo-800" />
                Incluir quienes no deben nada ({(filas ?? []).filter((f) => f.importe <= 0).length})
              </label>
            </div>
            {visibles.length === 0 ? (
              <Vacio icono={CreditCard} titulo="Nadie para debitar" texto="No hay adhesiones al débito con saldo en ese mes." />
            ) : (
              <ul className="divide-y divide-linea rounded-2xl border border-linea">
                {visibles.map((f, i) => (
                  <motion.li
                    key={f.persona_id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i, 20) * 0.015 }}
                    className={cn(
                      "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3 py-2 text-sm transition-colors hover:bg-superficie/50 sm:grid-cols-[minmax(0,1fr)_14rem_8rem]",
                      f.tarjetaVencida && "bg-rose-50/40"
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{f.persona}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        CI {f.cedula}
                        {f.numero_socio ? ` · Nº ${f.numero_socio}` : ""} · {f.cuotas} cuota{f.cuotas === 1 ? "" : "s"}
                      </div>
                      {f.disciplinas.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {f.disciplinas.map((d) => (
                            <Pastilla key={d} tono="info">
                              {d}
                            </Pastilla>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="col-start-1 row-start-2 text-xs text-muted-foreground sm:col-start-auto sm:row-start-auto">
                      {f.titular_nombre && <div className="truncate">Titular: {f.titular_nombre}</div>}
                      <span className="tabular-nums">•••• {f.ultimos4 ?? "----"}</span>
                      {f.emisor && <span className="ml-2 uppercase">{f.emisor}</span>}
                      {f.vencimiento && (
                        <span className={cn("ml-2", f.tarjetaVencida && "font-medium text-rose-700")}>
                          vence {f.vencimiento.slice(5, 7)}/{f.vencimiento.slice(0, 4)}
                          {f.tarjetaVencida && " (vencida)"}
                        </span>
                      )}
                    </div>
                    <div className="row-span-2 text-right sm:row-span-1">
                      <div className="font-heading tabular-nums">{formatImporte(f.importe)}</div>
                      {!mostrado.conDeuda && f.deudaAnterior > 0 && (
                        <div className="text-[11px] tabular-nums text-amber-700">+{formatImporte(f.deudaAnterior)} anterior</div>
                      )}
                    </div>
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------
// Historial
// ------------------------------------------------------------

function Historial({ liquidaciones, puedeAnular }: { liquidaciones: LiquidacionVisaLista[]; puedeAnular: boolean }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  const [anular, setAnular] = useState<LiquidacionVisaLista | null>(null);
  if (liquidaciones.length === 0) {
    return <Vacio icono={History} titulo="Todavía no se cargó ninguna liquidación" texto="Cuando Visa acredite el débito, cargá su liquidación desde la primera pestaña." />;
  }
  return (
    <>
      <ul className="space-y-2">
        {liquidaciones.map((l, i) => {
          const open = abierta === l.id;
          return (
            <motion.li
              key={l.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...easeSmooth, delay: Math.min(i, 10) * 0.03 }}
              className={cn("rounded-2xl border border-linea bg-white", l.estado === "anulada" && "opacity-60")}
            >
              <button
                type="button"
                onClick={() => setAbierta(open ? null : l.id)}
                aria-expanded={open}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left sm:grid-cols-[11rem_minmax(0,1fr)_9rem_auto]"
              >
                <div>
                  <div className="font-heading text-base text-bordo-800">{nombrePeriodo(l.periodo)}</div>
                  <div className="text-xs text-muted-foreground">Acreditado {formatFecha(l.fecha)}</div>
                </div>
                <div className="col-span-2 row-start-2 text-xs text-muted-foreground sm:col-span-1 sm:row-start-auto">
                  {l.cobros} cobrados · {l.rechazos.length} rechazos · comisión {formatImporte(l.comision)} · IVA {formatImporte(l.iva)}
                </div>
                <div className="text-right">
                  <div className="font-heading tabular-nums">{formatImporte(l.neto, "UYU")}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">bruto {formatImporte(l.bruto)}</div>
                </div>
                <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1">
                  <BadgeEstado estado={l.estado} />
                  <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
                </div>
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="grid gap-4 border-t border-linea px-4 py-3 md:grid-cols-2">
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-editorial text-muted-foreground">Gastos por centro</div>
                        {l.comisiones.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sin gastos.</p>
                        ) : (
                          <ul className="space-y-1.5 text-sm">
                            {l.comisiones.map((k) => (
                              <li key={k.disciplina} className="flex items-start justify-between gap-3">
                                <span className="min-w-0">
                                  <span className="block truncate">{k.disciplina}</span>
                                  <span className="block text-[11px] text-muted-foreground tabular-nums">
                                    {k.cobrado > 0 ? `sobre ${formatImporte(k.cobrado)} · ` : ""}comisión {formatImporte(k.comision)} + IVA{" "}
                                    {formatImporte(k.iva)}
                                  </span>
                                </span>
                                <span className="tabular-nums">{formatImporte(k.importe)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-editorial text-muted-foreground">Rechazos</div>
                        {l.rechazos.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Ninguno.</p>
                        ) : (
                          <ul className="space-y-1 text-sm">
                            {l.rechazos.map((r, j) => (
                              <li key={j} className="flex justify-between gap-3">
                                <span className="min-w-0 truncate">
                                  {r.persona ?? `Doc. ${r.documento}`}
                                  {r.motivo && <span className="ml-1 text-xs text-muted-foreground">({r.motivo})</span>}
                                </span>
                                <span className="tabular-nums">{formatImporte(r.importe)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                        <LinkAsiento id={l.asiento_id} />
                        {l.archivo && <Pastilla>{l.archivo}</Pastilla>}
                        {l.motivo_anulacion && <span className="text-xs text-rose-700">Anulada: {l.motivo_anulacion}</span>}
                        <div className="flex-1" />
                        {puedeAnular && l.estado === "vigente" && (
                          <Boton variante="peligro" className="h-8 px-3 text-xs" onClick={() => setAnular(l)}>
                            <Ban className="size-3.5" />
                            Anular liquidación
                          </Boton>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.li>
          );
        })}
      </ul>
      <DialogoAnular
        open={!!anular}
        onOpenChange={(o) => !o && setAnular(null)}
        titulo={`Anular el débito de ${nombrePeriodo(anular?.periodo)}`}
        descripcion="Se anulan todos sus cobros y se revierte el asiento; las cuotas vuelven a quedar con saldo. No se puede si ya se liquidó a las disciplinas el período de la acreditación."
        anular={(motivo) => anularLiquidacionVisa({ id: anular!.id, motivo })}
      />
    </>
  );
}
