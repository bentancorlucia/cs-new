"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRightLeft,
  CreditCard,
  HandCoins,
  Layers,
  Search,
  Tag,
  UserMinus,
  UserPen,
  UserPlus,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { finMes, inicioMes, nombrePeriodo, r2, sumarDias, sumarMeses } from "@/lib/socios/cuotas";
import { cedulaValida, formatCedula } from "@/lib/socios/esquemas";
import {
  altaDiscSchema,
  cambiarMedioDiscSchema,
  nombreSocio,
  planesVigentes,
  type PlanDisciplina,
  type PlanesDisciplina,
  type SocioDisciplina,
} from "@/lib/socios/panel-disciplina";
import {
  actualizarDatosDisc,
  altaSocioDisc,
  bajaDisc,
  cambiarMedioDisc,
  cambiarPlanDisc,
  crearPlanDisc,
  nuevoPrecioDisc,
  registrarCobroDisc,
} from "@/app/(dashboard)/disciplina/actions";
import { Campo, DialogoAccion, Explicacion, claseControl } from "@/components/socios/cuotas/ui";
import { erroresPorCampo } from "@/components/socios/secretaria/campos";
import { aNumero } from "@/components/socios/disciplinas/ui";
import { MedioCampos, medioFormAInput, medioInicial, type MedioFormDisc } from "./campos-medio";
import { MedioSocioTexto } from "./ui";

export type AccionPanel =
  | { tipo: "alta" }
  | { tipo: "baja"; socio: SocioDisciplina }
  | { tipo: "plan"; socio: SocioDisciplina }
  | { tipo: "medio"; socio: SocioDisciplina }
  | { tipo: "datos"; socio: SocioDisciplina }
  | { tipo: "cobro"; socio: SocioDisciplina | null }
  | { tipo: "nuevo_plan" }
  | { tipo: "precio"; plan: PlanDisciplina };

type Res = { ok: true } | { ok: false; error: string };
const res = (r: { ok: boolean; error?: string }): Res => (r.ok ? { ok: true } : { ok: false, error: r.error ?? "Error" });

interface Comun {
  disciplinaId: number;
  disciplinaNombre: string;
  hoy: string;
  onClose: () => void;
}

/** Todos los diálogos del panel; se montan al abrir (al cerrar se descarta lo escrito, incluido el número de tarjeta). */
export function DialogosPanel({
  accion,
  socios,
  planes,
  ...comun
}: Comun & { accion: AccionPanel | null; socios: SocioDisciplina[]; planes: PlanesDisciplina }) {
  if (!accion) return null;
  switch (accion.tipo) {
    case "alta":
      return <DialogoAlta {...comun} socios={socios} planes={planes} />;
    case "baja":
      return <DialogoBaja {...comun} socio={accion.socio} />;
    case "plan":
      return <DialogoCambiarPlan {...comun} socio={accion.socio} planes={planes} />;
    case "medio":
      return <DialogoMedio {...comun} socio={accion.socio} />;
    case "datos":
      return <DialogoDatos {...comun} socio={accion.socio} />;
    case "cobro":
      return <DialogoCobro {...comun} socio={accion.socio} socios={socios} />;
    case "nuevo_plan":
      return <DialogoNuevoPlan {...comun} cuotaSocial={planes.cuota_social} />;
    case "precio":
      return <DialogoNuevoPrecio {...comun} plan={accion.plan} cuotaSocial={planes.cuota_social} />;
  }
}

function CabeceraSocio({ socio }: { socio: SocioDisciplina }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-bordo-100 bg-bordo-50/50 px-3 py-2">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bordo-800 text-white">
        <UserRound className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{nombreSocio(socio)}</div>
        <div className="truncate text-[11px] text-muted-foreground tabular-nums">
          CI {formatCedula(socio.cedula)}
          {socio.numero_socio ? ` · Socio Nº ${socio.numero_socio}` : ""}
        </div>
      </div>
    </div>
  );
}

