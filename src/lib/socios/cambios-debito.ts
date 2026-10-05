import type { ClienteSocios } from "./cuotas";

/**
 * Registro de cambios de las disciplinas (socios.cambios_disciplina) como lo
 * devuelve socios.cambios_debito: altas, bajas, tarjetas, planes, precios…
 * Lo que afecta al débito Visa queda "pendiente" hasta que tesorería lo carga
 * en el portal y lo marca aplicado. Nunca trae el número de tarjeta: solo si
 * hay uno pendiente de ver (`tarjeta_pendiente`).
 */

export type EstadoDebito = "no_aplica" | "pendiente" | "aplicado" | "descartado";

export type TipoCambio =
  | "alta"
  | "reingreso"
  | "baja_club"
  | "baja_anulada"
  | "inscripcion"
  | "fin_inscripcion"
  | "medio_cobro"
  | "tarjeta"
  | "datos"
  | "plan_nuevo"
  | "precio"
  | "cobro"
  | "representante";

/** Datos de antes/después: el detalle depende del tipo. */
export interface DatosCambio {
  cuota_mensual?: number | string | null;
  tarjeta?: string | null;
  vencimiento?: string | null;
  emisor?: string | null;
  titular?: string | null;
  titular_documento?: string | null;
  medio?: string | null;
  plan?: string | null;
  importe?: number | string | null;
  [clave: string]: unknown;
}

export interface CambioDebito {
  id: number;
  disciplina_id: number | null;
  disciplina: string | null;
  persona_id: number | null;
  persona: string | null;
  cedula: string | null;
  numero_socio: number | null;
  tipo: TipoCambio | string;
  descripcion: string;
  antes: DatosCambio | null;
  despues: DatosCambio | null;
  /** Desde cuándo rige. */
  vigencia: string | null;
  afecta_debito: boolean;
  estado_debito: EstadoDebito | string;
  aplicado_por_nombre: string | null;
  aplicado_at: string | null;
  notas_aplicacion: string | null;
  /** Hay un número de tarjeta completo para cargar en el portal. */
  tarjeta_pendiente: boolean;
  /** Cuántas veces se vio el número. */
  consultas: number;
  hecho_por_nombre: string | null;
  origen: "representante" | "club" | string;
  created_at: string;
}

export const NOMBRE_TIPO_CAMBIO: Record<string, string> = {
  alta: "Alta",
  reingreso: "Reingreso",
  baja_club: "Baja del club",
  baja_anulada: "Baja anulada",
  inscripcion: "Inscripción",
  fin_inscripcion: "Fin de inscripción",
  medio_cobro: "Medio de cobro",
  tarjeta: "Cambio de tarjeta",
  datos: "Datos personales",
  plan_nuevo: "Plan nuevo",
  precio: "Precio",
  cobro: "Cobro",
  representante: "Representante",
};

export const NOMBRE_ESTADO_DEBITO: Record<string, string> = {
  pendiente: "Pendiente",
  aplicado: "Cargado en Visa",
  descartado: "Descartado",
  no_aplica: "No va al débito",
};

/** Filtro de estado de la pantalla → parámetro de cambios_debito. */
export type FiltroEstadoCambios = "pendiente" | "aplicado" | "descartado" | "debito" | "todos";

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

/** "2027-08-31" o "2027-08" → "08/27". */
export function vencimientoCorto(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})/.exec(v);
  return m ? `${m[2]}/${m[1].slice(2)}` : v;
}

/** Cuota mensual de un cambio (lo nuevo o, si no, lo anterior). */
export function cuotaDelCambio(c: Pick<CambioDebito, "despues">): number | null {
  return num(c.despues?.cuota_mensual) ?? num(c.despues?.importe) ?? null;
}

function aCambio(f: Record<string, unknown>): CambioDebito {
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as DatosCambio) : null);
  return {
    id: Number(f.id),
    disciplina_id: f.disciplina_id == null ? null : Number(f.disciplina_id),
    disciplina: (f.disciplina as string | null) ?? null,
    persona_id: f.persona_id == null ? null : Number(f.persona_id),
    persona: (f.persona as string | null) ?? null,
    cedula: (f.cedula as string | null) ?? null,
    numero_socio: f.numero_socio == null ? null : Number(f.numero_socio),
    tipo: String(f.tipo ?? ""),
    descripcion: String(f.descripcion ?? ""),
    antes: obj(f.antes),
    despues: obj(f.despues),
    vigencia: (f.vigencia as string | null) ?? null,
    afecta_debito: !!f.afecta_debito,
    estado_debito: String(f.estado_debito ?? "no_aplica"),
    aplicado_por_nombre: (f.aplicado_por_nombre as string | null) ?? null,
    aplicado_at: (f.aplicado_at as string | null) ?? null,
    notas_aplicacion: (f.notas_aplicacion as string | null) ?? null,
    tarjeta_pendiente: !!f.tarjeta_pendiente,
    consultas: Number(f.consultas ?? 0),
    hecho_por_nombre: (f.hecho_por_nombre as string | null) ?? null,
    origen: String(f.origen ?? "club"),
    created_at: String(f.created_at ?? ""),
  };
}

/** Cambios del registro (más nuevos primero). La base exige tesorería, secretaría o Comisión Fiscal. */
export async function leerCambiosDebito(
  db: ClienteSocios,
  filtros: { desde?: string | null; hasta?: string | null; estado?: FiltroEstadoCambios | null; disciplina?: number | null } = {}
): Promise<CambioDebito[]> {
  const estado = !filtros.estado || filtros.estado === "todos" ? null : filtros.estado;
  const { data, error } = await db.rpc("cambios_debito", {
    p_desde: (filtros.desde ?? null) as string,
    p_hasta: (filtros.hasta ?? null) as string,
    p_estado: estado as string,
    p_disciplina: (filtros.disciplina ?? null) as number,
  });
  if (error) throw new Error(error.code === "42501" ? "No tenés permiso para ver los cambios" : error.message);
  return (Array.isArray(data) ? data : []).map((f) => aCambio(f as Record<string, unknown>));
}

// ------------------------------------------------------------
// Representantes
// ------------------------------------------------------------

export interface Representante {
  id: number;
  disciplina_id: number;
  nombre: string;
  email: string;
  telefono: string | null;
  cargo: string | null;
  recibe_liquidacion: boolean;
  acceso_panel: boolean;
  /** Tiene cuenta en el sitio (se vincula sola cuando la crea con ese correo). */
  tieneCuenta: boolean;
}

export async function leerRepresentantes(db: ClienteSocios, disciplina: number): Promise<Representante[]> {
  const { data, error } = await db
    .from("representantes")
    .select("id, disciplina_id, nombre, email, telefono, cargo, recibe_liquidacion, acceso_panel, perfil_id")
    .eq("disciplina_id", disciplina)
    .eq("activo", true)
    .order("nombre");
  if (error) throw new Error(error.code === "42501" ? "No tenés permiso para ver los representantes" : error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    disciplina_id: r.disciplina_id,
    nombre: r.nombre,
    email: r.email,
    telefono: r.telefono,
    cargo: r.cargo,
    recibe_liquidacion: r.recibe_liquidacion,
    acceso_panel: r.acceso_panel,
    tieneCuenta: !!r.perfil_id,
  }));
}
