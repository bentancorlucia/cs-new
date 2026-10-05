"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw, Trash2, UserCog, UserMinus, UserPen, UserPlus, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha } from "@/lib/contabilidad/formato";
import { cedulaValida, formatCedula } from "@/lib/socios/esquemas";
import {
  AYUDA_DETALLE,
  FUNCIONES_CLUB,
  FUNCIONES_STAFF,
  NOMBRE_FUNCION_STAFF,
  altaStaffSchema,
  editarStaffSchema,
  nombreStaff,
  textoFuncion,
  type FuncionStaff,
  type MiembroStaff,
} from "@/lib/socios/staff";
import { altaStaff, anularBajaStaff, bajaStaff, editarStaff, eliminarStaff } from "@/app/(dashboard)/secretaria/staff/actions";
import { Campo, DialogoAccion, Explicacion, claseControl } from "@/components/socios/cuotas/ui";
import { erroresPorCampo } from "@/components/socios/secretaria/campos";

export interface DisciplinaStaff {
  id: number;
  nombre: string;
}

/** Alguien que ya conocemos (socio de la disciplina o staff): al tipear su cédula se completan sus datos. */
export interface PersonaConocida {
  cedula: string;
  nombre: string;
  apellido: string;
  email: string | null;
  telefono: string | null;
}

export type AccionStaff =
  | { tipo: "alta" }
  | { tipo: "editar"; miembro: MiembroStaff }
  | { tipo: "baja"; miembro: MiembroStaff }
  | { tipo: "anular_baja"; miembro: MiembroStaff }
  | { tipo: "eliminar"; miembro: MiembroStaff };

type Res = { ok: true } | { ok: false; error: string };
const res = (r: { ok: boolean; error?: string }): Res => (r.ok ? { ok: true } : { ok: false, error: r.error ?? "Error" });

interface Comun {
  hoy: string;
  onClose: () => void;
}

/**
 * Diálogos del staff. En el panel de una disciplina, `disciplina` es fija;
 * en secretaría se elige entre `disciplinas` (o personal del club, si
 * `permitirClub`).
 */
export function DialogosStaff({
  accion,
  disciplina,
  disciplinas = [],
  permitirClub = false,
  conocidas = [],
  ...comun
}: Comun & {
  accion: AccionStaff | null;
  disciplina?: DisciplinaStaff;
  disciplinas?: DisciplinaStaff[];
  permitirClub?: boolean;
  conocidas?: PersonaConocida[];
}) {
  if (!accion) return null;
  switch (accion.tipo) {
    case "alta":
      return <DialogoAlta {...comun} disciplina={disciplina} disciplinas={disciplinas} permitirClub={permitirClub} conocidas={conocidas} />;
    case "editar":
      return <DialogoEditar {...comun} miembro={accion.miembro} />;
    case "baja":
      return <DialogoBaja {...comun} miembro={accion.miembro} />;
    case "anular_baja":
      return <DialogoAnularBaja {...comun} miembro={accion.miembro} />;
    case "eliminar":
      return <DialogoEliminar {...comun} miembro={accion.miembro} />;
  }
}

function Cabecera({ miembro }: { miembro: MiembroStaff }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-bordo-100 bg-bordo-50/50 px-3 py-2">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bordo-800 text-white">
        <UserRound className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{nombreStaff(miembro)}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {textoFuncion(miembro)} · {miembro.disciplina ?? "Personal del club"}
        </div>
      </div>
    </div>
  );
}

/** Botones de función (las del club, primero si no hay disciplina). */
function SelectorFuncion({
  valor,
  onChange,
  club,
  error,
}: {
  valor: FuncionStaff | "";
  onChange: (f: FuncionStaff) => void;
  club: boolean;
  error?: string;
}) {
  const base = club ? FUNCIONES_CLUB : FUNCIONES_STAFF.filter((f) => f !== "administrativo" && f !== "mantenimiento");
  // Al editar, la función actual siempre se ofrece (aunque no sea de la lista habitual).
  const opciones = valor && !base.includes(valor) ? [...base, valor] : base;
  return (
    <div className="space-y-1.5">
      <div className="px-0.5 text-[10px] uppercase tracking-editorial text-muted-foreground">Función</div>
      <motion.div layout className="flex flex-wrap gap-1.5">
        {opciones.map((f) => {
          const on = valor === f;
          return (
            <motion.button
              key={f}
              type="button"
              layout
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onChange(f)}
              aria-pressed={on}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                on ? "border-bordo-800 bg-bordo-800 text-white shadow-sm" : "border-linea bg-white text-foreground hover:border-bordo-200"
              )}
            >
              {NOMBRE_FUNCION_STAFF[f]}
            </motion.button>
          );
        })}
      </motion.div>
      {error && <p className="px-0.5 text-xs text-rose-700">{error}</p>}
    </div>
  );
}