function TotalSocio({ social, plan, etiqueta = "Total que paga el socio por mes" }: { social: number; plan: number | null; etiqueta?: string }) {
  return (
    <motion.div layout className="flex items-center justify-between gap-3 rounded-xl bg-superficie px-3 py-2.5 text-sm">
      <div className="min-w-0">
        <div className="font-medium">{etiqueta}</div>
        <div className="text-[11px] text-muted-foreground">
          Cuota social {formatImporte(social)} + disciplina {plan === null ? "—" : formatImporte(plan)}
        </div>
      </div>
      <motion.span key={plan ?? -1} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="shrink-0 font-heading text-lg tabular-nums text-bordo-800">
        {plan === null ? "—" : formatImporte(r2(social + plan), "UYU")}
      </motion.span>
    </motion.div>
  );
}

// ------------------------------------------------------------
// Alta
// ------------------------------------------------------------

interface PersonaFormDisc {
  cedula: string;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  fecha_nacimiento: string;
  direccion: string;
}

const PERSONA_VACIA: PersonaFormDisc = { cedula: "", nombre: "", apellido: "", email: "", telefono: "", fecha_nacimiento: "", direccion: "" };

function DialogoAlta({ disciplinaId, disciplinaNombre, hoy, onClose, socios, planes }: Comun & { socios: SocioDisciplina[]; planes: PlanesDisciplina }) {
  const activos = planes.planes.filter((p) => p.activo);
  const [persona, setPersona] = useState<PersonaFormDisc>(PERSONA_VACIA);
  const [plan, setPlan] = useState<number>(activos.length === 1 ? activos[0].plan_id : 0);
  const [desde, setDesde] = useState(hoy);
  const [medio, setMedio] = useState<MedioFormDisc>(medioInicial(null, true));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const minimo = sumarDias(inicioMes(hoy), -31);

  const digitos = persona.cedula.replace(/\D/g, "");
  const listo = digitos.length >= 7;
  const existente = useMemo(() => (listo ? (socios.find((s) => s.cedula.replace(/\D/g, "") === digitos) ?? null) : null), [socios, digitos, listo]);
  const yaEsta = existente?.vigente ?? false;
  const elegido = activos.find((p) => p.plan_id === plan) ?? null;

  function cambiarCedula(v: string) {
    const d = v.replace(/\D/g, "").slice(0, 9);
    const previo = socios.find((s) => s.cedula.replace(/\D/g, "") === d && !s.vigente);
    if (previo) {
      setPersona({
        cedula: d,
        nombre: previo.nombre,
        apellido: previo.apellido,
        email: previo.email ?? "",
        telefono: previo.telefono ?? "",
        fecha_nacimiento: previo.fecha_nacimiento ?? "",
        direccion: previo.direccion ?? "",
      });
      setMedio(medioInicial(null, true));
    } else {
      setPersona((p) => ({ ...p, cedula: d }));
    }
  }

  const set = (k: keyof PersonaFormDisc) => (e: React.ChangeEvent<HTMLInputElement>) => setPersona({ ...persona, [k]: e.target.value });

  async function ejecutar(): Promise<Res> {
    const input = {
      disciplina: disciplinaId,
      persona,
      desde,
      plan,
      medio: medio.medio ? medioFormAInput(medio, disciplinaId, null) : null,
    };
    const p = altaDiscSchema.safeParse(input);
    if (!p.success) {
      const e = {
        ...erroresPorCampo(p.error.issues, "persona"),
        ...erroresPorCampo(p.error.issues, "medio"),
        ...(erroresPorCampo(p.error.issues).plan ? { plan: erroresPorCampo(p.error.issues).plan } : {}),
        ...(erroresPorCampo(p.error.issues).desde ? { desde: erroresPorCampo(p.error.issues).desde } : {}),
      };
      setErrores(e);
      return { ok: false, error: p.error.issues[0]?.message ?? "Revisá los datos" };
    }
    setErrores({});
    return res(await altaSocioDisc(input));
  }

  return (
    <DialogoAccion
      open
      onOpenChange={(o) => !o && onClose()}
      icono={UserPlus}
      titulo="Alta de socio"
      descripcion={`Se suma a ${disciplinaNombre}. Si todavía no es socio del club, también queda dado de alta en el club (cuota social + plan).`}
      textoAccion="Dar de alta"
      mensaje="Alta registrada"
      deshabilitado={!listo || yaEsta || activos.length === 0}
      ancho="sm:max-w-2xl"
      ejecutar={ejecutar}
    >
      <Campo etiqueta="Cédula" error={errores.cedula} ayuda="Empezá por la cédula: si ya es socio del club, usamos sus datos del padrón.">
        <input
          value={persona.cedula}
          onChange={(e) => cambiarCedula(e.target.value)}
          inputMode="numeric"
          autoFocus
          autoComplete="off"
          placeholder="Sin puntos ni guión"
          aria-invalid={!!errores.cedula || undefined}
          className={cn(claseControl, "text-base tabular-nums")}
        />
      </Campo>
      {listo && !cedulaValida(digitos) && (
        <Explicacion>El dígito verificador no coincide: revisá la cédula (si es un documento extranjero podés seguir igual).</Explicacion>
      )}

      <AnimatePresence initial={false} mode="popLayout">
        {yaEsta && existente && (
          <motion.div key="ya" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-xl border border-dorado-300 bg-dorado-100/60 p-3 text-sm text-dorado-900">
            {nombreSocio(existente)} ya está en la disciplina. Para cambiarle la categoría usá &quot;Cambiar plan&quot; desde la lista de socios.
          </motion.div>
        )}
        {listo && !yaEsta && (
          <motion.div key="resto" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-4 overflow-hidden">
            {existente && (
              <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900">
                Estuvo en la disciplina hasta el {formatFecha(existente.hasta)}: completamos sus datos.
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo etiqueta="Nombre" error={errores.nombre}>
                <input value={persona.nombre} onChange={set("nombre")} autoComplete="off" aria-invalid={!!errores.nombre || undefined} className={claseControl} />
              </Campo>
              <Campo etiqueta="Apellido" error={errores.apellido}>
                <input value={persona.apellido} onChange={set("apellido")} autoComplete="off" aria-invalid={!!errores.apellido || undefined} className={claseControl} />
              </Campo>
              <Campo etiqueta="Email" error={errores.email}>
                <input type="email" value={persona.email} onChange={set("email")} autoComplete="off" inputMode="email" className={claseControl} />
              </Campo>
              <Campo etiqueta="Teléfono" error={errores.telefono}>
                <input value={persona.telefono} onChange={set("telefono")} inputMode="tel" autoComplete="off" className={claseControl} />
              </Campo>
              <Campo etiqueta="Fecha de nacimiento" error={errores.fecha_nacimiento}>
                <input type="date" value={persona.fecha_nacimiento} onChange={set("fecha_nacimiento")} className={claseControl} />
              </Campo>
              <Campo etiqueta="Dirección" error={errores.direccion}>
                <input value={persona.direccion} onChange={set("direccion")} autoComplete="off" className={claseControl} />
              </Campo>
            </div>

            <div className="space-y-2">
              <div className="px-0.5 text-[10px] uppercase tracking-editorial text-muted-foreground">Plan</div>
              {activos.length === 0 ? (
                <p className="text-xs text-rose-700">La disciplina no tiene planes activos: creá uno en la pestaña Planes.</p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {activos.map((p) => (
                    <BotonPlan key={p.plan_id} plan={p} activo={plan === p.plan_id} social={planes.cuota_social} onClick={() => setPlan(p.plan_id)} />
                  ))}
                </div>
              )}
              {errores.plan && <p className="px-0.5 text-xs text-rose-700">{errores.plan}</p>}
            </div>

            <Campo etiqueta="Fecha de alta" error={errores.desde} ayuda="Hasta un mes para atrás.">
              <input type="date" value={desde} min={minimo} onChange={(e) => setDesde(e.target.value)} className={claseControl} />
            </Campo>

            <TotalSocio social={planes.cuota_social} plan={elegido?.precio_vigente ?? null} />

            <div className="space-y-2">
              <div className="px-0.5 text-[10px] uppercase tracking-editorial text-muted-foreground">Medio de cobro</div>
              <MedioCampos valor={medio} onChange={setMedio} errores={errores} permitirNinguno />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </DialogoAccion>
  );
}

function BotonPlan({ plan, activo, social, onClick }: { plan: PlanDisciplina; activo: boolean; social: number; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "flex items-center justify-between gap-2 rounded-xl border p-3 text-left transition-colors",
        activo ? "border-bordo-700 bg-bordo-50/60" : "border-linea bg-white hover:border-bordo-200"
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{plan.nombre}</span>
        <span className="block text-[11px] text-muted-foreground tabular-nums">
          Disciplina {plan.precio_vigente === null ? "sin precio" : formatImporte(plan.precio_vigente)}
        </span>
      </span>
      <span className="shrink-0 text-sm font-medium tabular-nums text-bordo-800">
        {plan.precio_vigente === null ? "—" : formatImporte(r2(social + plan.precio_vigente))}
      </span>
    </motion.button>
  );
}

// ------------------------------------------------------------
// Baja
// ------------------------------------------------------------

function DialogoBaja({ disciplinaId, disciplinaNombre, hoy, onClose, socio }: Comun & { socio: SocioDisciplina }) {
  const [hasta, setHasta] = useState(finMes(hoy));
  const [motivo, setMotivo] = useState("");
  const [bajaClub, setBajaClub] = useState(false);
  const puedeBajaClub = socio.socio && socio.otras_disciplinas.length === 0;
  return (
    <DialogoAccion
      open
      onOpenChange={(o) => !o && onClose()}
      icono={UserMinus}
      titulo="Dar de baja"
      destructivo
      textoAccion={bajaClub ? "Dar de baja del club" : "Dar de baja de la disciplina"}
      mensaje="Baja registrada"
      descripcion="Deja de cobrársele la disciplina desde el mes siguiente a la fecha. Tesorería lo saca del débito."
      ejecutar={async () =>
        res(
          await bajaDisc({
            disciplina: disciplinaId,
            persona: socio.persona_id,
            hasta,
            baja_club: puedeBajaClub && bajaClub,
            motivo,
          })
        )
      }
    >
      <CabeceraSocio socio={socio} />
      <Campo etiqueta="Último día" ayuda="Puede ser hasta un mes para atrás.">
        <input type="date" value={hasta} min={sumarDias(inicioMes(hoy), -31)} onChange={(e) => setHasta(e.target.value)} className={claseControl} />
      </Campo>
      <Campo etiqueta="Motivo (opcional)">
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: deja de jugar, se muda…" className={claseControl} />
      </Campo>
      {puedeBajaClub ? (
        <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-linea p-3 text-sm transition-colors hover:border-rose-200">
          <input type="checkbox" checked={bajaClub} onChange={(e) => setBajaClub(e.target.checked)} className="mt-0.5 size-4 accent-rose-700" />
          <span>
            <span className="block font-medium">También deja el club</span>
            <span className="block text-xs text-muted-foreground">
              Se da de baja como socio (deja de pagar la cuota social). Si no lo marcás, sigue siendo socio del club fuera de {disciplinaNombre}.
            </span>
          </span>
        </label>
      ) : socio.otras_disciplinas.length > 0 ? (
        <Explicacion>
          Sigue en {socio.otras_disciplinas.join(", ")}: solo se lo saca de {disciplinaNombre}.
        </Explicacion>
      ) : null}
    </DialogoAccion>
  );
}

// ------------------------------------------------------------
// Cambio de plan
// ------------------------------------------------------------

function DialogoCambiarPlan({ disciplinaId, hoy, onClose, socio, planes }: Comun & { socio: SocioDisciplina; planes: PlanesDisciplina }) {
  const vigentes = planesVigentes(socio);
  const [suscripcion, setSuscripcion] = useState<number>(vigentes[0]?.suscripcion_id ?? 0);
  const actual = vigentes.find((i) => i.suscripcion_id === suscripcion);
  const opciones = planes.planes.filter((p) => p.activo && p.plan_id !== actual?.plan_id);
  const [plan, setPlan] = useState<number>(0);
  const [desde, setDesde] = useState(sumarMeses(inicioMes(hoy), 1));
  const elegido = opciones.find((p) => p.plan_id === plan) ?? null;
  return (
    <DialogoAccion
      open
      onOpenChange={(o) => !o && onClose()}
      icono={ArrowRightLeft}
      titulo="Cambiar plan"
      textoAccion="Cambiar plan"
      mensaje="Plan cambiado"
      deshabilitado={!suscripcion || !plan}
      descripcion="Por ejemplo, pasar a la categoría con transporte. Si paga por débito, tesorería ajusta el importe en Visa."
      ejecutar={async () => res(await cambiarPlanDisc({ disciplina: disciplinaId, suscripcion, plan, desde }))}
    >
      <CabeceraSocio socio={socio} />
      {vigentes.length > 1 && (
        <Campo etiqueta="Plan a cambiar">
          <select value={suscripcion} onChange={(e) => setSuscripcion(Number(e.target.value))} className={claseControl}>
            {vigentes.map((i) => (
              <option key={i.suscripcion_id} value={i.suscripcion_id}>
                {i.plan} (desde {formatFecha(i.desde)})
              </option>
            ))}
          </select>
        </Campo>
      )}
      {actual && (
        <p className="text-xs text-muted-foreground">
          Hoy: <span className="font-medium text-foreground">{actual.plan}</span>
        </p>
      )}
      <div className="space-y-2">
        <div className="px-0.5 text-[10px] uppercase tracking-editorial text-muted-foreground">Plan nuevo</div>
        {opciones.length === 0 ? (
          <p className="text-xs text-muted-foreground">No hay otros planes activos en la disciplina.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {opciones.map((p) => (
              <BotonPlan key={p.plan_id} plan={p} activo={plan === p.plan_id} social={planes.cuota_social} onClick={() => setPlan(p.plan_id)} />
            ))}
          </div>
        )}
      </div>
      <Campo etiqueta="Desde" ayuda={`Rige desde ${nombrePeriodo(desde).toLowerCase()}.`}>
        <input type="date" value={desde} min={sumarDias(inicioMes(hoy), -31)} onChange={(e) => setDesde(e.target.value)} className={claseControl} />
      </Campo>
      {elegido && <TotalSocio social={planes.cuota_social} plan={elegido.precio_vigente} etiqueta="Pasa a pagar por mes" />}
    </DialogoAccion>
  );
}

// ------------------------------------------------------------
// Medio de cobro / tarjeta
// ------------------------------------------------------------

function DialogoMedio({ disciplinaId, hoy, onClose, socio }: Comun & { socio: SocioDisciplina }) {
  const [medio, setMedio] = useState<MedioFormDisc>(medioInicial(socio.medio));
  const [desde, setDesde] = useState(socio.medio && socio.medio.desde > hoy ? socio.medio.desde : hoy);
  const [errores, setErrores] = useState<Record<string, string>>({});

  async function ejecutar(): Promise<Res> {
    const input = { disciplina: disciplinaId, persona: socio.persona_id, desde, medio: medioFormAInput(medio, disciplinaId, socio.medio) };
    const p = cambiarMedioDiscSchema.safeParse(input);
    if (!p.success) {
      setErrores(erroresPorCampo(p.error.issues, "medio"));
      return { ok: false, error: p.error.issues[0]?.message ?? "Revisá los datos" };
    }
    setErrores({});
    const r = await cambiarMedioDisc(input);
    // El número no queda en ningún lado del navegador.
    setMedio((m) => ({ ...m, tarjeta_numero: "" }));
    return res(r);
  }

  return (
    <DialogoAccion
      open
      onOpenChange={(o) => !o && onClose()}
      icono={CreditCard}
      titulo="Tarjeta y medio de cobro"
      textoAccion="Guardar"
      mensaje="Medio de cobro actualizado: tesorería lo va a cargar"
      deshabilitado={!medio.medio}
      ancho="sm:max-w-lg"
      descripcion={
        <span className="flex flex-wrap items-center gap-1">
          Hoy: <MedioSocioTexto medio={socio.medio} vencida={socio.tarjeta_vencida} className="font-medium text-foreground" />
        </span>
      }
      ejecutar={ejecutar}
    >
      <CabeceraSocio socio={socio} />
      <MedioCampos valor={medio} onChange={setMedio} errores={errores} actual={socio.medio} />
      <Campo etiqueta="Desde" ayuda={socio.medio ? `El medio actual rige desde el ${formatFecha(socio.medio.desde)}.` : undefined}>
        <input type="date" value={desde} min={socio.medio?.desde} onChange={(e) => setDesde(e.target.value)} className={claseControl} />
      </Campo>
    </DialogoAccion>
  );
}

// ------------------------------------------------------------
// Datos de contacto
// ------------------------------------------------------------

function DialogoDatos({ disciplinaId, onClose, socio }: Comun & { socio: SocioDisciplina }) {
  const [d, setD] = useState({
    email: socio.email ?? "",
    telefono: socio.telefono ?? "",
    direccion: socio.direccion ?? "",
    fecha_nacimiento: socio.fecha_nacimiento ?? "",
  });
  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });
  return (
    <DialogoAccion
      open
      onOpenChange={(o) => !o && onClose()}
      icono={UserPen}
      titulo="Datos de contacto"
      textoAccion="Guardar"
      mensaje="Datos actualizados"
      ejecutar={async () => res(await actualizarDatosDisc({ disciplina: disciplinaId, persona: socio.persona_id, datos: d }))}
    >
      <CabeceraSocio socio={socio} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Email">
          <input type="email" inputMode="email" value={d.email} onChange={set("email")} autoComplete="off" className={claseControl} />
        </Campo>
        <Campo etiqueta="Teléfono">
          <input inputMode="tel" value={d.telefono} onChange={set("telefono")} autoComplete="off" className={claseControl} />
        </Campo>
        <Campo etiqueta="Fecha de nacimiento">
          <input type="date" value={d.fecha_nacimiento} onChange={set("fecha_nacimiento")} className={claseControl} />
        </Campo>
        <Campo etiqueta="Dirección">
          <input value={d.direccion} onChange={set("direccion")} autoComplete="off" className={claseControl} />
        </Campo>
      </div>
    </DialogoAccion>
  );
}

// ------------------------------------------------------------
// Cobro recibido por la disciplina
// ------------------------------------------------------------

function DialogoCobro({ disciplinaId, disciplinaNombre, hoy, onClose, socio: inicial, socios }: Comun & { socio: SocioDisciplina | null; socios: SocioDisciplina[] }) {
  const [socio, setSocio] = useState<SocioDisciplina | null>(inicial);
  const [buscar, setBuscar] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const sugerido = inicial ? inicial.deuda_vencida || inicial.deuda_total : 0;
  const [importe, setImporte] = useState(sugerido > 0 ? String(sugerido).replace(".", ",") : "");
  const [referencia, setReferencia] = useState("");
  const monto = aNumero(importe);

  const q = buscar.trim().toLowerCase();
  const encontrados = q.length < 2 ? [] : socios.filter((s) => `${s.nombre} ${s.apellido} ${s.cedula} ${s.numero_socio ?? ""}`.toLowerCase().includes(q)).slice(0, 8);

  return (
    <DialogoAccion
      open
      onOpenChange={(o) => !o && onClose()}
      icono={HandCoins}
      titulo="Registrar cobro"
      textoAccion="Registrar cobro"
      mensaje="Cobro registrado"
      deshabilitado={!socio || !(monto > 0)}
      descripcion={`Un pago que recibió ${disciplinaNombre} directamente (transferencia a su cuenta o efectivo). Se aplica a las cuotas del socio y queda como deuda de la disciplina con el club, que se descuenta en la próxima liquidación.`}
      ejecutar={async () =>
        socio
          ? res(await registrarCobroDisc({ disciplina: disciplinaId, persona: socio.persona_id, fecha, importe: monto, referencia }))
          : { ok: false, error: "Elegí el socio" }
      }
    >
      {socio ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <CabeceraSocio socio={socio} />
            </div>
            {!inicial && (
              <button type="button" onClick={() => setSocio(null)} className="shrink-0 text-xs font-medium text-bordo-800 hover:underline">
                Cambiar
              </button>
            )}
          </div>
          {(socio.deuda_total > 0 || socio.deuda_vencida > 0) && (
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                { t: "Vencido", v: socio.deuda_vencida },
                { t: "Total adeudado", v: socio.deuda_total },
              ]
                .filter((x) => x.v > 0)
                .map((x) => (
                  <motion.button
                    key={x.t}
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setImporte(String(x.v).replace(".", ","))}
                    className="rounded-full border border-linea bg-white px-2.5 py-1 tabular-nums transition-colors hover:border-bordo-200"
                  >
                    {x.t}: {formatImporte(x.v)}
                  </motion.button>
                ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              autoFocus
              placeholder="Buscá el socio por nombre o cédula…"
              className={cn(claseControl, "pl-9")}
            />
          </div>
          <ul className="space-y-1">
            <AnimatePresence initial={false}>
              {encontrados.map((s) => (
                <motion.li key={s.persona_id} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setSocio(s);
                      const v = s.deuda_vencida || s.deuda_total;
                      if (v > 0) setImporte(String(v).replace(".", ","));
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-bordo-50"
                  >
                    <span className="min-w-0 truncate">{nombreSocio(s)}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                      {formatCedula(s.cedula)}
                      {s.deuda_total > 0 ? ` · debe ${formatImporte(s.deuda_total)}` : ""}
                    </span>
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {q.length >= 2 && encontrados.length === 0 && <p className="px-1 text-xs text-muted-foreground">Nadie de la disciplina con ese nombre.</p>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Fecha">
          <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={claseControl} />
        </Campo>
        <Campo etiqueta="Importe">
          <input value={importe} onChange={(e) => setImporte(e.target.value)} inputMode="decimal" placeholder="0,00" className={cn(claseControl, "tabular-nums")} />
        </Campo>
      </div>
      <Campo etiqueta="Referencia (opcional)">
        <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Nº de transferencia, recibo…" className={claseControl} />
      </Campo>
    </DialogoAccion>
  );
}

// ------------------------------------------------------------
// Planes y precios
// ------------------------------------------------------------

function CampoMes({ valor, onChange, minimo, ayuda }: { valor: string; onChange: (v: string) => void; minimo: string; ayuda?: string }) {
  return (
    <Campo etiqueta="Desde el mes" ayuda={ayuda}>
      <input type="month" value={valor.slice(0, 7)} min={minimo.slice(0, 7)} onChange={(e) => e.target.value && onChange(`${e.target.value}-01`)} className={claseControl} />
    </Campo>
  );
}

function DialogoNuevoPlan({ disciplinaId, disciplinaNombre, hoy, onClose, cuotaSocial }: Comun & { cuotaSocial: number }) {
  const [nombre, setNombre] = useState("");
  const [importe, setImporte] = useState("");
  const [desde, setDesde] = useState(inicioMes(hoy));
  const monto = aNumero(importe);
  return (
    <DialogoAccion
      open
      onOpenChange={(o) => !o && onClose()}
      icono={Layers}
      titulo="Nuevo plan"
      textoAccion="Crear plan"
      mensaje="Plan creado"
      deshabilitado={nombre.trim().length < 2 || !(monto > 0)}
      descripcion={`Una categoría nueva de ${disciplinaNombre} (por ejemplo "Con transporte"). El importe es solo la parte de la disciplina: el socio paga además la cuota social.`}
      ejecutar={async () => res(await crearPlanDisc({ disciplina: disciplinaId, nombre, importe: monto, desde }))}
    >
      <Campo etiqueta="Nombre">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder="Ej.: Con transporte" className={claseControl} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Cuota de la disciplina">
          <input value={importe} onChange={(e) => setImporte(e.target.value)} inputMode="decimal" placeholder="0,00" className={cn(claseControl, "tabular-nums")} />
        </Campo>
        <CampoMes valor={desde} onChange={setDesde} minimo={inicioMes(hoy)} />
      </div>
      <TotalSocio social={cuotaSocial} plan={monto > 0 ? monto : null} />
    </DialogoAccion>
  );
}

function DialogoNuevoPrecio({ disciplinaId, hoy, onClose, plan, cuotaSocial }: Comun & { plan: PlanDisciplina; cuotaSocial: number }) {
  const [importe, setImporte] = useState("");
  const [desde, setDesde] = useState(sumarMeses(inicioMes(hoy), 1));
  const monto = aNumero(importe);
  const diferencia = plan.precio_vigente !== null && monto > 0 ? r2(monto - plan.precio_vigente) : null;
  return (
    <DialogoAccion
      open
      onOpenChange={(o) => !o && onClose()}
      icono={Tag}
      titulo={`Nuevo precio · ${plan.nombre}`}
      textoAccion="Guardar precio"
      mensaje="Precio nuevo registrado"
      deshabilitado={!(monto > 0)}
      descripcion="Rige desde el mes que elijas (este mes o uno posterior). Los meses ya emitidos no cambian."
      ejecutar={async () => res(await nuevoPrecioDisc({ disciplina: disciplinaId, plan: plan.plan_id, importe: monto, desde }))}
    >
      <p className="text-sm text-muted-foreground">
        Hoy la disciplina cobra <span className="font-medium text-foreground tabular-nums">{plan.precio_vigente === null ? "—" : formatImporte(plan.precio_vigente)}</span>{" "}
        y el socio paga en total{" "}
        <span className="font-medium text-foreground tabular-nums">
          {plan.precio_vigente === null ? "—" : formatImporte(r2(cuotaSocial + plan.precio_vigente))}
        </span>
        .
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Cuota nueva de la disciplina">
          <input value={importe} onChange={(e) => setImporte(e.target.value)} autoFocus inputMode="decimal" placeholder="0,00" className={cn(claseControl, "tabular-nums")} />
        </Campo>
        <CampoMes valor={desde} onChange={setDesde} minimo={inicioMes(hoy)} />
      </div>
      <TotalSocio social={cuotaSocial} plan={monto > 0 ? monto : null} etiqueta="Total nuevo que paga el socio" />
      {diferencia !== null && diferencia !== 0 && (
        <p className={cn("text-xs", diferencia > 0 ? "text-rose-700" : "text-emerald-700")}>
          {diferencia > 0 ? "Sube" : "Baja"} {formatImporte(Math.abs(diferencia))} por mes desde {nombrePeriodo(desde).toLowerCase()}.
        </p>
      )}
      {plan.con_debito > 0 ? (
        <Explicacion>
          {plan.con_debito} socio{plan.con_debito === 1 ? "" : "s"} con débito Visa en este plan: tesorería tiene que cambiar el importe en Visa (queda
          pendiente en Cambios).
        </Explicacion>
      ) : (
        <Explicacion>Nadie paga este plan con débito: no hay que cambiar nada en Visa.</Explicacion>
      )}
    </DialogoAccion>
  );
}

