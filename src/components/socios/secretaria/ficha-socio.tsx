"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRightLeft,
  CircleStop,
  CreditCard,
  HandCoins,
  History,
  Layers,
  Link2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  UserMinus,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatFecha } from "@/lib/contabilidad/formato";
import {
  NOMBRE_PERIODICIDAD,
  formatCedula,
  formatVencimiento,
  personaSchema,
} from "@/lib/socios/esquemas";
import type { Disciplina, Ficha, Inscripcion, MedioRegistrado, PlanConPrecio } from "@/lib/socios/padron";
import { editarPersona } from "@/app/(dashboard)/secretaria/socios/actions";
import { EstadoCuenta } from "@/components/socios/estado-cuenta";
import { PersonaCampos, erroresPorCampo, personaAInput, type PersonaForm } from "./campos";
import {
  DialogoAnularBaja,
  DialogoBaja,
  DialogoCambiarPlan,
  DialogoFinalizar,
  DialogoInscribir,
  DialogoMedio,
} from "./dialogos-ficha";
import {
  BadgeEstadoSocio,
  BadgeSituacion,
  Boton,
  BotonLink,
  EtiquetaMedio,
  ImporteAnimado,
  Kpi,
  Panel,
} from "./ui";

type Dialogo =
  | { tipo: "inscribir" }
  | { tipo: "cambiar"; inscripcion: Inscripcion }
  | { tipo: "finalizar"; inscripcion: Inscripcion }
  | { tipo: "medio" }
  | { tipo: "baja" }
  | { tipo: "anular_baja" };

function personaForm(p: Ficha["persona"]): PersonaForm {
  return {
    cedula: p.cedula,
    nombre: p.nombre,
    apellido: p.apellido,
    fecha_nacimiento: p.fecha_nacimiento ?? "",
    telefono: p.telefono ?? "",
    email: p.email ?? "",
    direccion: p.direccion ?? "",
    numero_socio: p.numero_socio ? String(p.numero_socio) : "",
    notas: p.notas ?? "",
  };
}

