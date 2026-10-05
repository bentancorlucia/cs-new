import { z } from "zod";

/**
 * Esquemas y textos del padrón de socios, compartidos entre los
 * formularios (cliente) y las Server Actions. Las reglas de fondo viven en
 * la base (schema `socios`, ver docs/socios.md): acá solo se valida la
 * forma de los datos antes de llamar a las funciones.
 */

export const MEDIOS_COBRO = ["debito_visa", "transferencia_club", "transferencia_disciplina", "efectivo"] as const;
export type MedioCobro = (typeof MEDIOS_COBRO)[number];

export const NOMBRE_MEDIO: Record<string, string> = {
  debito_visa: "Débito Visa",
  transferencia_club: "Transferencia al club",
  transferencia_disciplina: "Transferencia a la disciplina",
  efectivo: "Efectivo",
  liquidacion_disciplina: "A cargo de la disciplina",
};

export const NOMBRE_PERIODICIDAD: Record<string, string> = {
  mensual: "Mensual",
  anual: "Anual",
  unica: "Única",
};

export const NOMBRE_TIPO_PLAN: Record<string, string> = {
  social: "Cuota social",
  disciplina: "Disciplina",
};

/** Solo dígitos. */
export function soloDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

/**
 * Dígito verificador de la cédula uruguaya: los primeros 7 dígitos (con
 * ceros a la izquierda) por 2,9,8,7,6,3,4; el verificador es lo que le
 * falta a la suma para llegar a la decena siguiente.
 */
export function cedulaValida(cedula: string): boolean {
  const d = soloDigitos(cedula);
  if (d.length < 7 || d.length > 8) return false;
  const c = d.padStart(8, "0");
  const pesos = [2, 9, 8, 7, 6, 3, 4];
  const suma = pesos.reduce((s, p, i) => s + p * Number(c[i]), 0);
  return (10 - (suma % 10)) % 10 === Number(c[7]);
}

