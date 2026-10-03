import type { ComunicacionesClient } from "./server";
import type { Json } from "@/types/comunicaciones";

/** Lecturas de comunicaciones para las pantallas (sesión del usuario: la base valida el rol). */

const PAGINA = 1000;

export type Destinatario = {
  persona_id: number | null;
  perfil_id: string | null;
  email: string;
  nombre: string | null;
  variables: Record<string, string | number | null>;
};

/** audiencia_socios completa (PostgREST corta en 1000 filas: se pagina). */
export async function audienciaCompleta(db: ComunicacionesClient, filtro: Record<string, unknown>) {
  const filas: Destinatario[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await db
      .rpc("audiencia_socios", { p_filtro: filtro as Json })
      .order("persona_id")
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      filas.push({
        persona_id: r.persona_id ?? null,
        perfil_id: r.perfil_id ?? null,
        email: r.email,
        nombre: r.nombre ?? null,
        variables: (r.variables ?? {}) as Destinatario["variables"],
      });
    }
    if (!data || data.length < PAGINA) break;
  }
  return filas;
}

/** Bajas vigentes por dirección → alcances. */
export async function supresionesVigentes(db: ComunicacionesClient) {
  const mapa = new Map<string, Set<string>>();
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await db
      .from("supresiones")
      .select("id, email, alcance")
      .is("revocada_at", null)
      .order("id")
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    for (const s of data ?? []) {
      if (!mapa.has(s.email)) mapa.set(s.email, new Set());
      mapa.get(s.email)!.add(s.alcance);
    }
    if (!data || data.length < PAGINA) break;
  }
  return mapa;
}

/** Cuántos de la lista no recibirían un envío de esa categoría. */
export function contarBajas(emails: string[], supresiones: Map<string, Set<string>>) {
  let difusion = 0;
  let personal = 0;
  let total = 0;
  for (const e of emails) {
    const s = supresiones.get(e);
    if (!s) continue;
    if (s.has("total")) total++;
    else {
      if (s.has("difusion")) difusion++;
      if (s.has("personal")) personal++;
    }
  }
  return { difusion, personal, total };
}

/** Comienzo del mes actual en Uruguay, como ISO. */
export function inicioMesUy() {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo" }).format(new Date());
  return `${hoy.slice(0, 7)}-01T00:00:00-03:00`;
}

export async function leerConfig(db: ComunicacionesClient) {
  const { data } = await db.from("config").select("*").maybeSingle();
  return data;
}
