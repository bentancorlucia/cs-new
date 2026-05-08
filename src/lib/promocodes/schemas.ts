import { z } from "zod";

export const TIPO_DESCUENTO = ["porcentaje", "monto_fijo"] as const;
export type TipoDescuento = (typeof TIPO_DESCUENTO)[number];

export const promocodeBaseSchema = z
  .object({
    codigo: z
      .string()
      .min(2, "Mínimo 2 caracteres")
      .max(40, "Máximo 40 caracteres")
      .regex(/^[A-Z0-9_-]+$/i, "Solo letras, números, guiones y guion bajo"),
    descripcion: z.string().max(500).optional().nullable(),
    tipo_descuento: z.enum(TIPO_DESCUENTO),
    valor: z.number().positive("Debe ser mayor a 0"),
    fecha_inicio: z.string().min(1, "Fecha de inicio requerida"),
    fecha_fin: z.string().min(1, "Fecha de fin requerida"),
    acumulable_con_precio_socio: z.boolean().default(false),
    monto_minimo: z.number().positive().optional().nullable(),
    usos_max: z.number().int().positive().optional().nullable(),
    activo: z.boolean().default(true),
  })
  .refine(
    (d) => d.tipo_descuento !== "porcentaje" || d.valor <= 100,
    { message: "El porcentaje no puede ser mayor a 100", path: ["valor"] }
  )
  .refine(
    (d) => new Date(d.fecha_fin) > new Date(d.fecha_inicio),
    { message: "La fecha de fin debe ser posterior a la de inicio", path: ["fecha_fin"] }
  );

export type PromocodeInput = z.infer<typeof promocodeBaseSchema>;

export interface Promocode {
  id: number;
  codigo: string;
  descripcion: string | null;
  tipo_descuento: TipoDescuento;
  valor: number;
  fecha_inicio: string;
  fecha_fin: string;
  acumulable_con_precio_socio: boolean;
  monto_minimo: number | null;
  usos_max: number | null;
  usos_actuales: number;
  activo: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
