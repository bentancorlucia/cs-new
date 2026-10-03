"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CreditCard,
  IdCard,
  Layers,
  RotateCcw,
  Search,
  UserCheck,
  UserPlus,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { altaSchema, formatCedula, soloDigitos } from "@/lib/socios/esquemas";
import type { Disciplina, PersonaPadron, PlanConPrecio } from "@/lib/socios/padron";
import { buscarPorCedula, darDeAlta } from "@/app/(dashboard)/secretaria/socios/actions";
import {
  AvisoCedula,
  MEDIO_VACIO,
  MedioCobroCampos,
  PERSONA_VACIA,
  PersonaCampos,
  PlanesCampos,
  erroresPorCampo,
  medioAInput,
  personaAInput,
  type MedioForm,
  type PersonaForm,
  type PlanElegido,
} from "./campos";
import { Aviso, Boton, BotonLink, Campo, EncabezadoPagina, Panel, claseControl } from "./ui";

type Busqueda =
  | { tipo: "nueva" }
  | { tipo: "reingreso"; persona: PersonaPadron; alta: string | null }
  | { tipo: "vigente"; persona: PersonaPadron; alta: string | null };

export function AltaSocio({
  planes,
  disciplinas,
  hoy,
  cedulaInicial,
}: {
  planes: PlanConPrecio[];
  disciplinas: Disciplina[];
  hoy: string;
  cedulaInicial?: string;
}) {
  const router = useRouter();
  const [cedula, setCedula] = useState(cedulaInicial ?? "");
  const [busqueda, setBusqueda] = useState<Busqueda | null>(null);
  const [buscando, startBuscar] = useTransition();
  const [guardando, startGuardar] = useTransition();
  const [persona, setPersona] = useState<PersonaForm>(PERSONA_VACIA);
  const [desde, setDesde] = useState(hoy);
  const primerSocial = planes.find((p) => p.tipo === "social" && p.activo);
  const [social, setSocial] = useState<PlanElegido | null>(
    primerSocial ? { plan_id: primerSocial.id, periodicidad: "mensual" } : null
  );
  const [elegidos, setElegidos] = useState<PlanElegido[]>([]);
  const [medio, setMedio] = useState<MedioForm>(MEDIO_VACIO);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function buscar(e?: React.FormEvent) {
    e?.preventDefault();
    const d = soloDigitos(cedula);
    if (d.length < 6) {
      setErrores({ cedula: "Ingresá la cédula completa" });
      return;
    }
    setErrores({});
    setError(null);
    startBuscar(async () => {
      const r = await buscarPorCedula(d);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const { persona: p, estado, alta } = r.data;
      if (!p) {
        setBusqueda({ tipo: "nueva" });
        setPersona({ ...PERSONA_VACIA, cedula: d });
        return;
      }
      setPersona({
        cedula: p.cedula,
        nombre: p.nombre,
        apellido: p.apellido,
        fecha_nacimiento: p.fecha_nacimiento ?? "",
        telefono: p.telefono ?? "",
        email: p.email ?? "",
        direccion: p.direccion ?? "",
        numero_socio: p.numero_socio ? String(p.numero_socio) : "",
        notas: p.notas ?? "",
      });
      setBusqueda(estado === "vigente" ? { tipo: "vigente", persona: p, alta } : { tipo: "reingreso", persona: p, alta });
    });
  }

  function reiniciar() {
    setBusqueda(null);
    setPersona(PERSONA_VACIA);
    setErrores({});
    setError(null);
  }

  const planesElegidos = useMemo(() => [...(social ? [social] : []), ...elegidos], [social, elegidos]);
  const porId = useMemo(() => new Map(planes.map((p) => [p.id, p])), [planes]);
  const totalMensual = planesElegidos.reduce((s, e) => {
    const p = porId.get(e.plan_id);
    if (!p?.precio) return s;
    return s + (e.periodicidad === "mensual" ? p.precio.importe_mensual : 0);
  }, 0);
  const sinPrecio = planesElegidos.filter((e) => !porId.get(e.plan_id)?.precio);

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = {
      persona: personaAInput(persona),
      desde,
      planes: planesElegidos,
      medio: medio.medio ? medioAInput(medio) : null,
    };
    const p = altaSchema.safeParse(input);
    if (!p.success) {
      const errs = {
        ...erroresPorCampo(p.error.issues, "persona"),
        ...Object.fromEntries(Object.entries(erroresPorCampo(p.error.issues, "medio")).map(([k, v]) => [k || "medio", v])),
        ...(erroresPorCampo(p.error.issues).desde ? { desde: erroresPorCampo(p.error.issues).desde } : {}),
      };
      setErrores(errs);
      toast.error(p.error.issues[0]?.message ?? "Revisá los datos");
      return;
    }
    setErrores({});
    startGuardar(async () => {
      const r = await darDeAlta(input);
      if (!r.ok) {
        setError(r.error);
        toast.error(r.error);
        return;
      }
      toast.success(r.data.reingreso ? "Reingreso registrado" : "Socio dado de alta");
      router.push(`/secretaria/socios/${r.data.id}`);
    });
  }

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
      <EncabezadoPagina
        eyebrow="Secretaría"
        titulo="Nuevo socio"
        descripcion="Alta o reingreso: buscá primero por cédula para no duplicar a la persona."
      />

      <Panel titulo="Cédula" icono={IdCard}>
        <form onSubmit={buscar} className="space-y-3 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Campo etiqueta="Cédula de identidad" error={errores.cedula} className="flex-1">
              <input
                value={cedula}
                onChange={(e) => {
                  setCedula(e.target.value);
                  if (busqueda) reiniciar();
                }}
                inputMode="numeric"
                autoFocus
                placeholder="1.234.567-8"
                aria-invalid={!!errores.cedula || undefined}
                className={cn(claseControl, "text-base tracking-wide sm:text-sm")}
              />
            </Campo>
            <Boton type="submit" pendiente={buscando} className="sm:w-36">
              {!buscando && <Search className="size-4" />}
              Buscar
            </Boton>
          </div>
          <AvisoCedula cedula={cedula} />
          <AnimatePresence mode="wait">
            {busqueda && (
              <motion.div
                key={busqueda.tipo}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm",
                  busqueda.tipo === "nueva" && "border-sky-200 bg-sky-50 text-sky-900",
                  busqueda.tipo === "reingreso" && "border-dorado-300 bg-dorado-50 text-dorado-900",
                  busqueda.tipo === "vigente" && "border-emerald-200 bg-emerald-50 text-emerald-900"
                )}
              >
                <div className="flex items-start gap-2.5">
                  {busqueda.tipo === "nueva" ? (
                    <UserPlus className="mt-0.5 size-4 shrink-0" />
                  ) : busqueda.tipo === "reingreso" ? (
                    <RotateCcw className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <UserCheck className="mt-0.5 size-4 shrink-0" />
                  )}
                  <div>
                    {busqueda.tipo === "nueva" && (
                      <>
                        <div className="font-medium">Persona nueva</div>
                        <div className="text-xs opacity-80">La cédula {formatCedula(cedula)} no está en el padrón.</div>
                      </>
                    )}
                    {busqueda.tipo === "reingreso" && (
                      <>
                        <div className="font-medium">
                          Reingreso: {busqueda.persona.nombre} {busqueda.persona.apellido}
                        </div>
                        <div className="text-xs opacity-80">
                          {busqueda.alta
                            ? `Ya fue socia/o (último alta ${formatFecha(busqueda.alta)}). Se abre un nuevo período como socio.`
                            : "Está en el padrón pero sin membresías: se registra su alta."}
                        </div>
                      </>
                    )}
                    {busqueda.tipo === "vigente" && (
                      <>
                        <div className="font-medium">
                          {busqueda.persona.nombre} {busqueda.persona.apellido} ya es socia/o
                        </div>
                        <div className="text-xs opacity-80">
                          Socio desde {busqueda.alta ? formatFecha(busqueda.alta) : "—"}. Para inscribirla a una disciplina usá su ficha.
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {busqueda.tipo === "vigente" && (
                  <BotonLink href={`/secretaria/socios/${busqueda.persona.id}`} variante="secundario">
                    Ir a la ficha
                    <ArrowRight className="size-4" />
                  </BotonLink>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </Panel>

      <AnimatePresence>
        {busqueda && busqueda.tipo !== "vigente" && (
          <motion.form
            onSubmit={guardar}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.4 }}
            className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]"
          >
            <div className="min-w-0 space-y-5">
              <Panel titulo="Datos personales" icono={UserRound} delay={0.05}>
                <div className="p-4">
                  <PersonaCampos
                    valor={persona}
                    onChange={setPersona}
                    errores={errores}
                    ayudaNumero={
                      busqueda.tipo === "reingreso" && busqueda.persona.numero_socio
                        ? "Conserva su número anterior si no lo cambiás."
                        : "Vacío: se asigna el siguiente."
                    }
                  />
                </div>
              </Panel>

              <Panel titulo="Alta" icono={CalendarDays} delay={0.1}>
                <div className="space-y-3 p-4">
                  <Campo
                    etiqueta="Fecha de alta"
                    error={errores.desde}
                    ayuda="Desde ese día es socia/o; las inscripciones empiezan la misma fecha."
                    className="sm:max-w-xs"
                  >
                    <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={claseControl} />
                  </Campo>
                  <Aviso visible={desde > hoy} tono="info">
                    Alta con fecha futura: figura como socio desde el {formatFecha(desde)}.
                  </Aviso>
                </div>
              </Panel>

              <Panel titulo="Cuota social y disciplinas" icono={Layers} delay={0.15}>
                <div className="p-4">
                  <PlanesCampos
                    planes={planes}
                    disciplinas={disciplinas}
                    social={social}
                    onSocial={setSocial}
                    elegidos={elegidos}
                    onElegidos={setElegidos}
                  />
                </div>
              </Panel>

              <Panel titulo="Medio de cobro" icono={CreditCard} delay={0.2}>
                <div className="p-4">
                  <MedioCobroCampos
                    valor={medio}
                    onChange={setMedio}
                    errores={errores}
                    disciplinas={disciplinas}
                    permitirNinguno
                  />
                </div>
              </Panel>
            </div>

            <div className="lg:sticky lg:top-4 lg:self-start">
              <Panel titulo="Resumen" delay={0.25}>
                <div className="space-y-3 p-4 text-sm">
                  <div>
                    <div className="font-medium">
                      {persona.nombre || persona.apellido ? `${persona.nombre} ${persona.apellido}` : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">CI {formatCedula(persona.cedula)}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {busqueda.tipo === "reingreso" ? "Reingreso" : "Alta"} desde el {formatFecha(desde)}
                  </div>
                  <ul className="space-y-1.5 border-t border-linea pt-3">
                    {planesElegidos.length === 0 && <li className="text-xs text-muted-foreground">Sin planes</li>}
                    {planesElegidos.map((e) => {
                      const p = porId.get(e.plan_id);
                      if (!p) return null;
                      return (
                        <li key={e.plan_id} className="flex justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate">
                            {p.disciplina ? `${p.disciplina} · ` : ""}
                            {p.nombre}
                            {e.periodicidad === "anual" ? " (anual)" : ""}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {p.precio
                              ? formatImporte(
                                  e.periodicidad === "anual"
                                    ? (p.precio.importe_anual ?? p.precio.importe_mensual * 12)
                                    : p.precio.importe_mensual,
                                  "UYU"
                                )
                              : "—"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {totalMensual > 0 && (
                    <div className="flex justify-between border-t border-linea pt-2 text-sm font-medium">
                      <span>Total mensual</span>
                      <span className="tabular-nums">{formatImporte(totalMensual, "UYU")}</span>
                    </div>
                  )}
                  <Aviso visible={sinPrecio.length > 0}>
                    Hay planes sin precio cargado: no van a generar cuota hasta que tesorería cargue el precio.
                  </Aviso>
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        key={error}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
                        exit={{ opacity: 0 }}
                        role="alert"
                        className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
                      >
                        {error}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <Boton type="submit" pendiente={guardando} className="w-full">
                    {!guardando && <UserPlus className="size-4" />}
                    {busqueda.tipo === "reingreso" ? "Registrar reingreso" : "Dar de alta"}
                  </Boton>
                </div>
              </Panel>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
