import { z } from "zod";

export const popupButtonSchema = z.object({
  label: z.string().min(1, "Texto requerido").max(80),
  url: z
    .string()
    .min(1, "URL requerida")
    .refine(
      (v) =>
        v.startsWith("/") ||
        v.startsWith("http://") ||
        v.startsWith("https://") ||
        v.startsWith("mailto:"),
      "URL inválida (debe empezar con /, http(s):// o mailto:)"
    ),
});

export const popupPageSchema = z
  .string()
  .refine(
    (v) =>
      v === "*" ||
      /^\/[A-Za-z0-9\-_/]*$/.test(v) ||
      /^\/[A-Za-z0-9\-_/]*\/\*$/.test(v),
    "Patrón inválido (usar /ruta o /ruta/*)"
  );

export const popupSchema = z.object({
  title: z.string().max(120).nullable().optional(),
  body: z.string().max(2000).nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  buttons: z.array(popupButtonSchema).max(3).default([]),
  pages: z.array(popupPageSchema).min(1, "Al menos una página").default(["*"]),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  priority: z.number().int().default(0),
  status: z.enum(["draft", "published"]).default("draft"),
});

export type PopupInput = z.infer<typeof popupSchema>;
