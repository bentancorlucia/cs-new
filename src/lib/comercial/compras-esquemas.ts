import { z } from "zod";

/*
 * Esquemas Zod, nombres y utilidades de fechas de proveedores y compras.
 * Sin imports de servidor: lo usan tanto los formularios (cliente) como
 * las Server Actions, que vuelven a validar todo antes de llamar a la base.
 */

export const MONEDAS = ["UYU", "USD"] as const;
export type Moneda = (typeof MONEDAS)[number];

// ------------------------------------------------------------
// Nombres
// ------------------------------------------------------------

export const NOMBRE_ESTADO_OC: Record<string, string> = {
  borrador: "Borrador",
  aprobada: "Aprobada",
  recibida_parcial: "Recibida parcial",
  recibida: "Recibida",
  cancelada: "Cancelada",
};

export const NOMBRE_TIPO_DOC: Record<string, string> = {
  factura: "Factura",
  nota_credito: "Nota de crédito",
  nota_debito: "Nota de débito",
};

export const SIGLA_TIPO_DOC: Record<string, string> = {
  factura: "FC",
  nota_credito: "NC",
  nota_debito: "ND",
};

export const NOMBRE_ESTADO_PAGO: Record<string, string> = {
  pendiente: "Pendiente",
  pagada: "Pagada",
  anulada: "Anulada",
};

export function numeroDocumento(d: { tipo: string; serie: string; numero: string }): string {
  const sigla = SIGLA_TIPO_DOC[d.tipo] ?? d.tipo;
  return `${sigla} ${d.serie ? `${d.serie}-` : ""}${d.numero}`;
}

// ------------------------------------------------------------
// Fechas (strings ISO, sin zona horaria)
// ------------------------------------------------------------

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function esFecha(v: unknown): v is string {
  if (typeof v !== "string" || !RE_FECHA.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function aUtc(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function sumarDias(iso: string, dias: number): string {
  return new Date(aUtc(iso) + dias * 86_400_000).toISOString().slice(0, 10);
}

/** Días de `desde` a `hasta` (positivo si hasta es posterior). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / 86_400_000);
}

/** Lunes de la semana de la fecha. */
export function lunesDe(iso: string): string {
  const dow = new Date(aUtc(iso)).getUTCDay(); // 0 domingo
  return sumarDias(iso, -((dow + 6) % 7));
}

export type TramoAntiguedad = "a_vencer" | "0_30" | "31_60" | "61_90" | "90_mas";

export const NOMBRE_TRAMO: Record<TramoAntiguedad, string> = {
  a_vencer: "A vencer",
  "0_30": "0 a 30 días",
  "31_60": "31 a 60 días",
  "61_90": "61 a 90 días",
  "90_mas": "Más de 90",
};

export function tramoAntiguedad(diasVencido: number): TramoAntiguedad {
  if (diasVencido <= 0) return "a_vencer";
  if (diasVencido <= 30) return "0_30";
  if (diasVencido <= 60) return "31_60";
  if (diasVencido <= 90) return "61_90";
  return "90_mas";
}

export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ------------------------------------------------------------
// Esquemas
// ------------------------------------------------------------

const fecha = z.string().refine(esFecha, "Fecha inválida");
const moneda = z.enum(MONEDAS, "Moneda inválida");
const idEntero = z.number().int().positive();
const importe = z.number().finite().positive("El importe tiene que ser mayor que cero");
const tcOpcional = z.number().finite().positive("Tipo de cambio inválido").nullable().optional();
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

export const proveedorSchema = z.object({
  id: idEntero.nullable(),
  nombre: z.string().trim().min(2, "Escribí el nombre").max(200),
  rut: z
    .string()
    .trim()
    .max(20, "El RUT tiene hasta 20 caracteres")
    .refine((v) => v === "" || /^[0-9.\- ]+$/.test(v), "El RUT solo lleva números")
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  razon_social: textoOpcional(200),
  contacto_nombre: textoOpcional(100),
  contacto_telefono: textoOpcional(20),
  contacto_email: z
    .union([z.literal(""), z.email("Email inválido").max(100)])
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  direccion: textoOpcional(500),
  notas: textoOpcional(2000),
  activo: z.boolean(),
  moneda,
  plazo_dias: z.number().int("Plazo en días enteros").min(0, "Mínimo 0").max(365, "Máximo 365"),
  cuenta_gasto_id: z.uuid().nullable(),
  centro_costo_id: z.uuid().nullable(),
});
export type ProveedorInput = z.input<typeof proveedorSchema>;

export const ordenCompraSchema = z.object({
  id: idEntero.nullable(),
  proveedor_id: idEntero,
  fecha,
  moneda,
  notas: textoOpcional(1000),
  items: z
    .array(
      z.object({
        producto_id: idEntero,
        variante_id: idEntero.nullable(),
        cantidad: z.number().int("Cantidades enteras").positive("La cantidad tiene que ser mayor que cero"),
        costo_unitario: z.number().finite().min(0, "El costo no puede ser negativo"),
      })
    )
    .min(1, "Agregá al menos un producto")
    .max(300),
});
export type OrdenCompraInput = z.input<typeof ordenCompraSchema>;

export const recepcionSchema = z
  .object({
    proveedor_id: idEntero,
    orden_id: idEntero.nullable(),
    fecha,
    moneda,
    remito: textoOpcional(100),
    tc: tcOpcional,
    idempotency_key: z.string().min(8).max(100),
    items: z
      .array(
        z.object({
          orden_item_id: idEntero.nullable(),
          producto_id: idEntero.nullable(),
          variante_id: idEntero.nullable(),
          cantidad: z.number().int("Cantidades enteras").positive("La cantidad tiene que ser mayor que cero"),
          costo_unitario: z.number().finite().min(0, "El costo no puede ser negativo"),
        })
      )
      .min(1, "Indicá al menos una cantidad a recibir")
      .max(300),
  })
  .superRefine((d, ctx) => {
    d.items.forEach((i, n) => {
      if (d.orden_id ? !i.orden_item_id : !i.producto_id) {
        ctx.addIssue({ code: "custom", message: "Elegí el producto", path: ["items", n] });
      }
    });
  });
export type RecepcionInput = z.input<typeof recepcionSchema>;

const lineaDocumento = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("recepcion"),
    recepcion_item_id: idEntero,
    cantidad: z.number().int().positive("La cantidad tiene que ser mayor que cero"),
    importe,
  }),
  z.object({
    tipo: z.literal("gasto"),
    cuenta_id: z.uuid("Elegí la cuenta"),
    centro_costo_id: z.uuid().nullable(),
    descripcion: textoOpcional(500),
    importe,
  }),
  z.object({
    tipo: z.literal("devolucion"),
    producto_id: idEntero,
    variante_id: idEntero.nullable(),
    cantidad: z.number().int().positive("La cantidad tiene que ser mayor que cero"),
    importe,
  }),
]);
export type LineaDocumentoInput = z.input<typeof lineaDocumento>;

