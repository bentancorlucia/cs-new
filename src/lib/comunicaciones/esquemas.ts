import { z } from "zod";

/**
 * Validación y textos de comunicaciones (cliente y servidor). Las reglas
 * de fondo las vuelve a aplicar la base.
 */

export const REGEX_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const REGEX_CLAVE = /^[a-z0-9_]+$/;

// ------------------------------------------------------------
// Variables de las plantillas (las que arma audiencia_socios)
// ------------------------------------------------------------

export const VARIABLES = [
  { clave: "nombre", etiqueta: "Nombre", ejemplo: "María" },
  { clave: "apellido", etiqueta: "Apellido", ejemplo: "Pérez" },
  { clave: "numero_socio", etiqueta: "Número de socio", ejemplo: "1234" },
  { clave: "disciplinas", etiqueta: "Disciplinas", ejemplo: "Hockey, Básquetbol" },
  { clave: "cuotas_vencidas", etiqueta: "Cuotas vencidas", ejemplo: "2" },
  { clave: "deuda_vencida", etiqueta: "Deuda vencida", ejemplo: "$ 3.400,00" },
] as const;

export const CLAVES_VARIABLES: string[] = VARIABLES.map((v) => v.clave);

export const VARIABLES_EJEMPLO: Record<string, string> = Object.fromEntries(
  VARIABLES.map((v) => [v.clave, v.ejemplo])
);

/** Para la vista previa del pie con enlace de baja (el real va firmado por mensaje). */
export const URL_BAJA_EJEMPLO = "https://www.clubseminario.com.uy/baja/ejemplo";

// ------------------------------------------------------------
// Nombres
// ------------------------------------------------------------

export type Categoria = "institucional" | "difusion";

export const CATEGORIAS: Record<Categoria, { nombre: string; descripcion: string }> = {
  institucional: {
    nombre: "Institucional",
    descripcion: "Cuotas, avisos y trámites del socio: llega igual aunque se haya dado de baja de la difusión.",
  },
  difusion: {
    nombre: "Difusión",
    descripcion: "Novedades, eventos, saludos: lleva enlace de baja y no llega a quien se dio de baja.",
  },
};

export const NOMBRE_ESTADO_ENVIO: Record<string, string> = {
  borrador: "Borrador",
  aprobado: "Aprobado",
  cancelado: "Cancelado",
};

export const NOMBRE_ESTADO_MENSAJE: Record<string, string> = {
  pendiente: "Pendiente",
  enviando: "Enviando",
  enviado: "Enviado",
  fallido: "Fallido",
  omitido: "Omitido",
  cancelado: "Cancelado",
};

export const ESTADOS_MENSAJE = ["pendiente", "enviando", "enviado", "fallido", "omitido", "cancelado"] as const;

export const NOMBRE_ORIGEN: Record<string, string> = {
  manual: "Manual",
  transaccional: "Transaccional",
  automatizacion: "Automatización",
};

export const NOMBRE_ALCANCE: Record<string, string> = {
  difusion: "Solo difusión",
  total: "Todo (también institucional)",
};

export const NOMBRE_MOTIVO_BAJA: Record<string, string> = {
  baja: "Pidió la baja",
  rebote: "Rebote permanente",
  queja: "Queja / spam",
  manual: "Otro",
};

export const NOMBRE_ORIGEN_BAJA: Record<string, string> = {
  enlace: "Enlace del mail",
  un_clic: "Baja en un clic",
  manual: "Carga manual",
};

export const MEDIOS_COBRO: Record<string, string> = {
  debito_visa: "Débito VISA",
  transferencia_club: "Transferencia al club",
  transferencia_disciplina: "Transferencia a la disciplina",
  efectivo: "Efectivo",
};

export const NOMBRE_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// ------------------------------------------------------------
// Esquemas
// ------------------------------------------------------------

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Dirección demasiado larga")
  .regex(REGEX_EMAIL, "Dirección de correo inválida");
const categoria = z.enum(["institucional", "difusion"], { message: "Elegí la categoría" });

export const filtroAudienciaSchema = z.object({
  vigentes: z.boolean().default(true),
  disciplinas: z.array(z.number().int().positive()).max(100).optional(),
  con_deuda: z.boolean().optional(),
  medio: z.enum(Object.keys(MEDIOS_COBRO) as [string, ...string[]]).optional(),
  cumple_mes: z.number().int().min(1).max(12).optional(),
  cumple_hoy: z.boolean().optional(),
  alta_desde: fecha.optional(),
});
export type FiltroAudiencia = z.input<typeof filtroAudienciaSchema>;

export const audienciaSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("socios"), filtro: filtroAudienciaSchema }),
  z.object({ tipo: z.literal("lista"), texto: z.string().max(500_000, "La lista es demasiado larga") }),
]);
export type Audiencia = z.input<typeof audienciaSchema>;

export const contenidoSchema = z.object({
  nombre: z.string().trim().max(200).optional(),
  plantilla_id: z.string().uuid().nullable().optional(),
  categoria,
  asunto: z.string().trim().min(1, "Falta el asunto").max(300, "El asunto es demasiado largo"),
  cuerpo: z.string().trim().min(1, "Falta el texto del mensaje").max(50_000, "El mensaje es demasiado largo"),
});
export type Contenido = z.input<typeof contenidoSchema>;

export const crearEnvioSchema = z.object({
  audiencia: audienciaSchema,
  contenido: contenidoSchema,
});

export const aprobarSchema = z.object({
  id: z.string().uuid(),
  /** ISO con zona; vacío = ahora. */
  programado_para: z.string().datetime({ offset: true }).nullable().optional(),
});

