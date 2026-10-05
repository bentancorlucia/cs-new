"use client";

import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, Banknote, ChevronDown, Eye, Loader2, Mail, Receipt, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";
import { nombrePeriodo, r2, type CuentaDisponible, type LiquidacionDisciplinaLista, type PagoLiquidacion } from "@/lib/socios/cuotas";
import type { PlanVigente } from "@/lib/socios/disciplinas";
import type { AvisoLiquidaciones, ResumenLiquidacion } from "@/lib/socios/liquidacion-resumen";
import { LiquidacionDetalle } from "@/components/socios/liquidacion-detalle";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  anularLiquidacionDisciplina,
  anularPagoLiquidacion,
  leerResumenLiquidacion,
  pagarLiquidacion,
  reenviarResumenLiquidacion,
} from "@/app/(dashboard)/cuotas/actions";
import {
  Aviso,
  BadgeEstado,
  Barra,
  Boton,
  Campo,
  DialogoAccion,
  DialogoAnular,
  Explicacion,
  ImporteAnimado,
  LinkAsiento,
  Pastilla,
  Vacio,
  claseControl,
} from "./ui";

/** "1.500,50" o "1500.50" → 1500.5 (con coma, el punto separa miles). */
function aNumero(texto: string): number {
  const t = texto.trim();
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : 0;
}
const aTexto = (n: number) => (n > 0 ? n.toFixed(2).replace(".", ",") : "");

/** Toast con el resultado del mail a los representantes. */
export function avisarResultadoMail(aviso: AvisoLiquidaciones | null, errorAviso?: string | null) {
  if (errorAviso) {
    toast.warning("No se pudo mandar el resumen", { description: `${errorAviso}. Podés reenviarlo desde el detalle de la liquidación.` });
    return;
  }
  if (!aviso) return;
  if (aviso.enviados > 0) {
    toast.success(`Resumen enviado a ${aviso.enviados} representante${aviso.enviados === 1 ? "" : "s"}`);
  }
  if (aviso.sinDestinatarios.length > 0) {
    const lista = aviso.sinDestinatarios.join(", ");
    toast.warning(
      `${aviso.sinDestinatarios.length === 1 ? "Una disciplina no tiene" : `${aviso.sinDestinatarios.length} disciplinas no tienen`} a quién mandarle el resumen`,
      { description: `${lista}: cargá sus representantes en Disciplinas → Representantes y reenvialo.`, duration: 10000 }
    );
  }
}

/** Qué resultó la liquidación: a pagar (ámbar), a depositar (rosa) o sin saldo. */
export function ResultadoLiquidacion({
  aPagar,
  aDepositar,
  className,
}: {
  aPagar: number;
  aDepositar: number;
  className?: string;
}) {
  if (aPagar > 0)
    return (
      <span className={cn("inline-flex flex-col items-end leading-tight", className)}>
        <span className="text-[10px] uppercase tracking-editorial text-amber-700/80">A pagar</span>
        <span className="font-heading tabular-nums text-amber-700">{formatImporte(aPagar, "UYU")}</span>
      </span>
    );
  if (aDepositar > 0)
    return (
      <span className={cn("inline-flex flex-col items-end leading-tight", className)}>
        <span className="text-[10px] uppercase tracking-editorial text-rose-700/80">A depositar</span>
        <span className="font-heading tabular-nums text-rose-700">{formatImporte(aDepositar, "UYU")}</span>
      </span>
    );
  return <span className={cn("text-xs text-muted-foreground", className)}>Sin saldo</span>;
}

/**
 * Liquidaciones mensuales a disciplinas con su saldo pendiente, sus pagos y
 * las acciones: ver el detalle (con el resumen como la planilla), pagar
 * (transferencia y/o compensación), anular un pago y anular la liquidación.
 * Se usa en Cuotas → Disciplinas y en la cuenta corriente de cada disciplina.
 */
