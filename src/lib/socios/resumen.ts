import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { rangoToTimestamps } from "@/lib/reportes/rango";
import type { RangoFechas } from "@/types/reportes";

/**
 * Situación del padrón: totales, altas/bajas en el rango y socios activos por
 * disciplina. Usa conteos (head: true) para no chocar con el límite de filas
 * de PostgREST. El caller debe haber verificado el rol y pasar un cliente admin.
 */
export async function obtenerResumenSocios(
  db: SupabaseClient<Database>,
  rango: RangoFechas
) {
  const { desdeIso, hastaIso } = rangoToTimestamps(rango);
  const contar = () =>
    db.from("padron_socios").select("id", { count: "exact", head: true });

  const [totalRes, activosRes, vinculadosRes, altasRes, bajasRes, disciplinasRes] =
    await Promise.all([
      contar(),
      contar().eq("activo", true),
      contar().eq("activo", true).not("perfil_id", "is", null),
      // Mismo criterio que el panel de secretaría: alta = fecha de ingreso al padrón
      contar().gte("created_at", desdeIso).lte("created_at", hastaIso),
      contar().gte("desactivado_at", desdeIso).lte("desactivado_at", hastaIso),
      db.from("disciplinas").select("id, nombre").eq("activa", true).order("nombre"),
    ]);

  for (const r of [totalRes, activosRes, vinculadosRes, altasRes, bajasRes, disciplinasRes]) {
    if (r.error) throw r.error;
  }

  const porDisciplina = await Promise.all(
    (disciplinasRes.data ?? []).map(async (d) => {
      const { count, error } = await db
        .from("padron_disciplinas")
        .select("id, padron_socios!inner(activo)", { count: "exact", head: true })
        .eq("disciplina_id", d.id)
        .eq("activa", true)
        .eq("padron_socios.activo", true);
      if (error) throw error;
      return { disciplina: d.nombre, sociosActivos: count ?? 0 };
    })
  );

  const total = totalRes.count ?? 0;
  const activos = activosRes.count ?? 0;

  return {
    rango,
    padron: {
      total,
      activos,
      inactivos: total - activos,
      activosConCuentaWeb: vinculadosRes.count ?? 0,
    },
    movimientos: {
      altas: altasRes.count ?? 0,
      bajas: bajasRes.count ?? 0,
    },
    porDisciplina: porDisciplina.sort((a, b) => b.sociosActivos - a.sociosActivos),
  };
}