export const plantillaSchema = z.object({
  clave: z
    .string()
    .trim()
    .min(2, "La clave es demasiado corta")
    .max(60, "La clave es demasiado larga")
    .regex(REGEX_CLAVE, "La clave va en minúsculas, números y guión bajo (ej: aviso_torneo)"),
  nombre: z.string().trim().min(1, "Falta el nombre").max(120),
  categoria,
  asunto: z.string().trim().min(1, "Falta el asunto").max(300),
  cuerpo: z.string().trim().min(1, "Falta el texto").max(50_000),
  activa: z.boolean(),
});
export type PlantillaInput = z.input<typeof plantillaSchema>;

export const supresionSchema = z.object({
  email,
  alcance: z.enum(["difusion", "total"]),
  motivo: z.enum(["baja", "rebote", "queja", "manual"]),
  notas: z.string().trim().max(500).optional(),
});
export type SupresionInput = z.input<typeof supresionSchema>;

export const configSchema = z.object({
  remitente_nombre: z.string().trim().min(1, "Falta el nombre del remitente").max(120),
  remitente_email: email,
  responder_a: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .refine((v) => v === "" || REGEX_EMAIL.test(v), "Dirección de respuesta inválida")
    .transform((v) => v || null),
  limite_por_hora: z.number().int().min(1, "Mínimo 1 por hora").max(100_000),
  limite_por_tanda: z.number().int().min(1, "Mínimo 1 por tanda").max(200, "Máximo 200 por tanda"),
  pie: z
    .string()
    .trim()
    .max(1000)
    .transform((v) => v || null),
});
export type ConfigInput = z.input<typeof configSchema>;

export const whatsappSchema = z.object({
  numero: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s+\-()]/g, ""))
    .refine((v) => v === "" || /^[0-9]{8,15}$/.test(v), "Formato internacional sin +, ej: 59899123456")
    .refine((v) => v === "" || !/^0/.test(v), "Sin el 0 inicial: 598 + el celular sin 0 (ej: 59899123456)")
    .transform((v) => v || null),
  pedido_listo: z.string().trim().min(1, "Falta el mensaje de pedido listo").max(1000),
  consulta: z.string().trim().min(1, "Falta el mensaje de consulta").max(1000),
});
export type WhatsAppInput = z.input<typeof whatsappSchema>;

export const automatizacionSchema = z.object({
  clave: z.string().regex(REGEX_CLAVE),
  activa: z.boolean(),
  modo: z.enum(["auto", "asistida"]),
  plantilla_clave: z.string().regex(REGEX_CLAVE, "Elegí una plantilla"),
  dia_del_mes: z.number().int().min(1, "Entre 1 y 28").max(28, "Entre 1 y 28").optional(),
});
export type AutomatizacionInput = z.input<typeof automatizacionSchema>;

// ------------------------------------------------------------
// Lista pegada de direcciones
// ------------------------------------------------------------

/**
 * Acepta una dirección por línea o separadas por coma / punto y coma, con
 * o sin nombre: "María Pérez <maria@x.com>", "maria@x.com, María".
 */
export function parsearListaEmails(texto: string) {
  const validos = new Map<string, { email: string; nombre: string | null }>();
  const invalidos: string[] = [];
  let repetidos = 0;
  const limpiarNombre = (n: string) => n.replace(/["'<>]/g, "").replace(/\s+/g, " ").trim() || null;

  function agregar(crudo: string, nombre: string | null, original: string) {
    const e = crudo.replace(/^mailto:/i, "").trim().toLowerCase();
    if (!REGEX_EMAIL.test(e) || e.length > 254) {
      invalidos.push(original);
      return null;
    }
    if (validos.has(e)) {
      repetidos++;
      return null;
    }
    const d = { email: e, nombre };
    validos.set(e, d);
    return d;
  }

  for (const linea of texto.split(/[\n;]+/)) {
    const l = linea.trim();
    if (!l) continue;
    const conAngulos = [...l.matchAll(/([^<,]*)<\s*([^>\s]+)\s*>/g)];
    if (conAngulos.length > 0) {
      for (const m of conAngulos) agregar(m[2], limpiarNombre(m[1]), m[0].trim());
      continue;
    }
    let ultimo: { email: string; nombre: string | null } | null = null;
    for (const pedazo of l.split(",")) {
      const p = pedazo.trim();
      if (!p) continue;
      const palabras = p.split(/\s+/);
      const emails = palabras.filter((w) => w.includes("@"));
      if (emails.length === 0) {
        // "maria@x.com, María Pérez": el nombre va con la dirección anterior.
        if (ultimo && !ultimo.nombre) ultimo.nombre = limpiarNombre(p);
        else invalidos.push(p);
        continue;
      }
      const nombre = emails.length === 1 ? limpiarNombre(palabras.filter((w) => !w.includes("@")).join(" ")) : null;
      for (const e of emails) ultimo = agregar(e, nombre, p) ?? ultimo;
    }
  }
  return { validos: [...validos.values()], invalidos, repetidos };
}

// ------------------------------------------------------------
// Fechas (Uruguay, UTC−3 todo el año)
// ------------------------------------------------------------

const fmtFechaHora = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const fmtCorta = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatFechaHora(iso: string | null | undefined) {
  return iso ? fmtFechaHora.format(new Date(iso)) : "";
}

export function formatCorta(iso: string | null | undefined) {
  return iso ? fmtCorta.format(new Date(iso)) : "";
}

/** "2026-10-05T09:30" (datetime-local, hora de Uruguay) → ISO con zona. */
export function localUyAIso(valor: string) {
  return `${valor.length === 16 ? `${valor}:00` : valor}-03:00`;
}

/** ISO → "YYYY-MM-DDTHH:mm" en hora de Uruguay (para inputs datetime-local). */
export function isoALocalUy(iso: string) {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return d.toISOString().slice(0, 16);
}
