import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { rangoDeFechas, type TipoPeriodo } from "@/lib/tesoreria/presupuesto";

const ROLES = ["super_admin", "tesorero"];

const NOMBRES_MES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export async function GET(req: NextRequest) {
  try {
    await requireRole(ROLES);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = await createServerClient();
  const { searchParams } = new URL(req.url);
  const tipo = (searchParams.get("tipo_periodo") ?? "anual") as TipoPeriodo;
  const anio = Number(searchParams.get("anio") ?? new Date().getFullYear());
  const numero = Number(searchParams.get("periodo_numero") ?? "1");
  const moneda = (searchParams.get("moneda") ?? "UYU") as "UYU" | "USD";

  const { desde, hasta } = rangoDeFechas(tipo, anio, numero);
  const mesInicio = Number(desde.slice(5, 7));
  const mesFin = Number(hasta.slice(5, 7));

  const { data: presupuestos, error: errPres } = await supabase
    .from("presupuestos")
    .select("id, categoria_id, periodo_numero, monto, moneda, notas")
    .eq("tipo_periodo", "mensual")
    .eq("anio", anio)
    .gte("periodo_numero", mesInicio)
    .lte("periodo_numero", mesFin)
    .eq("moneda", moneda);

  if (errPres) {
    return NextResponse.json({ error: errPres.message }, { status: 500 });
  }

  const { data: movs, error: errMov } = await supabase
    .from("movimientos_financieros")
    .select("categoria_id, tipo, monto, moneda, fecha")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .eq("moneda", moneda);

  if (errMov) {
    return NextResponse.json({ error: errMov.message }, { status: 500 });
  }

  const { data: categorias } = await supabase
    .from("categorias_financieras")
    .select("id, nombre, slug, tipo, padre_id, color");

  const cats = categorias ?? [];
  const catsMap = new Map(cats.map((c) => [c.id, c]));

  // Tree: padre_id -> hijos
  const hijosDe = new Map<number | null, typeof cats>();
  for (const c of cats) {
    const arr = hijosDe.get(c.padre_id) ?? [];
    arr.push(c);
    hijosDe.set(c.padre_id, arr);
  }
  const tieneHijos = (id: number) => (hijosDe.get(id)?.length ?? 0) > 0;

  // Self presupuestado per categoría — solo se cuenta en hojas.
  const selfPresup = new Map<number, number>();
  for (const p of presupuestos ?? []) {
    if (p.categoria_id == null) continue;
    if (tieneHijos(p.categoria_id)) continue; // los padres se calculan
    selfPresup.set(
      p.categoria_id,
      (selfPresup.get(p.categoria_id) ?? 0) + Number(p.monto)
    );
  }

  // Self ejecutado (signed) por categoría — incluye lo asignado directamente.
  const selfEjec = new Map<number, number>();
  for (const m of movs ?? []) {
    if (m.categoria_id == null) continue;
    const monto = Number(m.monto);
    const signo = m.tipo === "ingreso" ? 1 : -1;
    selfEjec.set(
      m.categoria_id,
      (selfEjec.get(m.categoria_id) ?? 0) + signo * monto
    );
  }

  // Aggregate recursivo: presupuestado y ejecutado de la cat + descendientes.
  const aggPresup = new Map<number, number>();
  const aggEjec = new Map<number, number>();

  function aggregate(catId: number): { presup: number; ejec: number } {
    if (aggPresup.has(catId)) {
      return { presup: aggPresup.get(catId)!, ejec: aggEjec.get(catId)! };
    }
    let presup = selfPresup.get(catId) ?? 0;
    let ejec = selfEjec.get(catId) ?? 0;
    for (const child of hijosDe.get(catId) ?? []) {
      const c = aggregate(child.id);
      presup += c.presup;
      ejec += c.ejec;
    }
    aggPresup.set(catId, presup);
    aggEjec.set(catId, ejec);
    return { presup, ejec };
  }

  for (const c of cats) aggregate(c.id);

  // Totales mensuales — solo hojas (evita doble conteo).
  const presupMensual: Record<number, { ingreso: number; egreso: number }> = {};
  const ejecMensual: Record<number, { ingreso: number; egreso: number }> = {};
  for (let m = mesInicio; m <= mesFin; m++) {
    presupMensual[m] = { ingreso: 0, egreso: 0 };
    ejecMensual[m] = { ingreso: 0, egreso: 0 };
  }

  for (const p of presupuestos ?? []) {
    if (p.categoria_id == null) continue;
    if (tieneHijos(p.categoria_id)) continue;
    const cat = catsMap.get(p.categoria_id);
    if (!cat) continue;
    const slot = presupMensual[p.periodo_numero];
    if (!slot) continue;
    if (cat.tipo === "ingreso") slot.ingreso += Number(p.monto);
    else slot.egreso += Number(p.monto);
  }

  for (const m of movs ?? []) {
    const fmes = Number((m.fecha as string).slice(5, 7));
    if (!ejecMensual[fmes]) continue;
    const monto = Number(m.monto);
    if (m.tipo === "ingreso") ejecMensual[fmes].ingreso += monto;
    else ejecMensual[fmes].egreso += monto;
  }

  type Row = {
    categoria_id: number;
    categoria_nombre: string;
    categoria_color: string | null;
    categoria_tipo: string;
    padre_id: number | null;
    tiene_hijos: boolean;
    nivel: number;
    presupuestado: number;
    ejecutado: number;
    diferencia: number;
    porcentaje: number;
    presupuesto_id: number | null;
  };

  // Calcular nivel de profundidad
  const nivelDe = new Map<number, number>();
  function nivel(catId: number): number {
    if (nivelDe.has(catId)) return nivelDe.get(catId)!;
    const cat = catsMap.get(catId);
    if (!cat || cat.padre_id == null) {
      nivelDe.set(catId, 0);
      return 0;
    }
    const n = nivel(cat.padre_id) + 1;
    nivelDe.set(catId, n);
    return n;
  }

  const rows: Row[] = [];
  for (const cat of cats) {
    const presupAg = aggPresup.get(cat.id) ?? 0;
    const ejecSigned = aggEjec.get(cat.id) ?? 0;
    const ejecAbs = cat.tipo === "egreso" ? -ejecSigned : ejecSigned;

    if (presupAg === 0 && ejecAbs === 0) continue;

    const diferencia = presupAg - ejecAbs;
    const porcentaje = presupAg > 0 ? (ejecAbs / presupAg) * 100 : 0;
    rows.push({
      categoria_id: cat.id,
      categoria_nombre: cat.nombre,
      categoria_color: cat.color,
      categoria_tipo: cat.tipo,
      padre_id: cat.padre_id,
      tiene_hijos: tieneHijos(cat.id),
      nivel: nivel(cat.id),
      presupuestado: presupAg,
      ejecutado: ejecAbs,
      diferencia,
      porcentaje,
      presupuesto_id: null,
    });
  }

  // Orden: tipo (ingreso primero), luego DFS por padres → hijos manteniendo orden por monto.
  function ordenDfs(): Row[] {
    const byParent = new Map<number | null, Row[]>();
    for (const r of rows) {
      const arr = byParent.get(r.padre_id) ?? [];
      arr.push(r);
      byParent.set(r.padre_id, arr);
    }
    for (const arr of byParent.values()) {
      arr.sort((a, b) => b.presupuestado - a.presupuestado || a.categoria_nombre.localeCompare(b.categoria_nombre));
    }
    const out: Row[] = [];
    function visit(parentId: number | null) {
      for (const r of byParent.get(parentId) ?? []) {
        out.push(r);
        visit(r.categoria_id);
      }
    }
    // raíces ingresos primero, luego egresos
    const raicesIng = (byParent.get(null) ?? []).filter((r) => r.categoria_tipo === "ingreso");
    const raicesEgr = (byParent.get(null) ?? []).filter((r) => r.categoria_tipo === "egreso");
    raicesIng.sort((a, b) => b.presupuestado - a.presupuestado);
    raicesEgr.sort((a, b) => b.presupuestado - a.presupuestado);
    for (const r of raicesIng) {
      out.push(r);
      visit(r.categoria_id);
    }
    for (const r of raicesEgr) {
      out.push(r);
      visit(r.categoria_id);
    }
    return out;
  }
  const rowsOrdenados = ordenDfs();

  const meses = [];
  for (let m = mesInicio; m <= mesFin; m++) {
    meses.push({
      anio,
      mes: m,
      label: NOMBRES_MES[m - 1],
      ingreso_presupuestado: presupMensual[m].ingreso,
      egreso_presupuestado: presupMensual[m].egreso,
      ingreso_ejecutado: ejecMensual[m].ingreso,
      egreso_ejecutado: ejecMensual[m].egreso,
      resultado_presupuestado: presupMensual[m].ingreso - presupMensual[m].egreso,
      resultado_ejecutado: ejecMensual[m].ingreso - ejecMensual[m].egreso,
    });
  }

  // Totales — sólo raíces para no doble-contar.
  const raices = rowsOrdenados.filter((r) => r.padre_id === null);
  const totalIngresoPres = raices.filter((r) => r.categoria_tipo === "ingreso").reduce((s, r) => s + r.presupuestado, 0);
  const totalEgresoPres = raices.filter((r) => r.categoria_tipo === "egreso").reduce((s, r) => s + r.presupuestado, 0);
  const totalIngresoEjec = raices.filter((r) => r.categoria_tipo === "ingreso").reduce((s, r) => s + r.ejecutado, 0);
  const totalEgresoEjec = raices.filter((r) => r.categoria_tipo === "egreso").reduce((s, r) => s + r.ejecutado, 0);

  return NextResponse.json({
    tipo_periodo: tipo,
    anio,
    periodo_numero: numero,
    moneda,
    fecha_desde: desde,
    fecha_hasta: hasta,
    rows: rowsOrdenados,
    meses,
    totales: {
      ingreso_presupuestado: totalIngresoPres,
      ingreso_ejecutado: totalIngresoEjec,
      egreso_presupuestado: totalEgresoPres,
      egreso_ejecutado: totalEgresoEjec,
      resultado_presupuestado: totalIngresoPres - totalEgresoPres,
      resultado_ejecutado: totalIngresoEjec - totalEgresoEjec,
    },
  });
}
