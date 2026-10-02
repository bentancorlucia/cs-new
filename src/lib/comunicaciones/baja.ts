import { createHmac, timingSafeEqual } from "crypto";

/**
 * Enlace de baja firmado: <mensaje_id>.<firma>. Sin la firma no se puede
 * dar de baja a otra dirección cambiando el id.
 */

function secreto() {
  const s = process.env.COMUNICACIONES_SECRET ?? process.env.CRON_SECRET;
  if (!s) throw new Error("Falta COMUNICACIONES_SECRET");
  return s;
}

function firma(mensajeId: string) {
  return createHmac("sha256", secreto()).update(`baja:${mensajeId}`).digest("base64url").slice(0, 32);
}

export function tokenBaja(mensajeId: string) {
  return `${mensajeId}.${firma(mensajeId)}`;
}

/** Devuelve el id del mensaje si el token es válido. */
export function verificarTokenBaja(token: string): string | null {
  const [id, f] = token.split(".");
  if (!id || !f || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const esperada = Buffer.from(firma(id));
  const recibida = Buffer.from(f);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  return id;
}

export function urlSitio() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clubseminario.com.uy").replace(/\/$/, "");
}

/** Página de confirmación (link del pie del mail). */
export function urlPaginaBaja(mensajeId: string) {
  return `${urlSitio()}/baja/${tokenBaja(mensajeId)}`;
}

/** Endpoint de baja en un clic (RFC 8058, header List-Unsubscribe). */
export function urlBajaUnClic(mensajeId: string) {
  return `${urlSitio()}/api/comunicaciones/baja/${tokenBaja(mensajeId)}`;
}
