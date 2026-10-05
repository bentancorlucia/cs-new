"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRightLeft, CircleStop, CreditCard, Plus, RotateCcw, UserMinus } from "lucide-react";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import {
  bajaSchema,
  cambiarMedioSchema,
  cambiarPlanSchema,
  finalizarSchema,
  inscribirSchema,
} from "@/lib/socios/esquemas";
import type { Disciplina, Inscripcion, MedioRegistrado, PlanConPrecio } from "@/lib/socios/padron";
import {
  anularBaja,
  cambiarMedio,
  cambiarPlan,
  darBaja,
  finalizarInscripcion,
  inscribir,
} from "@/app/(dashboard)/secretaria/socios/actions";
import { cn } from "@/lib/utils";
import { DialogoAccion } from "./dialogo";
import {
  MedioCobroCampos,
  erroresMedio,
  medioCobroAInput,
  medioCobroInicial,
  medioEfectivo,
  type DisciplinaSocio,
  type MedioActual,
  type MedioCobroForm,
} from "@/components/socios/medio-cobro";
import { CrearPrimerPlan, PrecioPlan, erroresPorCampo } from "./campos";
import { Aviso, Campo, EtiquetaMedio, claseControl } from "./ui";

type Abierto = { open: boolean; onOpenChange: (o: boolean) => void };

const mayor = (a: string, b: string) => (a > b ? a : b);

