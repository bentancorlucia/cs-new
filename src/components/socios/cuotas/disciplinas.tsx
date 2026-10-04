"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Calculator, History, Pencil, Send, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";
import {
  finMes,
  inicioMes,
  sumarDias,
  sumarMeses,
  type CuentaDisponible,
  type DisciplinaCobranza,
  type LiquidacionDisciplinaLista,
  type PreviaLiquidacionDisciplina,
} from "@/lib/socios/cuotas";
import type { PlanVigente } from "@/lib/socios/disciplinas";
import { guardarDisciplinaCobranza, liquidarDisciplina, previsualizarDisciplina } from "@/app/(dashboard)/cuotas/actions";
import {
  Aviso,
  Boton,
  Campo,
  DialogoAccion,
  EncabezadoPagina,
  Explicacion,
  ImporteAnimado,
  Panel,
  Pastilla,
  claseControl,
} from "./ui";
import { ListaLiquidaciones } from "./liquidaciones";

function rangoSugerido(d: DisciplinaCobranza | undefined, hoy: string) {
  const mesPasado = sumarMeses(inicioMes(hoy), -1);
  const desde = d?.ultimaLiquidacion ? sumarDias(d.ultimaLiquidacion, 1) : mesPasado;
  let hasta = finMes(mesPasado);
  if (hasta < desde) hasta = hoy;
  return { desde, hasta };
}

