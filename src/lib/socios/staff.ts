import { z } from "zod";
import type { SociosClient } from "./server";

/**
 * Staff (`socios.staff`): entrenadores, preparadores, delegados, dirigentes
 * y personal del club. La persona es la del padrón; cada vínculo es un
 * período con una función y un detalle (categoría, plantel). Lo paga cada
 * disciplina: acá no hay importes.
 *
 * Permisos (los controla la base): el staff de una disciplina lo gestionan
 * sus representantes y el club (secretaría, tesorería, super_admin); el
 * personal sin disciplina, secretaría. Ver docs/socios.md.
 *
 * Este archivo lo usan también los componentes de cliente: las lecturas
 * reciben el cliente ya creado.
 */

export const FUNCIONES_STAFF = [
  "coordinador",
  "entrenador",
  "asistente",
  "preparador_fisico",
  "delegado",
  "salud",
  "utilero",
  "dirigente",
  "administrativo",
  "mantenimiento",
  "otro",
] as const;
export type FuncionStaff = (typeof FUNCIONES_STAFF)[number];

export const NOMBRE_FUNCION_STAFF: Record<FuncionStaff, string> = {
  coordinador: "Coordinador/a",
  entrenador: "Entrenador/a",
  asistente: "Asistente técnico/a",
  preparador_fisico: "Preparador/a físico/a",
  delegado: "Delegado/a",
  salud: "Salud",
  utilero: "Utilero/a",
  dirigente: "Dirigente",
  administrativo: "Administrativo/a",
  mantenimiento: "Mantenimiento",
  otro: "Otro",
};

/** Plural para los títulos de grupo. */
export const GRUPO_FUNCION_STAFF: Record<FuncionStaff, string> = {
  coordinador: "Coordinación",
  entrenador: "Entrenadores",
  asistente: "Asistentes técnicos",
  preparador_fisico: "Preparación física",
  delegado: "Delegados",
  salud: "Salud",
  utilero: "Utilería",
  dirigente: "Dirigentes",
  administrativo: "Administración",
  mantenimiento: "Mantenimiento",
  otro: "Otros",
};

/** Ejemplos para el campo "detalle" según la función. */
export const AYUDA_DETALLE: Record<FuncionStaff, string> = {
  coordinador: "Ej.: Formativas, Femenino",
  entrenador: "Ej.: Primera, Sub-14, Arqueros",
  asistente: "Ej.: Primera, Sub-16",
  preparador_fisico: "Ej.: Plantel superior",
  delegado: "Ej.: Sub-18",
  salud: "Ej.: Médico, Fisioterapeuta, Nutricionista",
  utilero: "Ej.: Primera",
  dirigente: "Ej.: Presidente, Secretario, Tesorero",
  administrativo: "Ej.: Secretaría del club",
  mantenimiento: "Ej.: Cancha, Conserjería",
  otro: "Qué hace",
};

/** Funciones que se ofrecen para el personal sin disciplina. */
export const FUNCIONES_CLUB: FuncionStaff[] = ["administrativo", "mantenimiento", "salud", "coordinador", "otro"];

export type EstadoStaff = "vigente" | "programado" | "baja";

export interface MiembroStaff {
  id: number;
  persona_id: number;
  nombre: string;
  apellido: string;
  cedula: string;
  email: string | null;
  telefono: string | null;
  /** NULL: personal del club. */
  disciplina_id: number | null;
  disciplina: string | null;
  funcion: FuncionStaff;
  detalle: string | null;
  desde: string;
  hasta: string | null;
  motivo_fin: string | null;
  notas: string | null;
  estado: EstadoStaff;
  /** Socio del club hoy. */
  socio: boolean;
  con_cuenta: boolean;
}

export const nombreStaff = (s: Pick<MiembroStaff, "nombre" | "apellido">) => [s.apellido, s.nombre].filter(Boolean).join(", ");

/** "Entrenador/a · Sub-14" */
export const textoFuncion = (s: Pick<MiembroStaff, "funcion" | "detalle">) =>
  [NOMBRE_FUNCION_STAFF[s.funcion] ?? s.funcion, s.detalle].filter(Boolean).join(" · ");

// ------------------------------------------------------------
// Esquemas
// ------------------------------------------------------------

const esFecha = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
const fecha = z.string().refine(esFecha, "Fecha inválida");
const id = z.number().int().positive();
const textoOpc = (max: number) =>
  z
    .string()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null));
const email = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? v.trim().toLowerCase() : null))
  .refine((v) => v === null || z.email().safeParse(v).success, "Email inválido");
const funcion = z.enum(FUNCIONES_STAFF, { message: "Elegí la función" });

export const altaStaffSchema = z.object({
  /** null: personal del club (solo secretaría). */
  disciplina: id.nullable(),
  persona: z.object({
    cedula: z
      .string()
      .transform((v) => v.replace(/\D/g, ""))
      .refine((v) => v.length >= 6 && v.length <= 9, "Cédula inválida"),
    nombre: z.string().trim().min(1, "Falta el nombre").max(100),
    apellido: z.string().trim().min(1, "Falta el apellido").max(100),
    email,
    telefono: textoOpc(30),
  }),
  funcion,
  detalle: textoOpc(120),
  desde: fecha,
  notas: textoOpc(500),
});
export type AltaStaffInput = z.input<typeof altaStaffSchema>;

export const editarStaffSchema = z.object({
  staff: id,
  funcion,
  detalle: textoOpc(120),
  desde: fecha,
  notas: textoOpc(500),
  contacto: z.object({ email, telefono: textoOpc(30) }),
});

export const bajaStaffSchema = z.object({
  staff: id,
  hasta: fecha,
  motivo: textoOpc(300),
});

// ------------------------------------------------------------
// Lecturas
// ------------------------------------------------------------

type Rpc = { data: unknown; error: { message: string; code?: string } | null };

function exigir<T>(r: Rpc): T {
  if (r.error) throw new Error(r.error.code === "42501" ? "No tenés permiso para ver este staff" : r.error.message);
  return r.data as T;
}

/** Staff de una disciplina, con el histórico (se filtra en pantalla). */
export async function leerStaffDisciplina(db: SociosClient, disciplina: number): Promise<MiembroStaff[]> {
  return exigir<MiembroStaff[]>(await db.rpc("disc_staff", { p_disciplina: disciplina, p_historico: true })) ?? [];
}

/** Todo el staff del club (secretaría, tesorería, Comisión Fiscal). */
export async function leerStaffClub(db: SociosClient): Promise<MiembroStaff[]> {
  return exigir<MiembroStaff[]>(await db.rpc("staff_club", { p_historico: true })) ?? [];
}