function SelectPlan({
  planes,
  valor,
  onChange,
  error,
  etiqueta = "Plan",
}: {
  planes: PlanConPrecio[];
  valor: string;
  onChange: (v: string) => void;
  error?: string;
  etiqueta?: string;
}) {
  const sociales = planes.filter((p) => p.tipo === "social");
  const porDisc = new Map<string, PlanConPrecio[]>();
  for (const p of planes.filter((x) => x.tipo === "disciplina")) {
    const k = p.disciplina ?? "Disciplina";
    porDisc.set(k, [...(porDisc.get(k) ?? []), p]);
  }
  return (
    <Campo etiqueta={etiqueta} error={error}>
      <select value={valor} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error || undefined} className={claseControl}>
        <option value="">Elegí…</option>
        {sociales.length > 0 && (
          <optgroup label="Cuota social">
            {sociales.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </optgroup>
        )}
        {[...porDisc.entries()].map(([d, l]) => (
          <optgroup key={d} label={d}>
            {l.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {p.precio ? ` — ${formatImporte(p.precio.importe_mensual, "UYU")}` : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </Campo>
  );
}

function SelectPeriodicidad({
  valor,
  onChange,
  plan,
}: {
  valor: "mensual" | "anual";
  onChange: (v: "mensual" | "anual") => void;
  plan?: PlanConPrecio;
}) {
  return (
    <Campo etiqueta="Periodicidad" ayuda={plan && !plan.permite_anual ? "Este plan es solo mensual" : undefined}>
      <select
        value={plan && !plan.permite_anual ? "mensual" : valor}
        onChange={(e) => onChange(e.target.value as "mensual" | "anual")}
        disabled={!!plan && !plan.permite_anual}
        className={claseControl}
      >
        <option value="mensual">Mensual</option>
        <option value="anual">Anual</option>
      </select>
    </Campo>
  );
}

// ------------------------------------------------------------
// Inscribir
// ------------------------------------------------------------

export function DialogoInscribir({
  open,
  onOpenChange,
  personaId,
  planes,
  disciplinas,
  vigentes,
  hoy,
  alta,
}: Abierto & {
  personaId: number;
  planes: PlanConPrecio[];
  /** Todas las disciplinas activas (tengan o no planes). */
  disciplinas: Disciplina[];
  vigentes: Inscripcion[];
  hoy: string;
  alta: string | null;
}) {
  // Planes creados acá mismo (primer plan de una disciplina).
  const [creados, setCreados] = useState<PlanConPrecio[]>([]);
  const todos = useMemo(() => [...planes, ...creados], [planes, creados]);
  const disponibles = todos.filter((p) => p.activo && !vigentes.some((v) => v.plan_id === p.id && !v.hasta));
  const [que, setQue] = useState("");
  const [plan, setPlan] = useState("");
  const [desde, setDesde] = useState(mayor(hoy, alta ?? hoy));
  const [periodicidad, setPeriodicidad] = useState<"mensual" | "anual">("mensual");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const elegido = disponibles.find((p) => String(p.id) === plan);
  const sociales = disponibles.filter((p) => p.tipo === "social");
  const discElegida = que && que !== "social" ? (disciplinas.find((d) => String(d.id) === que) ?? null) : null;
  const opciones =
    que === "social" ? sociales : discElegida ? disponibles.filter((p) => p.tipo === "disciplina" && p.disciplina_id === discElegida.id) : [];
  const sinPlanes = !!discElegida && !todos.some((p) => p.activo && p.tipo === "disciplina" && p.disciplina_id === discElegida.id);
  // La cuota social que ya paga (o la del plan social activo), para el total.
  const social = vigentes.find((v) => v.tipo === "social");
  const planSocial = todos.find((p) => p.id === social?.plan_id) ?? todos.find((p) => p.tipo === "social" && p.activo);
  const cuotaSocial = planSocial?.precio?.importe_mensual ?? null;

  return (
    <DialogoAccion
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setQue("");
          setPlan("");
          setDesde(mayor(hoy, alta ?? hoy));
          setPeriodicidad("mensual");
          setErrores({});
        }
        onOpenChange(o);
      }}
      icono={Plus}
      titulo="Inscribir a un plan"
      descripcion="Una disciplina (o categoría) o la cuota social. Tiene que quedar dentro del período como socio."
      textoAccion="Inscribir"
      mensajeOk="Inscripción registrada"
      deshabilitado={sinPlanes}
      ejecutar={() => {
        const input = {
          persona_id: personaId,
          plan_id: Number(plan),
          desde,
          periodicidad: elegido?.permite_anual ? periodicidad : "mensual",
        };
        const p = inscribirSchema.safeParse(input);
        if (!p.success) {
          setErrores(erroresPorCampo(p.error.issues));
          return null;
        }
        return inscribir(input);
      }}
    >
      <Campo etiqueta="Disciplina">
        <select
          value={que}
          onChange={(e) => {
            setQue(e.target.value);
            setPlan("");
          }}
          className={claseControl}
        >
          <option value="">Elegí…</option>
          {sociales.length > 0 && <option value="social">Cuota social</option>}
          {disciplinas.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <AnimatePresence initial={false} mode="wait">
        {sinPlanes && discElegida ? (
          <CrearPrimerPlan
            key={`crear-${discElegida.id}`}
            disciplina={discElegida}
            cuotaSocial={cuotaSocial}
            hoy={hoy}
            onCreado={(p) => {
              setCreados((l) => [...l, p]);
              setPlan(String(p.id));
            }}
          />
        ) : que ? (
          <motion.div
            key={`plan-${que}`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="space-y-1"
          >
            {opciones.length === 0 ? (
              <Aviso visible tono="info">
                Ya está inscripta/o en todas las categorías activas de {discElegida?.nombre ?? "la cuota social"}.
              </Aviso>
            ) : (
              <SelectPlan planes={opciones} valor={plan} onChange={setPlan} error={errores.plan_id} etiqueta="Categoría" />
            )}
            {elegido && (
              <div className="px-0.5">
                <PrecioPlan plan={elegido} periodicidad={elegido.permite_anual ? periodicidad : "mensual"} />
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
      {!plan && errores.plan_id && !que && <p className="px-0.5 text-xs text-rose-700">{errores.plan_id}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Desde" error={errores.desde}>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={claseControl} />
        </Campo>
        <SelectPeriodicidad valor={periodicidad} onChange={setPeriodicidad} plan={elegido} />
      </div>
    </DialogoAccion>
  );
}

// ------------------------------------------------------------
// Cambiar de categoría (o de plan social)
// ------------------------------------------------------------

/** Día siguiente a "AAAA-MM-DD". */
function diaSiguiente(f: string): string {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function DialogoCambiarPlan({
  open,
  onOpenChange,
  personaId,
  inscripcion,
  planes,
  hoy,
}: Abierto & {
  personaId: number;
  inscripcion: Inscripcion | null;
  planes: PlanConPrecio[];
  hoy: string;
}) {
  const opciones = useMemo(() => {
    if (!inscripcion) return [];
    const actual = planes.find((p) => p.id === inscripcion.plan_id);
    return planes.filter(
      (p) =>
        p.activo &&
        p.id !== inscripcion.plan_id &&
        p.tipo === inscripcion.tipo &&
        (p.tipo === "social" || p.disciplina_id === actual?.disciplina_id)
    );
  }, [inscripcion, planes]);
  const minimo = inscripcion ? diaSiguiente(inscripcion.desde) : hoy;
  const [plan, setPlan] = useState("");
  const [desde, setDesde] = useState(mayor(hoy, minimo));
  const [periodicidad, setPeriodicidad] = useState<"mensual" | "anual">(
    inscripcion?.periodicidad === "anual" ? "anual" : "mensual"
  );
  const [errores, setErrores] = useState<Record<string, string>>({});
  const elegido = opciones.find((p) => String(p.id) === plan);

  return (
    <DialogoAccion
      open={open}
      onOpenChange={(o) => {
        if (o && inscripcion) {
          setPlan("");
          setDesde(mayor(hoy, minimo));
          setPeriodicidad(inscripcion.periodicidad === "anual" ? "anual" : "mensual");
          setErrores({});
        }
        onOpenChange(o);
      }}
      icono={ArrowRightLeft}
      titulo={inscripcion?.tipo === "social" ? "Cambiar de plan social" : "Cambiar de categoría"}
      descripcion={
        inscripcion ? (
          <>
            Cierra <b>{inscripcion.plan}</b> el día anterior y abre la nueva categoría desde la fecha elegida.
          </>
        ) : null
      }
      textoAccion="Cambiar"
      mensajeOk="Categoría cambiada"
      deshabilitado={opciones.length === 0}
      ejecutar={() => {
        if (!inscripcion) return null;
        const input = {
          suscripcion_id: inscripcion.id,
          plan_id: Number(plan),
          desde,
          periodicidad: elegido?.permite_anual ? periodicidad : "mensual",
        };
        const p = cambiarPlanSchema.safeParse(input);
        if (!p.success) {
          setErrores(erroresPorCampo(p.error.issues));
          return null;
        }
        if (desde < minimo) {
          setErrores({ desde: `Tiene que ser posterior al inicio (${formatFecha(inscripcion.desde)})` });
          return null;
        }
        return cambiarPlan(personaId, input);
      }}
    >
      {opciones.length === 0 ? (
        <Aviso visible tono="info">
          No hay otras categorías activas para {inscripcion?.disciplina ?? "este plan"}. Crealas en Planes y cuotas.
        </Aviso>
      ) : (
        <>
          <SelectPlan planes={opciones} valor={plan} onChange={setPlan} error={errores.plan_id} etiqueta="Nueva categoría" />
          {elegido && (
            <div className="-mt-1 px-0.5">
              <PrecioPlan plan={elegido} periodicidad={elegido.permite_anual ? periodicidad : "mensual"} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Desde" error={errores.desde}>
              <input type="date" value={desde} min={minimo} onChange={(e) => setDesde(e.target.value)} className={claseControl} />
            </Campo>
            <SelectPeriodicidad valor={periodicidad} onChange={setPeriodicidad} plan={elegido} />
          </div>
        </>
      )}
    </DialogoAccion>
  );
}

// ------------------------------------------------------------
// Finalizar inscripción
// ------------------------------------------------------------

export function DialogoFinalizar({
  open,
  onOpenChange,
  personaId,
  inscripcion,
  hoy,
}: Abierto & { personaId: number; inscripcion: Inscripcion | null; hoy: string }) {
  const [hasta, setHasta] = useState(mayor(hoy, inscripcion?.desde ?? hoy));
  const [motivo, setMotivo] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  return (
    <DialogoAccion
      open={open}
      onOpenChange={(o) => {
        if (o && inscripcion) {
          setHasta(mayor(hoy, inscripcion.desde));
          setMotivo("");
          setErrores({});
        }
        onOpenChange(o);
      }}
      icono={CircleStop}
      destructivo
      titulo="Finalizar inscripción"
      descripcion={
        inscripcion ? (
          <>
            <b>{inscripcion.disciplina ? `${inscripcion.disciplina} · ` : ""}{inscripcion.plan}</b>: el último día con la
            inscripción. Sigue siendo socia/o; si deja el club, usá “Dar de baja”.
          </>
        ) : null
      }
      textoAccion="Finalizar"
      mensajeOk="Inscripción finalizada"
      ejecutar={() => {
        if (!inscripcion) return null;
        const input = { suscripcion_id: inscripcion.id, hasta, motivo };
        const p = finalizarSchema.safeParse(input);
        if (!p.success) {
          setErrores(erroresPorCampo(p.error.issues));
          return null;
        }
        if (hasta < inscripcion.desde) {
          setErrores({ hasta: `No puede ser anterior al inicio (${formatFecha(inscripcion.desde)})` });
          return null;
        }
        return finalizarInscripcion(personaId, input);
      }}
    >
      <Campo etiqueta="Último día" error={errores.hasta}>
        <input type="date" value={hasta} min={inscripcion?.desde} onChange={(e) => setHasta(e.target.value)} className={claseControl} />
      </Campo>
      <Campo etiqueta="Motivo (opcional)">
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Dejó la disciplina, lesión…" className={claseControl} />
      </Campo>
    </DialogoAccion>
  );
}

// ------------------------------------------------------------
// Medio de cobro
// ------------------------------------------------------------

export function DialogoMedio({
  open,
  onOpenChange,
  personaId,
  disciplinas,
  actual,
  hoy,
}: Abierto & {
  personaId: number;
  /** Las disciplinas en las que está inscripto (la transferencia va a una de ellas). */
  disciplinas: DisciplinaSocio[];
  actual: MedioRegistrado | null;
  hoy: string;
}) {
  const medioActual = useMemo(() => medioActualDeRegistro(actual), [actual]);
  const [medio, setMedio] = useState<MedioCobroForm>(() => medioCobroInicial(medioActual));
  const [desde, setDesde] = useState(hoy);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const actualDesde = actual?.desde ?? null;
  const efectivo = medioEfectivo(medio, disciplinas);
  return (
    <DialogoAccion
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setMedio(medioCobroInicial(medioActual));
          setDesde(hoy);
          setErrores({});
        } else {
          // Al cerrar no queda el número de la tarjeta en memoria.
          setMedio((m) => ({ ...m, tarjeta_numero: "" }));
        }
        onOpenChange(o);
      }}
      icono={CreditCard}
      titulo="Cambiar medio de cobro"
      descripcion={
        <span className="flex flex-wrap items-center gap-1">
          Hoy: <EtiquetaMedio medio={actual?.medio ?? null} disciplina={actual?.disciplina} varias={disciplinas.length > 1} className="font-medium" />
          <span>· El medio anterior queda en el historial hasta el día antes del cambio.</span>
        </span>
      }
      textoAccion="Guardar medio"
      mensajeOk="Medio de cobro actualizado"
      ancho="sm:max-w-lg"
      deshabilitado={!efectivo.medio}
      ejecutar={() => {
        const input = { persona_id: personaId, desde, medio: medioCobroAInput(medio, disciplinas, medioActual?.tarjeta) };
        const p = cambiarMedioSchema.safeParse(input);
        if (!p.success) {
          setErrores({ ...erroresPorCampo(p.error.issues), ...erroresMedio(p.error.issues) });
          return null;
        }
        setErrores({});
        return cambiarMedio(input).then((r) => {
          // El número completo no queda en el navegador.
          setMedio((m) => ({ ...m, tarjeta_numero: "" }));
          return r;
        });
      }}
    >
      <MedioCobroCampos
        valor={medio}
        onChange={setMedio}
        errores={errores}
        disciplinas={disciplinas}
        tarjetaActual={medioActual?.tarjeta}
      />
      <Campo etiqueta="Desde" error={errores.desde} className="sm:max-w-[12rem]">
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={claseControl} />
      </Campo>
      <Aviso visible={!!actualDesde && desde <= actualDesde} tono="info">
        El medio actual empezó el {formatFecha(actualDesde)}: con esta fecha se reemplaza (corrección de carga) en vez de
        quedar en el historial.
      </Aviso>
    </DialogoAccion>
  );
}

/** El medio vigente de la ficha, con su tarjeta (para "misma tarjeta"). */
function medioActualDeRegistro(m: MedioRegistrado | null): MedioActual | null {
  if (!m) return null;
  return {
    medio: m.medio,
    disciplina_id: m.disciplina_id,
    tarjeta:
      m.medio === "debito_visa" && m.tarjeta_ultimos4
        ? {
            ultimos4: m.tarjeta_ultimos4,
            vencimiento: m.tarjeta_vencimiento,
            emisor: m.tarjeta_emisor,
            titular: m.titular_nombre,
            titular_documento: m.titular_documento,
          }
        : null,
  };
}

// ------------------------------------------------------------
// Baja y anulación de la baja
// ------------------------------------------------------------

export function DialogoBaja({
  open,
  onOpenChange,
  personaId,
  nombre,
  motivos,
  bajaConDeuda,
  deudaTotal,
  hoy,
  alta,
}: Abierto & {
  personaId: number;
  nombre: string;
  motivos: { id: number; nombre: string }[];
  bajaConDeuda: "mantener" | "anular";
  deudaTotal: number;
  hoy: string;
  alta: string | null;
}) {
  const [hasta, setHasta] = useState(mayor(hoy, alta ?? hoy));
  const [motivo, setMotivo] = useState("");
  const [notas, setNotas] = useState("");
  const [anular, setAnular] = useState(bajaConDeuda === "anular");
  const [errores, setErrores] = useState<Record<string, string>>({});
  return (
    <DialogoAccion
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setHasta(mayor(hoy, alta ?? hoy));
          setMotivo("");
          setNotas("");
          setAnular(bajaConDeuda === "anular");
          setErrores({});
        }
        onOpenChange(o);
      }}
      icono={UserMinus}
      destructivo
      titulo={`Dar de baja a ${nombre}`}
      descripcion="Cierra el período como socio, las inscripciones y el medio de cobro."
      textoAccion="Dar de baja"
      mensajeOk="Baja registrada"
      ancho="sm:max-w-lg"
      ejecutar={() => {
        const input = { persona_id: personaId, hasta, motivo_id: Number(motivo), notas, anular_deuda: anular };
        const p = bajaSchema.safeParse(input);
        if (!p.success) {
          setErrores(erroresPorCampo(p.error.issues));
          return null;
        }
        if (alta && hasta < alta) {
          setErrores({ hasta: `No puede ser anterior al alta (${formatFecha(alta)})` });
          return null;
        }
        return darBaja(input);
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Último día como socio" error={errores.hasta}>
          <input type="date" value={hasta} min={alta ?? undefined} onChange={(e) => setHasta(e.target.value)} className={claseControl} />
        </Campo>
        <Campo etiqueta="Motivo" error={errores.motivo_id}>
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-invalid={!!errores.motivo_id || undefined} className={claseControl}>
            <option value="">Elegí…</option>
            {motivos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <Campo etiqueta="Notas (opcional)">
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={cn(claseControl, "h-auto py-2")} />
      </Campo>
      <fieldset className="space-y-2">
        <legend className="mb-1 px-0.5 text-[10px] uppercase tracking-editorial text-muted-foreground">
          Deuda pendiente{deudaTotal > 0 ? `: ${formatImporte(deudaTotal, "UYU")}` : ""}
        </legend>
        {(
          [
            { v: false, t: "Mantener la deuda", d: "Las cuotas hasta la baja siguen pendientes de cobro." },
            { v: true, t: "Anular la deuda", d: "Se emite una nota de crédito por todo el saldo pendiente." },
          ] as const
        ).map((o) => (
          <label
            key={String(o.v)}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors",
              anular === o.v ? "border-bordo-700 bg-bordo-50/60" : "border-linea hover:border-bordo-200"
            )}
          >
            <input type="radio" name="deuda-baja" checked={anular === o.v} onChange={() => setAnular(o.v)} className="mt-0.5 size-4 accent-bordo-800" />
            <span>
              <span className="block text-sm font-medium">
                {o.t}
                {(bajaConDeuda === "anular") === o.v && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">(lo configurado)</span>}
              </span>
              <span className="block text-xs text-muted-foreground">{o.d}</span>
            </span>
          </label>
        ))}
        <p className="px-0.5 text-[11px] text-muted-foreground">
          Las cuotas de períodos posteriores a la baja se acreditan siempre (en la anual, la parte posterior que esté impaga).
        </p>
      </fieldset>
      <Aviso visible={hasta > hoy} tono="info">
        Baja con fecha futura: sigue figurando como socio hasta el {formatFecha(hasta)}.
      </Aviso>
    </DialogoAccion>
  );
}

export function DialogoAnularBaja({
  open,
  onOpenChange,
  personaId,
  baja,
}: Abierto & { personaId: number; baja: string | null }) {
  return (
    <DialogoAccion
      open={open}
      onOpenChange={onOpenChange}
      icono={RotateCcw}
      titulo="Anular la baja"
      descripcion={
        <>
          Para corregir una baja cargada por error{baja ? ` (${formatFecha(baja)})` : ""}: reabre el último período como
          socio, sin fecha de fin.
        </>
      }
      textoAccion="Anular baja"
      mensajeOk="Baja anulada"
      ejecutar={() => anularBaja(personaId)}
    >
      <Aviso visible tono="alerta">
        Las inscripciones y el medio de cobro <b>no</b> se reabren: volvé a cargarlos desde la ficha. Las notas de crédito
        que haya emitido la baja quedan como estaban.
      </Aviso>
    </DialogoAccion>
  );
}