export function DisciplinasVista({
  disciplinas,
  liquidaciones,
  cuentas,
  cuentaDefecto,
  hoy,
  puedeOperar,
  planesPago = [],
  deudas = {},
}: {
  disciplinas: DisciplinaCobranza[];
  liquidaciones: LiquidacionDisciplinaLista[];
  cuentas: CuentaDisponible[];
  cuentaDefecto: string | null;
  hoy: string;
  puedeOperar: boolean;
  /** Planes de pago vigentes con saldo: lo compensado al pagar se puede imputar a sus cuotas. */
  planesPago?: PlanVigente[];
  /** Lo que cada disciplina le debe al club (tope de la compensación al pagar). */
  deudas?: Record<number, number>;
}) {
  const router = useRouter();
  const [discId, setDiscId] = useState<number | "">("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [previa, setPrevia] = useState<{ clave: string; datos: PreviaLiquidacionDisciplina } | null>(null);
  const [fecha, setFecha] = useState(hoy);
  const [notas, setNotas] = useState("");
  const [calculando, start] = useTransition();
  const [confirmar, setConfirmar] = useState(false);
  const [editar, setEditar] = useState<DisciplinaCobranza | null>(null);

  const disc = disciplinas.find((d) => d.id === discId);
  const clave = `${discId}|${desde}|${hasta}`;
  const p = previa && previa.clave === clave ? previa.datos : null;
  const pendientes = liquidaciones.filter((l) => l.estado === "vigente" && l.saldo > 0);
  const totalPendiente = pendientes.reduce((s, l) => s + l.saldo, 0);

  function elegir(id: number | "") {
    setDiscId(id);
    const r = rangoSugerido(disciplinas.find((d) => d.id === id), hoy);
    setDesde(r.desde);
    setHasta(r.hasta);
    setPrevia(null);
  }

  function calcular() {
    if (!discId || !desde || !hasta) return;
    start(async () => {
      const r = await previsualizarDisciplina({ disciplina_id: Number(discId), desde, hasta });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setPrevia({ clave, datos: r.data });
    });
  }

  const errores: string[] = [];
  if (p) {
    if (p.yaLiquidado) errores.push("Ese período ya se liquidó (total o parcialmente)");
    if (p.importe <= 0) errores.push("No hay nada para liquidar en el período");
    if (!fecha || fecha > hoy) errores.push("La fecha no puede ser futura");
  }

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Cuotas y cobranza"
        titulo="Liquidación a disciplinas"
        descripcion="Lo cobrado de las cuotas de cada disciplina, menos su parte de la comisión del débito, se le liquida: queda como deuda del club con la disciplina. Después se paga, en una o varias veces, transfiriendo y/o compensando lo que la disciplina le debe al club."
      />

      <Panel titulo="Liquidar" icono={Calculator} delay={0.04}>
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_10rem_auto] sm:items-end">
            <Campo etiqueta="Disciplina">
              <select value={discId} onChange={(e) => elegir(e.target.value ? Number(e.target.value) : "")} className={claseControl}>
                <option value="">Elegí…</option>
                {disciplinas.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Desde">
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={claseControl} disabled={!discId} />
            </Campo>
            <Campo etiqueta="Hasta">
              <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className={claseControl} disabled={!discId} />
            </Campo>
            <Boton onClick={calcular} pendiente={calculando} disabled={!discId || !desde || !hasta}>
              Calcular
            </Boton>
          </div>
          {disc?.ultimaLiquidacion && (
            <p className="text-xs text-muted-foreground">Última liquidación vigente hasta el {formatFecha(disc.ultimaLiquidacion)}.</p>
          )}

          <AnimatePresence mode="wait">
            {p && (
              <motion.div key={clave} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={easeSmooth} className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Cifra etiqueta="Cobrado" valor={p.cobrado} texto="Lo aplicado a cuotas de la disciplina en el período (cobros y saldo a favor, por fecha de aplicación)." />
                  <Cifra etiqueta="Comisión" valor={p.comision} texto="Su parte de la comisión del débito Visa acreditado en el período." negativo />
                  <Cifra etiqueta="A liquidar" valor={p.importe} texto="Cobrado menos comisión: lo que el club le va a deber a la disciplina." fuerte />
                  <Cifra
                    etiqueta="Deuda de la disciplina"
                    valor={deudas[Number(discId)] ?? p.deuda}
                    texto="Referencia: lo que la disciplina le debe al club. Se puede compensar al pagar la liquidación."
                    alerta={(deudas[Number(discId)] ?? p.deuda) > 0}
                  />
                </div>
                {p.yaLiquidado && <Aviso titulo="Ese período ya se liquidó a la disciplina (total o parcialmente)">Elegí fechas posteriores a la última liquidación o anulala primero.</Aviso>}

                {puedeOperar && p.importe > 0 && !p.yaLiquidado && (
                  <div className="grid grid-cols-1 gap-4 rounded-2xl border border-bordo-100 bg-bordo-50/30 p-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                      <Campo etiqueta="Fecha">
                        <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={claseControl} />
                      </Campo>
                      <Campo etiqueta="Notas">
                        <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" className={claseControl} maxLength={500} />
                      </Campo>
                      {disc?.datos_transferencia && <Explicacion className="sm:col-span-2">Datos para la transferencia: {disc.datos_transferencia}</Explicacion>}
                    </div>
                    <div className="space-y-2 rounded-xl border border-linea bg-white p-3 text-sm">
                      <div className="flex items-baseline justify-between">
                        <span className="font-medium">El club le va a deber</span>
                        <ImporteAnimado valor={p.importe} moneda="UYU" className="font-heading text-lg text-bordo-800" />
                      </div>
                      <Explicacion>Gasto de la disciplina (5.2.09) contra Liquidaciones a pagar (2.1.07.02). El pago se registra después.</Explicacion>
                      <Boton className="w-full" disabled={errores.length > 0} onClick={() => setConfirmar(true)}>
                        <Send className="size-4" />
                        Liquidar
                      </Boton>
                      {errores.length > 0 && <p className="text-center text-[11px] text-rose-700">{errores[0]}</p>}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Panel>

      <Panel
        titulo="Liquidaciones"
        icono={History}
        delay={0.08}
        accion={
          pendientes.length > 0 ? (
            <span className="text-xs text-amber-700">
              {pendientes.length} pendiente{pendientes.length === 1 ? "" : "s"} de pago · {formatImporte(totalPendiente, "UYU")}
            </span>
          ) : undefined
        }
      >
        <ListaLiquidaciones
          liquidaciones={liquidaciones}
          cuentas={cuentas}
          cuentaDefecto={cuentaDefecto}
          planes={planesPago}
          deudas={deudas}
          hoy={hoy}
          puedeOperar={puedeOperar}
        />
      </Panel>

      <Panel titulo="Configuración por disciplina" icono={Settings2} delay={0.12}>
        <ul className="divide-y divide-linea">
          {disciplinas.map((d, i) => (
            <motion.li
              key={d.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...easeSmooth, delay: Math.min(i, 14) * 0.02 }}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm sm:grid-cols-[minmax(0,12rem)_8rem_minmax(0,1fr)_9rem_auto]"
            >
              <div className="truncate font-medium">{d.nombre}</div>
              <div className="text-right sm:text-left">
                <Pastilla tono={d.configurada ? "info" : "neutro"}>{d.porcentaje}% comisión</Pastilla>
              </div>
              <div className="col-span-2 truncate text-xs text-muted-foreground sm:col-span-1">{d.datos_transferencia ?? "Sin datos de transferencia"}</div>
              <div className={cn("text-xs tabular-nums sm:text-right sm:text-sm", (deudas[d.id] ?? d.deuda ?? 0) > 0 && "text-rose-700")}>
                {(deudas[d.id] ?? d.deuda) == null
                  ? ""
                  : (deudas[d.id] ?? d.deuda ?? 0) > 0
                    ? `Debe ${formatImporte(deudas[d.id] ?? d.deuda ?? 0)}`
                    : <span className="text-muted-foreground">Sin deuda</span>}
              </div>
              <div className="flex justify-end">
                {puedeOperar && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setEditar(d)}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-superficie hover:text-bordo-800"
                    aria-label={`Editar ${d.nombre}`}
                  >
                    <Pencil className="size-4" />
                  </motion.button>
                )}
              </div>
            </motion.li>
          ))}
        </ul>
        <div className="border-t border-linea px-4 py-2">
          <Explicacion>Porcentaje: qué parte de la comisión del débito sobre las cuotas de la disciplina se le descuenta (100 % si no se configuró).</Explicacion>
        </div>
      </Panel>

      {p && disc && (
        <DialogoAccion
          open={confirmar}
          onOpenChange={setConfirmar}
          icono={Send}
          titulo={`Liquidar a ${disc.nombre}`}
          descripcion={
            <span>
              Del {formatFecha(desde)} al {formatFecha(hasta)}: el club le va a deber {formatImporte(p.importe, "UYU")} a la disciplina. El pago
              (transferencia y/o compensación) se registra después con &quot;Pagar&quot;. No se pueden registrar cobros de la disciplina con fecha
              dentro del período.
            </span>
          }
          textoAccion="Liquidar"
          mensaje="Liquidación registrada"
          alTerminar={() => {
            setPrevia(null);
            setNotas("");
            router.refresh();
          }}
          ejecutar={async () => {
            const r = await liquidarDisciplina({ disciplina_id: disc.id, desde, hasta, fecha, notas: notas.trim() || null });
            return r.ok ? { ok: true } : r;
          }}
        />
      )}

      {editar && <EditarDisciplina key={editar.id} disciplina={editar} onClose={() => setEditar(null)} />}
    </div>
  );
}


function Cifra({
  etiqueta,
  valor,
  texto,
  fuerte,
  alerta,
  negativo,
}: {
  etiqueta: string;
  valor: number;
  texto: string;
  fuerte?: boolean;
  alerta?: boolean;
  negativo?: boolean;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={cn(
        "space-y-1 rounded-2xl border bg-white p-3",
        fuerte ? "border-emerald-200 bg-emerald-50/40" : alerta ? "border-rose-200" : "border-linea"
      )}
    >
      <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">{etiqueta}</div>
      <ImporteAnimado
        valor={negativo ? -valor : valor}
        moneda="UYU"
        className={cn("font-heading text-lg", fuerte && "text-emerald-800", alerta && "text-rose-700")}
      />
      <Explicacion>{texto}</Explicacion>
    </motion.div>
  );
}

function EditarDisciplina({ disciplina, onClose }: { disciplina: DisciplinaCobranza; onClose: () => void }) {
  const [porcentaje, setPorcentaje] = useState(String(disciplina.porcentaje));
  const [datos, setDatos] = useState(disciplina.datos_transferencia ?? "");
  const n = Number(porcentaje.replace(",", "."));
  return (
    <DialogoAccion
      open
      onOpenChange={(o) => !o && onClose()}
      icono={Settings2}
      titulo={disciplina.nombre}
      descripcion="Cómo se le liquidan las cuotas a la disciplina."
      textoAccion="Guardar"
      mensaje="Guardado"
      deshabilitado={!Number.isFinite(n) || n < 0 || n > 100}
      ejecutar={async () => {
        const r = await guardarDisciplinaCobranza({ disciplina_id: disciplina.id, porcentaje: n, datos_transferencia: datos.trim() || null });
        return r.ok ? { ok: true } : r;
      }}
    >
      <Campo etiqueta="Parte de la comisión del débito (%)" ayuda="Sobre lo cobrado de sus cuotas por débito Visa. El resto lo absorbe el club.">
        <input inputMode="decimal" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} className={cn(claseControl, "text-right")} />
      </Campo>
      <Campo etiqueta="Datos para la transferencia" ayuda="Titular, banco y número de cuenta.">
        <textarea value={datos} onChange={(e) => setDatos(e.target.value)} rows={3} className={cn(claseControl, "h-auto py-2")} />
      </Campo>
    </DialogoAccion>
  );
}
