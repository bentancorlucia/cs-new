import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";

const ROLES = ["super_admin", "tesorero"];

const upsertSchema = z.object({
  anio: z.number().int(),
  mes: z.number().int().min(1).max(12),
  categoria_id: z.number().positive(),
  monto: z.number().min(0),
  moneda: z.enum(["UYU", "USD"]).default("UYU"),
  notas: z.string().nullable().optional(),
});

/**
 * Storage de presupuestos: siempre granularidad mensual.
 * `tipo_periodo='mensual'` y `periodo_numero=mes` (1-12).
 * fecha_desde/hasta se calculan automáticamente desde el mes.
 */
function fechasDelMes(anio: number, mes: number): { desde: string; hasta: string } {
  const desde = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const ultimoDia = new Date(anio, mes, 0).getDate();
  const hasta = `${anio}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
  return { desde, hasta };
}

export async function POST(req: NextRequest) {
  try {
    await requireRole(ROLES);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const body = await req.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createServerClient();
  const user = await getCurrentUser();

  // Validar que la categoría sea hoja: si tiene hijos, su presupuesto se calcula.
  const { data: hijos } = await supabase
    .from("categorias_financieras")
    .select("id")
    .eq("padre_id", parsed.data.categoria_id)
    .limit(1);
  if (hijos && hijos.length > 0) {
    return NextResponse.json(
      { error: "La categoría tiene subcategorías. Presupuestá las subcategorías y el total se suma automáticamente." },
      { status: 400 }
    );
  }

  // Si el monto es 0, borrar la fila para mantener la tabla limpia.
  if (parsed.data.monto === 0) {
    await supabase
      .from("presupuestos")
      .delete()
      .eq("tipo_periodo", "mensual")
      .eq("anio", parsed.data.anio)
      .eq("periodo_numero", parsed.data.mes)
      .eq("categoria_id", parsed.data.categoria_id)
      .eq("moneda", parsed.data.moneda);
    return NextResponse.json({ ok: true, eliminado: true });
  }

  const { desde, hasta } = fechasDelMes(parsed.data.anio, parsed.data.mes);

  const { data, error } = await supabase
    .from("presupuestos")
    .upsert(
      {
        tipo_periodo: "mensual",
        anio: parsed.data.anio,
        periodo_numero: parsed.data.mes,
        fecha_desde: desde,
        fecha_hasta: hasta,
        categoria_id: parsed.data.categoria_id,
        monto: parsed.data.monto,
        moneda: parsed.data.moneda,
        notas: parsed.data.notas ?? null,
        creado_por: user?.id ?? null,
      },
      { onConflict: "tipo_periodo,anio,periodo_numero,categoria_id,moneda" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ presupuesto: data });
}