/** 12345672 → "1.234.567-2" */
export function formatCedula(cedula: string | null | undefined): string {
  const d = soloDigitos(cedula);
  if (d.length < 2) return d;
  const cuerpo = d.slice(0, -1);
  const verificador = d.slice(-1);
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${verificador}`;
}

const esFecha = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
export const fecha = z.string().refine(esFecha, "Fecha inválida");
const fechaOpcional = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || esFecha(v), "Fecha inválida");

const textoOpcional = (max: number) =>
  z
    .string()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null));

export const cedulaSchema = z
  .string()
  .transform(soloDigitos)
  .refine((v) => v.length >= 6 && v.length <= 9, "Cédula inválida");

export const personaSchema = z.object({
  cedula: cedulaSchema,
  nombre: z.string().trim().min(1, "Falta el nombre").max(100),
  apellido: z.string().trim().min(1, "Falta el apellido").max(100),
  fecha_nacimiento: fechaOpcional,
  telefono: textoOpcional(30),
  email: z
    .string()
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim().toLowerCase() : null))
    .refine((v) => v === null || z.email().safeParse(v).success, "Email inválido"),
  direccion: textoOpcional(200),
  numero_socio: z
    .union([z.number(), z.string()])
    .nullish()
    .transform((v) => (v === null || v === undefined || v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v > 0), "Número de socio inválido"),
  notas: textoOpcional(2000),
});
export type PersonaInput = z.input<typeof personaSchema>;
export type Persona = z.output<typeof personaSchema>;

/** "MM/AAAA" → "AAAA-MM-01" (o null si no es válido). */
export function vencimientoTarjeta(v: string | null | undefined): string | null {
  const m = (v ?? "").trim().match(/^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/);
  if (!m) return null;
  const mes = Number(m[1]);
  const anio = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  if (mes < 1 || mes > 12 || anio < 2000 || anio > 2100) return null;
  return `${anio}-${String(mes).padStart(2, "0")}-01`;
}

/** "AAAA-MM-01" → "MM/AAAA" */
export function formatVencimiento(iso: string | null | undefined): string {
  if (!iso) return "";
  return `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export const medioSchema = z
  .object({
    medio: z.enum(MEDIOS_COBRO, { message: "Elegí el medio de cobro" }),
    disciplina_id: z.number().int().positive().nullish(),
    tarjeta_ultimos4: z.string().nullish(),
    tarjeta_vencimiento: z.string().nullish(),
    titular_otro: z.boolean().optional(),
    titular_documento: textoOpcional(20),
    titular_nombre: textoOpcional(120),
  })
  .superRefine((m, ctx) => {
    if (m.medio === "transferencia_disciplina" && !m.disciplina_id) {
      ctx.addIssue({ code: "custom", path: ["disciplina_id"], message: "Elegí la disciplina" });
    }
    if (m.medio === "debito_visa") {
      if (!/^\d{4}$/.test(m.tarjeta_ultimos4 ?? "")) {
        ctx.addIssue({ code: "custom", path: ["tarjeta_ultimos4"], message: "Los últimos 4 dígitos de la tarjeta" });
      }
      if (!vencimientoTarjeta(m.tarjeta_vencimiento)) {
        ctx.addIssue({ code: "custom", path: ["tarjeta_vencimiento"], message: "Vencimiento como MM/AAAA" });
      }
      if (m.titular_otro && (!m.titular_documento || !m.titular_nombre)) {
        ctx.addIssue({ code: "custom", path: ["titular_nombre"], message: "Nombre y documento del titular" });
      }
    }
  })
  .transform((m) => {
    const visa = m.medio === "debito_visa";
    return {
      medio: m.medio,
      disciplina_id: m.medio === "transferencia_disciplina" ? (m.disciplina_id ?? null) : null,
      tarjeta_ultimos4: visa ? (m.tarjeta_ultimos4 ?? null) : null,
      tarjeta_vencimiento: visa ? vencimientoTarjeta(m.tarjeta_vencimiento) : null,
      titular_documento: visa && m.titular_otro ? soloDigitos(m.titular_documento) || m.titular_documento : null,
      titular_nombre: visa && m.titular_otro ? m.titular_nombre : null,
    };
  });
export type MedioInput = z.input<typeof medioSchema>;

const periodicidad = z.enum(["mensual", "anual"]);

export const planElegidoSchema = z.object({
  plan_id: z.number().int().positive(),
  periodicidad,
});

export const altaSchema = z.object({
  persona: personaSchema,
  desde: fecha,
  planes: z.array(planElegidoSchema).max(20),
  medio: medioSchema.nullable(),
});
export type AltaInput = z.input<typeof altaSchema>;

export const inscribirSchema = z.object({
  persona_id: z.number().int().positive(),
  plan_id: z.number().int().positive({ message: "Elegí el plan" }),
  desde: fecha,
  periodicidad,
});

export const cambiarPlanSchema = z.object({
  suscripcion_id: z.number().int().positive(),
  plan_id: z.number().int().positive({ message: "Elegí la nueva categoría" }),
  desde: fecha,
  periodicidad,
});

export const finalizarSchema = z.object({
  suscripcion_id: z.number().int().positive(),
  hasta: fecha,
  motivo: textoOpcional(300),
});

export const cambiarMedioSchema = z.object({
  persona_id: z.number().int().positive(),
  desde: fecha,
  medio: medioSchema,
});

export const bajaSchema = z.object({
  persona_id: z.number().int().positive(),
  hasta: fecha,
  motivo_id: z.number().int().positive({ message: "Elegí el motivo" }),
  notas: textoOpcional(1000),
  anular_deuda: z.boolean(),
});

export const planSchema = z.object({
  id: z.number().int().positive().optional(),
  nombre: z.string().trim().min(1, "Falta el nombre").max(120),
  tipo: z.enum(["social", "disciplina"]),
  disciplina_id: z.number().int().positive().nullish(),
  permite_anual: z.boolean(),
  activo: z.boolean(),
}).superRefine((p, ctx) => {
  if (p.tipo === "disciplina" && !p.disciplina_id) {
    ctx.addIssue({ code: "custom", path: ["disciplina_id"], message: "Elegí la disciplina" });
  }
});
export type PlanInput = z.input<typeof planSchema>;

export const precioSchema = z
  .object({
    id: z.number().int().positive().optional(),
    plan_id: z.number().int().positive(),
    /** "AAAA-MM" */
    mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Elegí el mes"),
    importe_mensual: z.number({ message: "Importe inválido" }).positive("El importe mensual tiene que ser mayor que cero"),
    importe_anual: z.number().positive("El importe anual tiene que ser mayor que cero").nullish(),
  });
export type PrecioInput = z.input<typeof precioSchema>;

/** Para comparar nombres de planes y columnas de Excel: minúsculas, sin tildes ni espacios de más. */
export function normalizarTexto(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