export function FichaSocio({
  ficha,
  planes,
  disciplinas,
  motivos,
  bajaConDeuda,
  puedeGestionar,
  puedeCobrar,
}: {
  ficha: Ficha;
  planes: PlanConPrecio[];
  disciplinas: Disciplina[];
  motivos: { id: number; nombre: string }[];
  bajaConDeuda: "mantener" | "anular";
  puedeGestionar: boolean;
  puedeCobrar: boolean;
}) {
  const { persona, estado, membresias, inscripciones, medios, movimientos, pendientes, situacion, hoy } = ficha;
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [nonce, setNonce] = useState(0);
  const abrir = (d: Dialogo) => {
    setNonce((n) => n + 1);
    setDialogo(d);
  };
  const cerrar = (o: boolean) => {
    if (!o) setDialogo(null);
  };

  const membresiaActual = membresias.find((m) => m.hasta === null || m.hasta >= hoy) ?? null;
  const ultima = membresias[0] ?? null;
  const abiertas = inscripciones.filter((i) => i.hasta === null || i.hasta >= hoy);
  const historicas = inscripciones.filter((i) => i.hasta !== null && i.hasta < hoy);
  // El vigente hoy (con una baja de hoy se cerró con hasta = hoy, pero rige todavía).
  const medioActual = medios.find((m) => m.desde <= hoy && (m.hasta === null || m.hasta >= hoy)) ?? medios.find((m) => m.hasta === null) ?? null;
  const esSocio = estado === "vigente" || estado === "programado";
  /** Ya tiene la baja cargada (último día hoy o más adelante): sigue figurando como socio hasta esa fecha. */
  const bajaProgramada = esSocio && !!membresiaActual?.hasta;
  const nombre = `${persona.nombre} ${persona.apellido}`;

  return (
    <div className="space-y-5 pb-12">
      <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}>
        <Link
          href="/secretaria/socios"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-bordo-800"
        >
          <ArrowLeft className="size-4" />
          Socios
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
      >
        <div className="min-w-0">
          <div className="font-heading text-[11px] uppercase tracking-editorial text-bordo-800/70">
            {persona.numero_socio ? `Socio N° ${persona.numero_socio}` : "Padrón de socios"}
          </div>
          <h1 className="font-display text-2xl uppercase tracking-tightest break-words text-foreground sm:text-3xl">
            {nombre}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="tabular-nums">CI {formatCedula(persona.cedula)}</span>
            <BadgeEstadoSocio estado={estado} />
            {situacion && esSocio && <BadgeSituacion cuotasVencidas={situacion.cuotas_vencidas} alDia={situacion.al_dia} />}
            {persona.perfil_id && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                <Link2 className="size-3.5" />
                Cuenta web
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeCobrar && (
            <BotonLink href={`/cuotas/cobros/nuevo?persona=${persona.id}`} variante="secundario">
              <HandCoins className="size-4" />
              Registrar cobro
            </BotonLink>
          )}
          {puedeGestionar && esSocio && !bajaProgramada && (
            <Boton variante="peligro" onClick={() => abrir({ tipo: "baja" })}>
              <UserMinus className="size-4" />
              Dar de baja
            </Boton>
          )}
          {puedeGestionar && bajaProgramada && (
            <Boton variante="secundario" onClick={() => abrir({ tipo: "anular_baja" })}>
              <RotateCcw className="size-4" />
              Anular baja
            </Boton>
          )}
          {puedeGestionar && estado === "baja" && (
            <>
              <Boton variante="secundario" onClick={() => abrir({ tipo: "anular_baja" })}>
                <RotateCcw className="size-4" />
                Anular baja
              </Boton>
              <BotonLink href={`/secretaria/socios/nuevo?cedula=${persona.cedula}`}>
                <UserPlus className="size-4" />
                Reingreso
              </BotonLink>
            </>
          )}
          {puedeGestionar && estado === "sin_alta" && (
            <BotonLink href={`/secretaria/socios/nuevo?cedula=${persona.cedula}`}>
              <UserPlus className="size-4" />
              Dar de alta
            </BotonLink>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          etiqueta={esSocio ? "Socio desde" : estado === "baja" ? "Baja" : "Membresía"}
          detalle={
            estado === "baja" && ultima?.motivo
              ? ultima.motivo
              : esSocio && membresiaActual?.hasta
                ? `Baja programada ${formatFecha(membresiaActual.hasta)}`
                : membresias.length > 1
                  ? `${membresias.length} períodos como socio`
                  : undefined
          }
        >
          {esSocio && membresiaActual
            ? formatFecha(membresiaActual.desde)
            : estado === "baja" && ultima?.hasta
              ? formatFecha(ultima.hasta)
              : "—"}
        </Kpi>
        <Kpi
          etiqueta="Deuda vencida"
          tono={situacion && situacion.deuda_vencida > 0 ? (situacion.al_dia ? "neutro" : "alerta") : "bueno"}
          detalle={
            situacion
              ? `${situacion.cuotas_vencidas} cuota${situacion.cuotas_vencidas === 1 ? "" : "s"} vencida${situacion.cuotas_vencidas === 1 ? "" : "s"}`
              : "Sin cuotas"
          }
          delay={0.05}
        >
          <ImporteAnimado valor={situacion?.deuda_vencida ?? 0} moneda="UYU" />
        </Kpi>
        <Kpi etiqueta="Deuda total" detalle="Incluye cuotas por vencer" delay={0.1}>
          <ImporteAnimado valor={situacion?.deuda_total ?? 0} moneda="UYU" />
        </Kpi>
        <Kpi
          etiqueta="Saldo a favor"
          tono={situacion && situacion.saldo_a_favor > 0 ? "bueno" : "neutro"}
          detalle="Se aplica solo a las próximas cuotas"
          delay={0.15}
        >
          <ImporteAnimado valor={situacion?.saldo_a_favor ?? 0} moneda="UYU" />
        </Kpi>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <Inscripciones
            abiertas={abiertas}
            historicas={historicas}
            cuotaSocial={ficha.cuotaSocial}
            puedeGestionar={puedeGestionar && esSocio && !bajaProgramada}
            onInscribir={() => abrir({ tipo: "inscribir" })}
            onCambiar={(i) => abrir({ tipo: "cambiar", inscripcion: i })}
            onFinalizar={(i) => abrir({ tipo: "finalizar", inscripcion: i })}
          />
          <EstadoCuenta movimientos={movimientos} pendientes={pendientes} />
        </div>
        <div className="min-w-0 space-y-5">
          <DatosPersonales ficha={ficha} puedeGestionar={puedeGestionar} />
          <MedioCobro
            actual={medioActual}
            historial={medios.filter((m) => m !== medioActual)}
            puedeGestionar={puedeGestionar && esSocio && !bajaProgramada}
            onCambiar={() => abrir({ tipo: "medio" })}
          />
          <Membresias membresias={membresias} hoy={hoy} />
          <CuentaWeb ficha={ficha} />
        </div>
      </div>

      {dialogo?.tipo === "inscribir" && (
        <DialogoInscribir
          key={nonce}
          open
          onOpenChange={cerrar}
          personaId={persona.id}
          planes={planes}
          vigentes={abiertas}
          hoy={hoy}
          alta={membresiaActual?.desde ?? null}
        />
      )}
      {dialogo?.tipo === "cambiar" && (
        <DialogoCambiarPlan
          key={nonce}
          open
          onOpenChange={cerrar}
          personaId={persona.id}
          inscripcion={dialogo.inscripcion}
          planes={planes}
          hoy={hoy}
        />
      )}
      {dialogo?.tipo === "finalizar" && (
        <DialogoFinalizar
          key={nonce}
          open
          onOpenChange={cerrar}
          personaId={persona.id}
          inscripcion={dialogo.inscripcion}
          hoy={hoy}
        />
      )}
      {dialogo?.tipo === "medio" && (
        <DialogoMedio
          key={nonce}
          open
          onOpenChange={cerrar}
          personaId={persona.id}
          disciplinas={disciplinas}
          hoy={hoy}
          actualDesde={medioActual?.desde ?? null}
        />
      )}
      {dialogo?.tipo === "baja" && (
        <DialogoBaja
          key={nonce}
          open
          onOpenChange={cerrar}
          personaId={persona.id}
          nombre={nombre}
          motivos={motivos}
          bajaConDeuda={bajaConDeuda}
          deudaTotal={situacion?.deuda_total ?? 0}
          hoy={hoy}
          alta={membresiaActual?.desde ?? null}
        />
      )}
      {dialogo?.tipo === "anular_baja" && (
        <DialogoAnularBaja
          key={nonce}
          open
          onOpenChange={cerrar}
          personaId={persona.id}
          baja={(bajaProgramada ? membresiaActual?.hasta : ultima?.hasta) ?? null}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Secciones
// ------------------------------------------------------------

function Inscripciones({
  abiertas,
  historicas,
  cuotaSocial,
  puedeGestionar,
  onInscribir,
  onCambiar,
  onFinalizar,
}: {
  abiertas: Inscripcion[];
  historicas: Inscripcion[];
  cuotaSocial: Ficha["cuotaSocial"];
  puedeGestionar: boolean;
  onInscribir: () => void;
  onCambiar: (i: Inscripcion) => void;
  onFinalizar: (i: Inscripcion) => void;
}) {
  const [verHistoria, setVerHistoria] = useState(false);
  return (
    <Panel
      titulo="Cuota social y disciplinas"
      icono={Layers}
      delay={0.1}
      accion={
        puedeGestionar ? (
          <Boton variante="secundario" className="h-8 px-3 text-xs" onClick={onInscribir}>
            <Plus className="size-3.5" />
            Inscribir
          </Boton>
        ) : undefined
      }
    >
      {abiertas.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sin inscripciones vigentes.</p>
      ) : (
        <ul className="divide-y divide-linea">
          <AnimatePresence initial={false}>
            {abiertas.map((i, n) => (
              <motion.li
                key={i.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: n * 0.04 }}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-medium",
                        i.tipo === "social" ? "bg-dorado-100 text-dorado-800" : "bg-bordo-50 text-bordo-800"
                      )}
                    >
                      {i.tipo === "social" ? "Social" : i.disciplina}
                    </span>
                    <span className="truncate text-sm font-medium">{i.plan}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {NOMBRE_PERIODICIDAD[i.periodicidad] ?? i.periodicidad} ·{" "}
                    {i.futura ? `empieza el ${formatFecha(i.desde)}` : `desde ${formatFecha(i.desde)}`}
                    {i.hasta ? ` · hasta ${formatFecha(i.hasta)}` : ""}
                  </div>
                </div>
                {puedeGestionar && (
                  <div className="flex shrink-0 gap-1.5">
                    <Boton variante="secundario" className="h-8 px-2.5 text-xs" onClick={() => onCambiar(i)}>
                      <ArrowRightLeft className="size-3.5" />
                      {i.tipo === "social" ? "Cambiar plan" : "Categoría"}
                    </Boton>
                    {!i.hasta && (
                      <Boton variante="peligro" className="h-8 px-2.5 text-xs" onClick={() => onFinalizar(i)}>
                        <CircleStop className="size-3.5" />
                        Finalizar
                      </Boton>
                    )}
                  </div>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {cuotaSocial && cuotaSocial.disciplinas.length > 0 && abiertas.length > 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="border-t border-linea bg-dorado-50/40 px-4 py-2.5 text-xs text-muted-foreground"
        >
          {cuotaSocial.anual
            ? "La cuota social la paga anual: no se le cobra mes a mes ni la cubre ninguna disciplina."
            : cuotaSocial.disciplinas.length > 1
              ? `Está en ${cuotaSocial.disciplinas.join(" y ")}: la cuota social se cobra una sola vez y la cubre ${cuotaSocial.disciplina} (su inscripción más antigua). En la liquidación, esa disciplina responde por ella.`
              : `La cuota social la cubre ${cuotaSocial.disciplina}: si no la paga por el club, en la liquidación la pone la disciplina.`}
        </motion.p>
      )}
      {historicas.length > 0 && (
        <div className="border-t border-linea">
          <button
            type="button"
            onClick={() => setVerHistoria((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <span className="inline-flex items-center gap-1.5">
              <History className="size-3.5" />
              Inscripciones anteriores ({historicas.length})
            </span>
            <motion.span animate={{ rotate: verHistoria ? 45 : 0 }}>
              <Plus className="size-3.5" />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {verHistoria && (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                {historicas.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 pb-2.5 text-xs">
                    <span className="min-w-0 text-foreground">
                      {i.tipo === "social" ? "Social" : i.disciplina} · {i.plan}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatFecha(i.desde)} → {formatFecha(i.hasta)}
                      {i.motivo_fin ? ` · ${i.motivo_fin}` : ""}
                    </span>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}
    </Panel>
  );
}

function DatosPersonales({ ficha, puedeGestionar }: { ficha: Ficha; puedeGestionar: boolean }) {
  const { persona } = ficha;
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<PersonaForm>(() => personaForm(persona));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [pendiente, start] = useTransition();

  function guardar() {
    const input = personaAInput(form);
    const p = personaSchema.safeParse(input);
    if (!p.success) {
      setErrores(erroresPorCampo(p.error.issues));
      return;
    }
    setErrores({});
    start(async () => {
      const r = await editarPersona(persona.id, input);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Datos actualizados");
      setEditando(false);
      router.refresh();
    });
  }

  const filas: [string, React.ReactNode][] = [
    ["Nacimiento", persona.fecha_nacimiento ? formatFecha(persona.fecha_nacimiento) : null],
    ["Teléfono", persona.telefono],
    ["Email", persona.email],
    ["Dirección", persona.direccion],
    ["N° de socio", persona.numero_socio],
  ];

  return (
    <Panel
      titulo="Datos personales"
      icono={UserRound}
      delay={0.1}
      accion={
        puedeGestionar && !editando ? (
          <motion.button
            type="button"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => {
              setForm(personaForm(persona));
              setEditando(true);
            }}
            aria-label="Editar datos personales"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-superficie hover:text-bordo-800"
          >
            <Pencil className="size-4" />
          </motion.button>
        ) : undefined
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {editando ? (
          <motion.div
            key="editar"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-3 p-4"
          >
            <PersonaCampos valor={form} onChange={setForm} errores={errores} />
            <div className="flex justify-end gap-2">
              <Boton variante="secundario" onClick={() => setEditando(false)} disabled={pendiente}>
                <X className="size-4" />
                Cancelar
              </Boton>
              <Boton onClick={guardar} pendiente={pendiente}>
                {!pendiente && <Save className="size-4" />}
                Guardar
              </Boton>
            </div>
          </motion.div>
        ) : (
          <motion.dl
            key="ver"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="divide-y divide-linea/70 text-sm"
          >
            {filas.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 px-4 py-2">
                <dt className="shrink-0 text-xs text-muted-foreground">{k}</dt>
                <dd className={cn("min-w-0 truncate text-right", !v && "text-muted-foreground")}>{v ?? "—"}</dd>
              </div>
            ))}
            {persona.notas && (
              <div className="px-4 py-2">
                <dt className="text-xs text-muted-foreground">Notas</dt>
                <dd className="mt-0.5 text-sm whitespace-pre-line">{persona.notas}</dd>
              </div>
            )}
          </motion.dl>
        )}
      </AnimatePresence>
    </Panel>
  );
}

function DetalleMedio({ m }: { m: MedioRegistrado }) {
  return (
    <div className="space-y-0.5">
      <EtiquetaMedio medio={m.medio} disciplina={m.disciplina} className="text-sm" />
      {m.medio === "debito_visa" && (
        <div className="pl-5 text-xs text-muted-foreground tabular-nums">
          •••• {m.tarjeta_ultimos4} · vence {formatVencimiento(m.tarjeta_vencimiento)}
          {m.titular_nombre ? ` · titular ${m.titular_nombre}${m.titular_documento ? ` (${m.titular_documento})` : ""}` : ""}
        </div>
      )}
    </div>
  );
}

function MedioCobro({
  actual,
  historial,
  puedeGestionar,
  onCambiar,
}: {
  actual: MedioRegistrado | null;
  historial: MedioRegistrado[];
  puedeGestionar: boolean;
  onCambiar: () => void;
}) {
  return (
    <Panel
      titulo="Medio de cobro"
      icono={CreditCard}
      delay={0.15}
      accion={
        puedeGestionar ? (
          <Boton variante="secundario" className="h-8 px-3 text-xs" onClick={onCambiar}>
            {actual ? "Cambiar" : "Cargar"}
          </Boton>
        ) : undefined
      }
    >
      <div className="space-y-3 p-4">
        {actual ? (
          <div>
            <DetalleMedio m={actual} />
            <div className="mt-1 pl-5 text-[11px] text-muted-foreground">Desde {formatFecha(actual.desde)}</div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin medio de cobro vigente.</p>
        )}
        {historial.length > 0 && (
          <div className="space-y-2 border-t border-linea pt-3">
            <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">Historial</div>
            {historial.map((m) => (
              <div key={m.id} className="opacity-80">
                <DetalleMedio m={m} />
                <div className="pl-5 text-[11px] text-muted-foreground tabular-nums">
                  {formatFecha(m.desde)} → {m.hasta ? formatFecha(m.hasta) : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

function Membresias({ membresias, hoy }: { membresias: Ficha["membresias"]; hoy: string }) {
  return (
    <Panel titulo="Altas y bajas" icono={History} delay={0.2}>
      {membresias.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">Nunca tuvo una membresía en el sistema nuevo.</p>
      ) : (
        <ol className="relative space-y-3 p-4">
          {membresias.map((m, i) => {
            const vigente = m.desde <= hoy && (m.hasta === null || m.hasta >= hoy);
            return (
              <motion.li
                key={m.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.05 }}
                className="flex gap-3"
              >
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    vigente ? "bg-emerald-500" : m.desde > hoy ? "bg-sky-500" : "bg-slate-300"
                  )}
                />
                <div className="min-w-0 text-sm">
                  <div className="tabular-nums">
                    {formatFecha(m.desde)} → {m.hasta ? formatFecha(m.hasta) : "hoy"}
                  </div>
                  {m.motivo && (
                    <div className="text-xs text-muted-foreground">
                      Baja: {m.motivo}
                      {m.notas ? ` — ${m.notas}` : ""}
                    </div>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

function CuentaWeb({ ficha }: { ficha: Ficha }) {
  const { persona, perfil } = ficha;
  return (
    <Panel titulo="Cuenta web" icono={Link2} delay={0.25}>
      <div className="p-4 text-sm">
        {persona.perfil_id ? (
          <div className="space-y-0.5">
            <div className="font-medium">{perfil ? `${perfil.nombre} ${perfil.apellido}` : "Cuenta vinculada"}</div>
            <div className="text-xs text-muted-foreground">
              Vinculada{persona.vinculado_at ? ` el ${formatFecha(persona.vinculado_at.slice(0, 10))}` : ""}. Ve sus cuotas en
              Mi cuenta.
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">
            Sin cuenta web. La persona la vincula sola desde Mi cuenta con su cédula.
          </p>
        )}
      </div>
    </Panel>
  );
}