export function ListaLiquidaciones({
  liquidaciones,
  cuentas,
  cuentaDefecto,
  planes,
  deudas,
  hoy,
  puedeOperar,
  conDisciplina = true,
}: {
  liquidaciones: LiquidacionDisciplinaLista[];
  cuentas: CuentaDisponible[];
  cuentaDefecto: string | null;
  /** Planes de pago vigentes con saldo (de cualquier disciplina; se filtran por la de la liquidación). */
  planes: PlanVigente[];
  /** Lo que cada disciplina le debe al club (tope de la compensación). */
  deudas: Record<number, number>;
  hoy: string;
  puedeOperar: boolean;
  conDisciplina?: boolean;
}) {
  const [abierta, setAbierta] = useState<number | null>(null);
  const [ver, setVer] = useState<number | null>(null);
  const [pagar, setPagar] = useState<LiquidacionDisciplinaLista | null>(null);
  const [anular, setAnular] = useState<LiquidacionDisciplinaLista | null>(null);
  const [anularPago, setAnularPago] = useState<{ pago: PagoLiquidacion; liq: LiquidacionDisciplinaLista } | null>(null);
  const nombreCuenta = new Map(cuentas.map((c) => [c.id, `${c.codigo} · ${c.nombre}`]));
  const liqVer = ver != null ? liquidaciones.find((l) => l.id === ver) ?? null : null;

  if (liquidaciones.length === 0) {
    return (
      <div className="p-4">
        <Vacio icono={Receipt} titulo={conDisciplina ? "No hay liquidaciones con ese filtro" : "Todavía no se le liquidaron cuotas a la disciplina"} />
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-linea">
        <AnimatePresence initial={false}>
          {liquidaciones.map((l, i) => {
            const pagado = r2(l.transferido + l.compensado);
            const conPagos = l.pagos.some((p) => p.estado === "vigente");
            const open = abierta === l.id;
            const gastos = r2(l.gastos_comision + l.gastos_iva);
            const social = r2(l.visa_social + l.social_a_cargo);
            return (
              <motion.li
                key={l.id}
                layout="position"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ ...easeSmooth, delay: Math.min(i, 10) * 0.03 }}
                className={cn(l.estado === "anulada" && "opacity-60")}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_10rem]">
                  <button type="button" onClick={() => setVer(l.id)} className="group min-w-0 text-left">
                    {conDisciplina && <div className="truncate font-medium transition-colors group-hover:text-bordo-800">{l.disciplina}</div>}
                    <div
                      className={cn(
                        "tabular-nums transition-colors group-hover:text-bordo-800",
                        conDisciplina ? "text-xs text-muted-foreground" : "text-sm font-medium"
                      )}
                    >
                      {nombrePeriodo(l.periodo)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">Liquidada el {formatFecha(l.fecha)}</div>
                  </button>
                  <div className="col-span-2 row-start-2 min-w-0 space-y-1 text-xs text-muted-foreground sm:col-span-1 sm:row-start-auto">
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>Débito {formatImporte(l.visa_cobrado)}</span>
                      <span>Social −{formatImporte(social)}</span>
                      <span>Gastos −{formatImporte(gastos)}</span>
                      {l.otros_cobrado > 0 && <span>Otros medios +{formatImporte(l.otros_cobrado)}</span>}
                    </div>
                    {l.estado === "vigente" && l.importe > 0 && (
                      <>
                        <Barra valor={pagado} total={l.importe} tono={l.saldo <= 0 ? "emerald" : "dorado"} className="h-1.5" />
                        <div>
                          Pagado {formatImporte(pagado)}
                          {l.transferido > 0 && ` (transferido ${formatImporte(l.transferido)}`}
                          {l.compensado > 0 && `${l.transferido > 0 ? ", " : " ("}compensado ${formatImporte(l.compensado)}`}
                          {(l.transferido > 0 || l.compensado > 0) && ")"}
                        </div>
                      </>
                    )}
                    {l.estado === "vigente" && l.a_depositar > 0 && (
                      <div className="text-rose-700">
                        La disciplina tiene que depositar {formatImporte(l.a_depositar, "UYU")}: queda en su cuenta corriente.
                      </div>
                    )}
                    {l.notas && <div className="truncate">{l.notas}</div>}
                    {l.motivo_anulacion && <div className="text-rose-700">Anulada: {l.motivo_anulacion}</div>}
                  </div>
                  <div className="text-right">
                    <ResultadoLiquidacion aPagar={l.importe} aDepositar={l.a_depositar} />
                    {l.estado === "vigente" &&
                      l.importe > 0 &&
                      (l.saldo > 0 ? (
                        <div className="text-[11px] tabular-nums text-amber-700">pendiente {formatImporte(l.saldo)}</div>
                      ) : (
                        <div className="text-[11px] text-emerald-700">pagada</div>
                      ))}
                  </div>
                  <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 sm:col-span-3">
                    <EstadoLiquidacion l={l} />
                    <LinkAsiento id={l.asiento_id} />
                    {l.pagos.length > 0 && (
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setAbierta(open ? null : l.id)}
                        aria-expanded={open}
                        className="inline-flex items-center gap-1 rounded-full border border-linea px-2.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-superficie"
                      >
                        {l.pagos.length} pago{l.pagos.length === 1 ? "" : "s"}
                        <motion.span animate={{ rotate: open ? 180 : 0 }}>
                          <ChevronDown className="size-3" />
                        </motion.span>
                      </motion.button>
                    )}
                    <Boton variante="secundario" className="h-8 px-3 text-xs" onClick={() => setVer(l.id)}>
                      <Eye className="size-3.5" />
                      Detalle
                    </Boton>
                    {puedeOperar && l.estado === "vigente" && l.importe > 0 && l.saldo > 0 && (
                      <Boton className="h-8 px-3 text-xs" onClick={() => setPagar(l)}>
                        <Banknote className="size-3.5" />
                        Pagar
                      </Boton>
                    )}
                    {puedeOperar && l.estado === "vigente" && (
                      <Boton
                        variante="peligro"
                        className="h-8 px-3 text-xs"
                        onClick={() => setAnular(l)}
                        disabled={conPagos}
                        title={conPagos ? "Anulá primero sus pagos" : undefined}
                      >
                        <Ban className="size-3.5" />
                        Anular
                      </Boton>
                    )}
                  </div>
                </div>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.ul
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden border-t border-dashed border-linea bg-superficie/40"
                    >
                      {l.pagos.map((p) => (
                        <li
                          key={p.id}
                          className={cn(
                            "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2 text-xs sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:pl-8",
                            p.estado === "anulado" && "opacity-60"
                          )}
                        >
                          <span className="tabular-nums">{formatFecha(p.fecha)}</span>
                          <div className="col-span-2 row-start-2 min-w-0 text-muted-foreground sm:col-span-1 sm:row-start-auto">
                            <div className={cn(p.estado === "anulado" && "line-through")}>
                              {p.transferido > 0 && (
                                <span>
                                  Transferido {formatImporte(p.transferido)}
                                  {p.cuenta_id ? ` desde ${nombreCuenta.get(p.cuenta_id) ?? "caja o banco"}` : ""}
                                </span>
                              )}
                              {p.transferido > 0 && p.compensado > 0 && " · "}
                              {p.compensado > 0 && <span>Compensado {formatImporte(p.compensado)}</span>}
                            </div>
                            {p.referencia && <div className="truncate">Ref. {p.referencia}</div>}
                            {p.notas && <div className="truncate">{p.notas}</div>}
                            {p.motivo_anulacion && <div className="text-rose-700">Anulado: {p.motivo_anulacion}</div>}
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <span className="font-medium tabular-nums">{formatImporte(p.transferido + p.compensado)}</span>
                            <BadgeEstado estado={p.estado} />
                            <LinkAsiento id={p.asiento_id} />
                            {puedeOperar && p.estado === "vigente" && (
                              <Boton variante="peligro" className="h-7 px-2.5 text-[11px]" onClick={() => setAnularPago({ pago: p, liq: l })}>
                                <Ban className="size-3" />
                                Anular
                              </Boton>
                            )}
                          </div>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <HojaLiquidacion
        liquidacion={liqVer}
        onClose={() => setVer(null)}
        cuentas={cuentas}
        cuentaDefecto={cuentaDefecto}
        planes={planes}
        deudas={deudas}
        hoy={hoy}
        puedeOperar={puedeOperar}
      />

      {pagar && (
        <DialogoPagoLiquidacion
          key={pagar.id}
          liquidacion={pagar}
          cuentas={cuentas}
          cuentaDefecto={cuentaDefecto}
          planes={planes.filter((p) => p.disciplina_id === pagar.disciplina_id)}
          deuda={deudas[pagar.disciplina_id] ?? 0}
          hoy={hoy}
          onClose={() => setPagar(null)}
          alPagar={() => setAbierta(pagar.id)}
        />
      )}

      <DialogoAnularLiquidacion liquidacion={anular} onClose={() => setAnular(null)} />
      <DialogoAnular
        open={!!anularPago}
        onOpenChange={(o) => !o && setAnularPago(null)}
        titulo={`Anular el pago del ${anularPago ? formatFecha(anularPago.pago.fecha) : ""}`}
        descripcion={
          <span>
            Se hace el contra-asiento: la liquidación vuelve a quedar pendiente por{" "}
            {anularPago ? formatImporte(anularPago.pago.transferido + anularPago.pago.compensado, "UYU") : ""}
            {anularPago && anularPago.pago.compensado > 0
              ? ", lo compensado vuelve a ser deuda de la disciplina y se deshace lo imputado a su plan de pago"
              : ""}
            .
          </span>
        }
        anular={(motivo) => anularPagoLiquidacion({ id: anularPago!.pago.id, motivo })}
      />
    </>
  );
}

function EstadoLiquidacion({ l }: { l: LiquidacionDisciplinaLista }) {
  const pagado = r2(l.transferido + l.compensado);
  if (l.estado === "anulada") return <BadgeEstado estado="anulada" />;
  if (l.a_depositar > 0) return <Pastilla tono="alerta">A depositar</Pastilla>;
  if (l.importe <= 0) return <Pastilla>Sin saldo</Pastilla>;
  if (l.saldo <= 0) return <Pastilla tono="bueno">Pagada</Pastilla>;
  if (pagado > 0) return <Pastilla tono="info">Pago parcial</Pastilla>;
  return <Pastilla>A pagar</Pastilla>;
}

function DialogoAnularLiquidacion({ liquidacion, onClose }: { liquidacion: LiquidacionDisciplinaLista | null; onClose: () => void }) {
  return (
    <DialogoAnular
      open={!!liquidacion}
      onOpenChange={(o) => !o && onClose()}
      titulo={`Anular la liquidación de ${liquidacion ? nombrePeriodo(liquidacion.periodo).toLowerCase() : ""} a ${liquidacion?.disciplina ?? ""}`}
      descripcion="Se revierte el asiento: lo liquidado deja de deberse (o de tener que depositarse) y el mes queda libre para liquidarse de nuevo."
      anular={(motivo) => anularLiquidacionDisciplina({ id: liquidacion!.id, motivo })}
    />
  );
}

/**
 * Detalle de una liquidación (hoja lateral): el resumen como la planilla de
 * tesorería y las acciones (pagar, reenviar el resumen, anular).
 */
export function HojaLiquidacion({
  liquidacion: l,
  onClose,
  cuentas,
  cuentaDefecto,
  planes,
  deudas,
  hoy,
  puedeOperar,
}: {
  liquidacion: LiquidacionDisciplinaLista | null;
  onClose: () => void;
  cuentas: CuentaDisponible[];
  cuentaDefecto: string | null;
  planes: PlanVigente[];
  deudas: Record<number, number>;
  hoy: string;
  puedeOperar: boolean;
}) {
  const [leido, setLeido] = useState<{ clave: string; id: number; datos: ResumenLiquidacion | null; error: string | null } | null>(null);
  const [pagar, setPagar] = useState(false);
  const [anular, setAnular] = useState(false);
  const [enviando, startEnvio] = useTransition();
  // Se vuelve a leer cuando cambia la liquidación (pago, anulación).
  const clave = l ? `${l.id}|${l.estado}|${l.saldo}|${l.pagos.length}` : "";
  const id = l?.id ?? null;

  useEffect(() => {
    if (!clave || id == null) return;
    let vigente = true;
    leerResumenLiquidacion(id).then((r) => {
      if (!vigente) return;
      setLeido((prev) => ({
        clave,
        id,
        // Si falla una relectura, queda lo que ya se veía.
        datos: r.ok ? r.data : prev?.id === id ? prev.datos : null,
        error: r.ok ? null : r.error,
      }));
    });
    return () => {
      vigente = false;
    };
  }, [clave, id]);

  const datos = leido && l && leido.id === l.id ? leido.datos : null;
  const error = leido && leido.clave === clave ? leido.error : null;
  const cargando = !!l && (!leido || leido.clave !== clave);
  const conPagos = l?.pagos.some((p) => p.estado === "vigente") ?? false;

  function reenviar() {
    if (!l) return;
    startEnvio(async () => {
      const r = await reenviarResumenLiquidacion(l.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.data.enviados === 0 && r.data.sinDestinatarios.length === 0) toast.info("No había nada para mandar");
      avisarResultadoMail(r.data);
    });
  }

  return (
    <>
      <Sheet open={!!l} onOpenChange={(o) => !o && onClose()}>
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-y-auto bg-superficie p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
        >
          {l && (
            <>
              <SheetHeader className="sticky top-0 z-10 border-b border-linea bg-white/95 px-4 py-4 pr-12 backdrop-blur">
                <div className="flex items-center gap-3">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 22 }}
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bordo-50 text-bordo-800"
                  >
                    <ReceiptText className="size-5" />
                  </motion.div>
                  <div className="min-w-0">
                    <SheetTitle className="truncate font-heading text-base text-bordo-950">{l.disciplina}</SheetTitle>
                    <SheetDescription className="text-xs">
                      {nombrePeriodo(l.periodo)} · liquidada el {formatFecha(l.fecha)}
                    </SheetDescription>
                  </div>
                  <div className="ml-auto shrink-0">
                    <EstadoLiquidacion l={l} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {puedeOperar && l.estado === "vigente" && l.importe > 0 && l.saldo > 0 && (
                    <Boton className="h-8 px-3 text-xs" onClick={() => setPagar(true)}>
                      <Banknote className="size-3.5" />
                      Pagar
                    </Boton>
                  )}
                  {puedeOperar && l.estado === "vigente" && (
                    <Boton variante="secundario" className="h-8 px-3 text-xs" onClick={reenviar} pendiente={enviando}>
                      {!enviando && <Mail className="size-3.5" />}
                      Reenviar resumen
                    </Boton>
                  )}
                  <LinkAsiento id={l.asiento_id} />
                  <div className="flex-1" />
                  {puedeOperar && l.estado === "vigente" && (
                    <Boton
                      variante="peligro"
                      className="h-8 px-3 text-xs"
                      onClick={() => setAnular(true)}
                      disabled={conPagos}
                      title={conPagos ? "Anulá primero sus pagos" : undefined}
                    >
                      <Ban className="size-3.5" />
                      Anular
                    </Boton>
                  )}
                </div>
              </SheetHeader>

              <div className="space-y-4 p-4">
                {l.estado === "anulada" && l.motivo_anulacion && (
                  <Aviso titulo="Liquidación anulada">{l.motivo_anulacion}</Aviso>
                )}
                {l.estado === "vigente" && l.a_depositar > 0 && (
                  <Aviso titulo={`La disciplina tiene que depositar ${formatImporte(l.a_depositar, "UYU")}`}>
                    Queda en su cuenta corriente como deuda con el club: se cancela cuando registra el pago (o se compensa con una liquidación a favor).
                  </Aviso>
                )}
                <AnimatePresence mode="wait">
                  {error && !datos ? (
                    <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Aviso titulo="No se pudo leer el detalle">{error}</Aviso>
                    </motion.div>
                  ) : datos ? (
                    <motion.div
                      key={`d-${l.id}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: cargando ? 0.6 : 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={easeSmooth}
                    >
                      <LiquidacionDetalle resumen={datos} />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="cargando"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-3"
                      aria-busy
                    >
                      {[0, 1, 2].map((k) => (
                        <div key={k} className="h-28 animate-pulse rounded-2xl border border-linea bg-white" />
                      ))}
                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        Leyendo la liquidación…
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                {l.notas && <Explicacion>Notas: {l.notas}</Explicacion>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {pagar && l && (
        <DialogoPagoLiquidacion
          key={l.id}
          liquidacion={l}
          cuentas={cuentas}
          cuentaDefecto={cuentaDefecto}
          planes={planes.filter((p) => p.disciplina_id === l.disciplina_id)}
          deuda={deudas[l.disciplina_id] ?? 0}
          hoy={hoy}
          onClose={() => setPagar(false)}
        />
      )}
      <DialogoAnularLiquidacion liquidacion={anular ? l : null} onClose={() => setAnular(false)} />
    </>
  );
}

/** Pago de una liquidación: transferencia y/o compensación de lo que la disciplina le debe al club. */
export function DialogoPagoLiquidacion({
  liquidacion: l,
  cuentas,
  cuentaDefecto,
  planes,
  deuda,
  hoy,
  onClose,
  alPagar,
}: {
  liquidacion: LiquidacionDisciplinaLista;
  cuentas: CuentaDisponible[];
  cuentaDefecto: string | null;
  planes: PlanVigente[];
  deuda: number;
  hoy: string;
  onClose: () => void;
  alPagar?: () => void;
}) {
  const tope = r2(Math.max(0, deuda));
  const sugerido = r2(Math.min(l.saldo, tope));
  const [fecha, setFecha] = useState(hoy);
  const [compensar, setCompensar] = useState(aTexto(sugerido));
  const [transferir, setTransferir] = useState(aTexto(r2(l.saldo - sugerido)));
  const [cuentaId, setCuentaId] = useState(cuentaDefecto ?? cuentas[0]?.id ?? "");
  const [planId, setPlanId] = useState<number | "">(planes.length === 1 ? planes[0].id : "");
  const [referencia, setReferencia] = useState("");
  const [notas, setNotas] = useState("");

  const comp = r2(aNumero(compensar));
  const transf = r2(aNumero(transferir));
  const total = r2(comp + transf);
  const queda = r2(l.saldo - total);
  const plan = comp > 0 ? planes.find((p) => p.id === planId) : undefined;

  const errores: string[] = [];
  if (total <= 0) errores.push("Indicá cuánto se transfiere y/o cuánto se compensa");
  if (queda < 0) errores.push(`Se paga más que el saldo (${formatImporte(l.saldo)})`);
  if (comp > tope) errores.push(`No se puede compensar más que lo que la disciplina le debe al club (${formatImporte(tope)})`);
  if (transf > 0 && !cuentaId) errores.push("Elegí la cuenta desde la que se transfiere");
  if (!fecha || fecha > hoy || fecha < l.fecha) errores.push(`La fecha va del ${formatFecha(l.fecha)} a hoy`);

  return (
    <DialogoAccion
      open
      onOpenChange={(o) => !o && onClose()}
      icono={Banknote}
      titulo={`Pagar la liquidación a ${l.disciplina}`}
      descripcion={
        <span>
          {nombrePeriodo(l.periodo)}: a pagar {formatImporte(l.importe, "UYU")}, pendiente{" "}
          <strong className="text-foreground">{formatImporte(l.saldo, "UYU")}</strong>. Se puede pagar en partes.
        </span>
      }
      textoAccion="Registrar pago"
      mensaje="Pago registrado"
      ancho="sm:max-w-lg"
      deshabilitado={errores.length > 0}
      ejecutar={async () => {
        const r = await pagarLiquidacion({
          liquidacion_id: l.id,
          disciplina_id: l.disciplina_id,
          fecha,
          transferir: transf,
          cuenta_id: transf > 0 ? cuentaId || null : null,
          compensar: comp,
          plan_id: plan?.id ?? null,
          referencia: referencia.trim() || null,
          notas: notas.trim() || null,
        });
        if (r.ok) alPagar?.();
        return r.ok ? { ok: true } : r;
      }}
    >
      <Campo etiqueta="Fecha">
        <input type="date" value={fecha} min={l.fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={claseControl} />
      </Campo>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo
          etiqueta="Compensar de su deuda ($)"
          ayuda={tope > 0 ? `La disciplina le debe al club ${formatImporte(tope)}.` : "La disciplina no le debe nada al club."}
        >
          <input
            inputMode="decimal"
            value={compensar}
            onChange={(e) => setCompensar(e.target.value.replace(/[^\d.,]/g, ""))}
            placeholder="0,00"
            disabled={tope <= 0}
            aria-invalid={comp > tope}
            className={cn(claseControl, "text-right tabular-nums")}
          />
        </Campo>
        <Campo etiqueta="Transferir ($)" ayuda={queda > 0 ? undefined : "Lo que no se compensa."}>
          <input
            inputMode="decimal"
            value={transferir}
            onChange={(e) => setTransferir(e.target.value.replace(/[^\d.,]/g, ""))}
            placeholder="0,00"
            className={cn(claseControl, "text-right tabular-nums")}
          />
        </Campo>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[
          { etiqueta: "Todo transferido", c: 0, t: l.saldo },
          ...(sugerido > 0 ? [{ etiqueta: "Compensar lo posible", c: sugerido, t: r2(l.saldo - sugerido) }] : []),
        ].map((s) => (
          <motion.button
            key={s.etiqueta}
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setCompensar(aTexto(s.c));
              setTransferir(aTexto(s.t));
            }}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
              comp === s.c && transf === r2(s.t) ? "border-bordo-200 bg-bordo-50 text-bordo-800" : "border-linea text-muted-foreground hover:bg-superficie"
            )}
          >
            {s.etiqueta}
          </motion.button>
        ))}
      </div>
      <AnimatePresence initial={false}>
        {transf > 0 && (
          <motion.div key="cuenta" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Campo etiqueta="Se transfiere desde">
              <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className={claseControl}>
                {cuentas.length === 0 && <option value="">No hay cajas ni bancos en pesos</option>}
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} · {c.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          </motion.div>
        )}
        {comp > 0 && planes.length > 0 && (
          <motion.div key="plan" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Campo
              etiqueta="Imputar lo compensado a un plan de pago"
              ayuda={
                plan
                  ? `Se aplica a las cuotas más viejas (saldo ${formatImporte(plan.saldo)}${plan.saldo_vencido > 0 ? `, ${formatImporte(plan.saldo_vencido)} vencido` : ""}).`
                  : "Opcional: la deuda baja igual; elegí un plan para que cuente como pago de sus cuotas."
              }
            >
              <select value={planId} onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : "")} className={claseControl}>
                <option value="">No imputar a un plan</option>
                {planes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.descripcion} · saldo {formatImporte(p.saldo)}
                  </option>
                ))}
              </select>
            </Campo>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Referencia">
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Nº de transferencia" className={claseControl} maxLength={120} />
        </Campo>
        <Campo etiqueta="Notas">
          <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" className={claseControl} maxLength={500} />
        </Campo>
      </div>
      <div className="space-y-1.5 rounded-xl border border-linea bg-superficie/40 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Pendiente</span>
          <span className="tabular-nums">{formatImporte(l.saldo)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Este pago</span>
          <ImporteAnimado valor={-total} />
        </div>
        <div className="flex items-baseline justify-between border-t border-linea pt-1.5">
          <span className="font-medium">Queda pendiente</span>
          <ImporteAnimado valor={queda} moneda="UYU" className={cn("font-heading", queda < 0 ? "text-rose-700" : queda === 0 ? "text-emerald-700" : "text-amber-700")} />
        </div>
        <AnimatePresence mode="wait">
          {errores.length > 0 ? (
            <motion.p key={errores[0]} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[11px] text-rose-700">
              {errores[0]}
            </motion.p>
          ) : (
            <motion.div key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Explicacion>
                Debe Liquidaciones a pagar · Haber {transf > 0 ? "banco o caja" : ""}
                {transf > 0 && comp > 0 ? " y " : ""}
                {comp > 0 ? "Fondos en poder de la disciplina" : ""}.
              </Explicacion>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DialogoAccion>
  );
}