// ------------------------------------------------------------
// Alta
// ------------------------------------------------------------

const CLUB = "club";

function DialogoAlta({
  hoy,
  onClose,
  disciplina,
  disciplinas,
  permitirClub,
  conocidas,
}: Comun & { disciplina?: DisciplinaStaff; disciplinas: DisciplinaStaff[]; permitirClub: boolean; conocidas: PersonaConocida[] }) {
  const [destino, setDestino] = useState<string>(disciplina ? String(disciplina.id) : "");
  const [persona, setPersona] = useState({ cedula: "", nombre: "", apellido: "", email: "", telefono: "" });
  const [funcion, setFuncion] = useState<FuncionStaff | "">("");
  const [detalle, setDetalle] = useState("");
  const [desde, setDesde] = useState(hoy);
  const [notas, setNotas] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [conocida, setConocida] = useState(false);

  const club = destino === CLUB;
  const disciplinaId = disciplina ? disciplina.id : club || destino === "" ? null : Number(destino);
  const digitos = persona.cedula.replace(/\D/g, "");
  const listo = digitos.length >= 7;
  const nombreDestino = disciplina?.nombre ?? (club ? "el personal del club" : disciplinas.find((d) => String(d.id) === destino)?.nombre);

  function cambiarCedula(v: string) {
    const d = v.replace(/\D/g, "").slice(0, 9);
    const p = conocidas.find((c) => c.cedula.replace(/\D/g, "") === d);
    if (p) {
      setPersona({ cedula: d, nombre: p.nombre, apellido: p.apellido, email: p.email ?? "", telefono: p.telefono ?? "" });
      setConocida(true);
    } else {
      setPersona((x) => (conocida ? { cedula: d, nombre: "", apellido: "", email: "", telefono: "" } : { ...x, cedula: d }));
      setConocida(false);
    }
  }

  const set = (k: keyof typeof persona) => (e: React.ChangeEvent<HTMLInputElement>) => setPersona({ ...persona, [k]: e.target.value });

  function cambiarDestino(v: string) {
    setDestino(v);
    // Las funciones del club y las de una disciplina no son las mismas.
    setFuncion("");
  }

  async function ejecutar(): Promise<Res> {
    if (!disciplina && destino === "") {
      setErrores({ destino: "Elegí la disciplina" });
      return { ok: false, error: "Elegí la disciplina" };
    }
    const input = { disciplina: disciplinaId, persona, funcion, detalle, desde, notas };
    const p = altaStaffSchema.safeParse(input);
    if (!p.success) {
      setErrores({ ...erroresPorCampo(p.error.issues, "persona"), ...erroresPorCampo(p.error.issues) });
      return { ok: false, error: p.error.issues[0]?.message ?? "Revisá los datos" };
    }
    setErrores({});
    return res(await altaStaff(input));
  }

  return (
    <DialogoAccion
      open
      onOpenChange={(o) => !o && onClose()}
      icono={UserPlus}
      titulo="Agregar al staff"
      descripcion={
        nombreDestino
          ? `Se suma a ${disciplina ? disciplina.nombre : nombreDestino}. No hace falta que sea socio del club.`
          : "Entrenadores, preparadores, delegados, dirigentes y personal. No hace falta que sea socio del club."
      }
      textoAccion="Agregar"
      mensaje="Agregado al staff"
      deshabilitado={!listo || funcion === ""}
      ancho="sm:max-w-xl"
      ejecutar={ejecutar}
    >
      {!disciplina && (
        <Campo etiqueta="Dónde" error={errores.destino}>
          <select value={destino} onChange={(e) => cambiarDestino(e.target.value)} className={claseControl}>
            <option value="">Elegí…</option>
            {permitirClub && <option value={CLUB}>Personal del club (sin disciplina)</option>}
            {disciplinas.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </Campo>
      )}

      <Campo etiqueta="Cédula" error={errores.cedula} ayuda="Si ya está en el padrón del club, se usan sus datos.">
        <input
          value={persona.cedula}
          onChange={(e) => cambiarCedula(e.target.value)}
          inputMode="numeric"
          autoFocus={!!disciplina}
          autoComplete="off"
          placeholder="Sin puntos ni guión"
          aria-invalid={!!errores.cedula || undefined}
          className={cn(claseControl, "text-base tabular-nums")}
        />
      </Campo>
      {listo && !cedulaValida(digitos) && (
        <Explicacion>El dígito verificador no coincide: revisá la cédula (si es un documento extranjero podés seguir igual).</Explicacion>
      )}

      <AnimatePresence initial={false}>
        {listo && (
          <motion.div
            key="resto"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4 overflow-hidden"
          >
            {conocida && (
              <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900">Ya la conocemos: completamos sus datos.</p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo etiqueta="Nombre" error={errores.nombre}>
                <input value={persona.nombre} onChange={set("nombre")} autoComplete="off" aria-invalid={!!errores.nombre || undefined} className={claseControl} />
              </Campo>
              <Campo etiqueta="Apellido" error={errores.apellido}>
                <input value={persona.apellido} onChange={set("apellido")} autoComplete="off" aria-invalid={!!errores.apellido || undefined} className={claseControl} />
              </Campo>
              <Campo etiqueta="Email" error={errores.email}>
                <input type="email" inputMode="email" value={persona.email} onChange={set("email")} autoComplete="off" className={claseControl} />
              </Campo>
              <Campo etiqueta="Teléfono" error={errores.telefono}>
                <input inputMode="tel" value={persona.telefono} onChange={set("telefono")} autoComplete="off" className={claseControl} />
              </Campo>
            </div>

            <SelectorFuncion valor={funcion} onChange={setFuncion} club={club} error={errores.funcion} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo etiqueta="Detalle (opcional)" error={errores.detalle} ayuda={funcion ? AYUDA_DETALLE[funcion] : "Categoría, plantel o cargo"}>
                <input value={detalle} onChange={(e) => setDetalle(e.target.value)} autoComplete="off" maxLength={120} className={claseControl} />
              </Campo>
              <Campo etiqueta="Desde" error={errores.desde}>
                <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={claseControl} />
              </Campo>
            </div>

            <Campo etiqueta="Notas (opcional)" error={errores.notas}>
              <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} maxLength={500} className={cn(claseControl, "h-auto py-2")} />
            </Campo>
          </motion.div>
        )}
      </AnimatePresence>
    </DialogoAccion>
  );
}

// ------------------------------------------------------------
// Edición
// ------------------------------------------------------------

function DialogoEditar({ onClose, miembro }: Comun & { miembro: MiembroStaff }) {
  const [funcion, setFuncion] = useState<FuncionStaff | "">(miembro.funcion);
  const [detalle, setDetalle] = useState(miembro.detalle ?? "");
  const [desde, setDesde] = useState(miembro.desde);
  const [notas, setNotas] = useState(miembro.notas ?? "");
  const [contacto, setContacto] = useState({ email: miembro.email ?? "", telefono: miembro.telefono ?? "" });
  const [errores, setErrores] = useState<Record<string, string>>({});

  async function ejecutar(): Promise<Res> {
    const input = { staff: miembro.id, funcion, detalle, desde, notas, contacto };
    const p = editarStaffSchema.safeParse(input);
    if (!p.success) {
      setErrores({ ...erroresPorCampo(p.error.issues, "contacto"), ...erroresPorCampo(p.error.issues) });
      return { ok: false, error: p.error.issues[0]?.message ?? "Revisá los datos" };
    }
    setErrores({});
    return res(await editarStaff(input));
  }

  return (
    <DialogoAccion
      open
      onOpenChange={(o) => !o && onClose()}
      icono={UserPen}
      titulo="Editar"
      textoAccion="Guardar"
      mensaje="Cambios guardados"
      ancho="sm:max-w-xl"
      ejecutar={ejecutar}
    >
      <Cabecera miembro={miembro} />
      <SelectorFuncion
        valor={funcion}
        onChange={setFuncion}
        club={miembro.disciplina_id === null}
        error={errores.funcion}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Detalle" error={errores.detalle} ayuda={funcion ? AYUDA_DETALLE[funcion] : undefined}>
          <input value={detalle} onChange={(e) => setDetalle(e.target.value)} autoComplete="off" maxLength={120} className={claseControl} />
        </Campo>
        <Campo etiqueta="Desde" error={errores.desde}>
          <input type="date" value={desde} max={miembro.hasta ?? undefined} onChange={(e) => setDesde(e.target.value)} className={claseControl} />
        </Campo>
        <Campo etiqueta="Email" error={errores.email}>
          <input
            type="email"
            inputMode="email"
            value={contacto.email}
            onChange={(e) => setContacto({ ...contacto, email: e.target.value })}
            autoComplete="off"
            className={claseControl}
          />
        </Campo>
        <Campo etiqueta="Teléfono" error={errores.telefono}>
          <input
            inputMode="tel"
            value={contacto.telefono}
            onChange={(e) => setContacto({ ...contacto, telefono: e.target.value })}
            autoComplete="off"
            className={claseControl}
          />
        </Campo>
      </div>
      <Campo etiqueta="Notas" error={errores.notas}>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} maxLength={500} className={cn(claseControl, "h-auto py-2")} />
      </Campo>
      <Explicacion>El email y el teléfono son los de la persona en el padrón del club: se actualizan en todos lados.</Explicacion>
    </DialogoAccion>
  );
}

// ------------------------------------------------------------
// Baja, anulación y quitar
// ------------------------------------------------------------

function DialogoBaja({ hoy, onClose, miembro }: Comun & { miembro: MiembroStaff }) {
  const [hasta, setHasta] = useState(hoy < miembro.desde ? miembro.desde : hoy);
  const [motivo, setMotivo] = useState("");
  return (
    <DialogoAccion
      open
      onOpenChange={(o) => !o && onClose()}
      icono={UserMinus}
      titulo="Dar de baja del staff"
      destructivo
      textoAccion="Dar de baja"
      mensaje="Baja registrada"
      descripcion="Deja de figurar en el staff desde el día siguiente. Queda en el histórico."
      ejecutar={async () => res(await bajaStaff({ staff: miembro.id, hasta, motivo }))}
    >
      <Cabecera miembro={miembro} />
      <Campo etiqueta="Último día">
        <input type="date" value={hasta} min={miembro.desde} onChange={(e) => setHasta(e.target.value)} className={claseControl} />
      </Campo>
      <Campo etiqueta="Motivo (opcional)">
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: terminó la temporada, renunció…" className={claseControl} />
      </Campo>
    </DialogoAccion>
  );
}

function DialogoAnularBaja({ onClose, miembro }: Comun & { miembro: MiembroStaff }) {
  return (
    <DialogoAccion
      open
      onOpenChange={(o) => !o && onClose()}
      icono={RotateCcw}
      titulo="Anular la baja"
      textoAccion="Anular la baja"
      mensaje="Vuelve a estar en el staff"
      descripcion={`Tenía baja el ${formatFecha(miembro.hasta)}${miembro.motivo_fin ? ` (${miembro.motivo_fin})` : ""}. Vuelve a figurar en el staff.`}
      ejecutar={async () => res(await anularBajaStaff(miembro.id))}
    >
      <Cabecera miembro={miembro} />
    </DialogoAccion>
  );
}

function DialogoEliminar({ onClose, miembro }: Comun & { miembro: MiembroStaff }) {
  return (
    <DialogoAccion
      open
      onOpenChange={(o) => !o && onClose()}
      icono={Trash2}
      titulo="Quitar del staff"
      destructivo
      textoAccion="Quitar"
      mensaje="Quitado del staff"
      descripcion="Solo si se cargó por error: no queda en el histórico (sí en el registro de cambios). Si dejó de trabajar, usá Dar de baja."
      ejecutar={async () => res(await eliminarStaff(miembro.id))}
    >
      <Cabecera miembro={miembro} />
      <p className="text-[11px] text-muted-foreground">
        <UserCog className="mr-1 inline size-3" />
        CI {formatCedula(miembro.cedula)}
      </p>
    </DialogoAccion>
  );
}