export const documentoSchema = z
  .object({
    proveedor_id: idEntero,
    tipo: z.enum(["factura", "nota_credito", "nota_debito"]),
    serie: z.string().trim().max(10, "Serie de hasta 10 caracteres"),
    numero: z.string().trim().min(1, "Escribí el número").max(30),
    fecha,
    vencimiento: fecha.nullable(),
    moneda,
    tc: tcOpcional,
    cuenta_pago_id: z.uuid().nullable(),
    notas: textoOpcional(1000),
    lineas: z.array(lineaDocumento).min(1, "El documento no tiene líneas").max(300),
  })
  .superRefine((d, ctx) => {
    if (d.cuenta_pago_id && d.tipo !== "factura") {
      ctx.addIssue({ code: "custom", message: "Solo una factura puede ser contado", path: ["cuenta_pago_id"] });
    }
    if (d.vencimiento && d.vencimiento < d.fecha) {
      ctx.addIssue({ code: "custom", message: "El vencimiento no puede ser anterior a la fecha", path: ["vencimiento"] });
    }
    for (const l of d.lineas) {
      if (l.tipo === "recepcion" && d.tipo !== "factura") {
        ctx.addIssue({ code: "custom", message: "Solo una factura se imputa a mercadería recibida", path: ["lineas"] });
        break;
      }
      if (l.tipo === "devolucion" && d.tipo !== "nota_credito") {
        ctx.addIssue({ code: "custom", message: "La devolución de mercadería va en una nota de crédito", path: ["lineas"] });
        break;
      }
    }
  });
export type DocumentoInput = z.input<typeof documentoSchema>;

export const ordenPagoSchema = z
  .object({
    proveedor_id: idEntero,
    moneda,
    importe,
    cuenta_pago_id: z.uuid("Elegí la caja o banco"),
    referencia: textoOpcional(100),
    notas: textoOpcional(1000),
    aplicaciones: z.array(z.object({ documento_id: idEntero, importe })).max(300),
  })
  .superRefine((d, ctx) => {
    const aplicado = r2(d.aplicaciones.reduce((s, a) => s + a.importe, 0));
    if (aplicado > r2(d.importe)) {
      ctx.addIssue({ code: "custom", message: "Lo aplicado supera el importe del pago", path: ["importe"] });
    }
  });
export type OrdenPagoInput = z.input<typeof ordenPagoSchema>;

export const pagarSchema = z.object({ id: idEntero, fecha, tc: tcOpcional });
export const anularSchema = z.object({
  id: idEntero,
  motivo: z.string().trim().min(3, "Indicá el motivo").max(500),
});
export const aplicarSchema = z.object({ origen_id: idEntero, documento_id: idEntero, importe });
