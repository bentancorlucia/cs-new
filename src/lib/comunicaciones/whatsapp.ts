/**
 * WhatsApp de la tienda: links wa.me con el texto ya armado. Sin
 * dependencias (se usa también en la tienda pública).
 */

/** Número internacional sin "+" (8 a 15 dígitos), como lo guarda la base. */
export const REGEX_WHATSAPP = /^[0-9]{8,15}$/;

/**
 * Lleva un teléfono cargado a mano al formato de wa.me. Celulares
 * uruguayos: 09xxxxxxx / 9xxxxxxx → 5989xxxxxxx. Si ya viene con código de
 * país (+598…, 00598…) se respeta. Devuelve null si no parece un celular.
 */
export function normalizarTelefono(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  let d = telefono.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (/^09\d{7}$/.test(d)) return `598${d.slice(1)}`;
  if (/^9\d{7}$/.test(d)) return `598${d}`;
  if (/^5980?9\d{7}$/.test(d)) return `5989${d.slice(-7)}`;
  // Fijos uruguayos (2xxxxxxx, 4xxxxxxx) no tienen WhatsApp.
  if (/^[24]\d{7}$/.test(d) || /^598[24]\d{7}$/.test(d)) return null;
  // Otro país, ya con su código.
  if (/^[1-9]\d{9,14}$/.test(d)) return d;
  return null;
}

/** Reemplaza {{variable}}; las que faltan quedan vacías. */
export function textoWhatsApp(plantilla: string, variables: Record<string, string | number | null | undefined>) {
  return plantilla
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, clave: string) => {
      const v = variables[clave];
      return v === null || v === undefined ? "" : String(v);
    })
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** https://wa.me/<numero>?text=… */
export function linkWhatsApp(numero: string, texto?: string | null) {
  const n = numero.replace(/\D/g, "");
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}

export type WhatsAppTienda = {
  numero: string | null;
  mensajes: { pedido_listo?: string; consulta?: string } & Record<string, string | undefined>;
};

/** Normaliza lo que devuelve public.whatsapp_tienda(). */
export function leerWhatsAppTienda(data: unknown): WhatsAppTienda {
  const d = (data ?? {}) as { numero?: unknown; mensajes?: unknown };
  const numero = typeof d.numero === "string" && REGEX_WHATSAPP.test(d.numero) ? d.numero : null;
  const mensajes: WhatsAppTienda["mensajes"] = {};
  if (d.mensajes && typeof d.mensajes === "object") {
    for (const [k, v] of Object.entries(d.mensajes as Record<string, unknown>)) {
      if (typeof v === "string") mensajes[k] = v;
    }
  }
  return { numero, mensajes };
}
