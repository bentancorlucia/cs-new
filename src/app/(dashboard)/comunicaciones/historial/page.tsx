import type { Metadata } from "next";
import { createComunicacionesClient } from "@/lib/comunicaciones/server";
import { ESTADOS_MENSAJE } from "@/lib/comunicaciones/esquemas";
import { Historial, type FiltrosHistorial, type FilaHistorial } from "@/components/comunicaciones/historial";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Historial de comunicaciones" };

const POR_PAGINA = 50;
const fecha = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filtros: FiltrosHistorial = {
    estado: ESTADOS_MENSAJE.includes(sp.estado as never) ? sp.estado! : "",
    categoria: sp.categoria === "institucional" || sp.categoria === "difusion" ? sp.categoria : "",
    origen: ["manual", "transaccional", "automatizacion"].includes(sp.origen ?? "") ? sp.origen! : "",
    q: (sp.q ?? "").slice(0, 120),
    persona: /^\d+$/.test(sp.persona ?? "") ? sp.persona! : "",
    desde: fecha(sp.desde),
    hasta: fecha(sp.hasta),
  };
  const pagina = Math.max(1, Number(sp.pagina) || 1);

  const db = await createComunicacionesClient();
  let query = db
    .from("mensajes")
    .select(
      "id, email, nombre, estado, motivo_omision, error, intentos, enviado_at, created_at, categoria, persona_id, envio_id, envios!inner(nombre, origen)",
      { count: "exact" }
    );
  if (filtros.estado) query = query.eq("estado", filtros.estado);
  if (filtros.categoria) query = query.eq("categoria", filtros.categoria);
  if (filtros.origen) query = query.eq("envios.origen", filtros.origen);
  if (filtros.persona) query = query.eq("persona_id", Number(filtros.persona));
  if (filtros.desde) query = query.gte("created_at", `${filtros.desde}T00:00:00-03:00`);
  if (filtros.hasta) query = query.lte("created_at", `${filtros.hasta}T23:59:59.999-03:00`);
  if (filtros.q) {
    // Caracteres que rompen la sintaxis de or() de PostgREST.
    const limpio = filtros.q.replace(/[,()*%\\]/g, " ").trim();
    if (limpio) query = query.or(`email.ilike.*${limpio}*,nombre.ilike.*${limpio}*`);
  }
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .order("id")
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);

  const filas: FilaHistorial[] = (data ?? []).map(({ envios, ...m }) => {
    const e = envios as unknown as { nombre: string; origen: string } | null;
    return { ...m, envio_nombre: e?.nombre ?? "", origen: e?.origen ?? "" };
  });

  return (
    <Historial
      filas={filas}
      total={count ?? 0}
      pagina={pagina}
      porPagina={POR_PAGINA}
      filtros={filtros}
      error={error?.message ?? null}
    />
  );
}
