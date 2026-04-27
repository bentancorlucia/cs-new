import { z } from "zod";
import type { MtoCampo, MtoValores } from "@/types/mto";

export const mtoCampoOpcionSchema = z.object({
  valor: z.string().min(1).max(100),
  label: z.string().min(1).max(100),
  precio_extra: z.number().min(0).optional(),
  solo_socios: z.boolean().optional(),
});

export const mtoCampoSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1).max(60).regex(/^[a-z0-9_]+$/, "Solo minúsculas, números y guion bajo"),
  label: z.string().min(1).max(100),
  tipo: z.enum(["texto", "numero", "select", "talle"]),
  requerido: z.boolean(),
  solo_socios: z.boolean().optional(),
  precio_extra: z.number().min(0).optional(),
  max_length: z.number().int().positive().optional(),
  placeholder: z.string().max(100).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  opciones: z.array(mtoCampoOpcionSchema).optional(),
});

export const mtoCamposSchema = z.array(mtoCampoSchema).max(20);

export interface MtoValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  cleaned: MtoValores;
}

/**
 * Valida los valores enviados por el usuario contra la definición de campos.
 * No valida socios — eso se hace por separado en `validarRestriccionSocios`.
 */
export function validarValoresMto(
  campos: MtoCampo[],
  valores: MtoValores
): MtoValidationResult {
  const errors: Record<string, string> = {};
  const cleaned: MtoValores = {};

  for (const campo of campos) {
    const raw = valores[campo.key];
    const filled = raw !== undefined && raw !== null && raw !== "";

    if (campo.requerido && !filled) {
      errors[campo.key] = `${campo.label} es requerido`;
      continue;
    }
    if (!filled) continue;

    switch (campo.tipo) {
      case "texto": {
        const str = String(raw);
        if (campo.max_length && str.length > campo.max_length) {
          errors[campo.key] = `Máximo ${campo.max_length} caracteres`;
          continue;
        }
        cleaned[campo.key] = str;
        break;
      }
      case "numero": {
        const num = typeof raw === "number" ? raw : parseFloat(String(raw));
        if (Number.isNaN(num)) {
          errors[campo.key] = "Debe ser un número";
          continue;
        }
        if (campo.min !== undefined && num < campo.min) {
          errors[campo.key] = `Mínimo ${campo.min}`;
          continue;
        }
        if (campo.max !== undefined && num > campo.max) {
          errors[campo.key] = `Máximo ${campo.max}`;
          continue;
        }
        cleaned[campo.key] = num;
        break;
      }
      case "select":
      case "talle": {
        const valor = String(raw);
        const opcion = campo.opciones?.find((o) => o.valor === valor);
        if (!opcion) {
          errors[campo.key] = "Opción no válida";
          continue;
        }
        cleaned[campo.key] = valor;
        break;
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors, cleaned };
}

/**
 * Verifica si los valores violan restricciones solo_socios para un usuario no socio.
 * Devuelve los keys de campos/opciones bloqueadas (vacío si todo está ok).
 */
export function validarRestriccionSocios(
  campos: MtoCampo[],
  valores: MtoValores,
  esSocio: boolean
): string[] {
  if (esSocio) return [];
  const bloqueados: string[] = [];

  for (const campo of campos) {
    const raw = valores[campo.key];
    const filled = raw !== undefined && raw !== null && raw !== "";
    if (!filled) continue;

    if (campo.solo_socios) {
      bloqueados.push(campo.key);
      continue;
    }

    if (campo.tipo === "select" || campo.tipo === "talle") {
      const opcion = campo.opciones?.find((o) => o.valor === String(raw));
      if (opcion?.solo_socios) bloqueados.push(`${campo.key}:${opcion.valor}`);
    }
  }

  return bloqueados;
}
