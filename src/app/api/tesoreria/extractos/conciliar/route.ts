import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { parsearItauCSV } from "@/lib/tesoreria/parsear-itau";

const ROLES = ["super_admin", "tesorero"];

const VENTANA_DIAS = 3;

type Candidato = {
  id: number;
  fecha: string;
  descripcion: string;
  monto: number;
  tipo: "ingreso" | "egreso";
  referencia: string | null;
  origen_tipo: string | null;
  origen_id: number | null;
  categoria_nombre: string | null;
};

type LineaAnalizada = {
  indice: number;
  fecha: string;
  descripcion: string;
  referencia: string | null;
  tipo: "ingreso" | "egreso";
  monto: number;
  hash_dedupe: string;
  saldo_post: number | null;
  estado: "duplicado_extracto" | "match_unico" | "match_ambiguo" | "sin_match";
  candidatos: Candidato[];
  sugerido_id: number | null;
  requiere_verificacion: boolean;
};

function diffDias(a: string, b: string): number {
  const ms = new Date(a + "T00:00:00").getTime() - new Date(b + "T00:00:00").getTime();
  return Math.abs(ms) / (1000 * 60 * 60 * 24);
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(ROLES);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const formData = await request.formData();
  const cuentaId = Number(formData.get("cuenta_id"));
  const archivo = formData.get("archivo") as File | null;

  if (!cuentaId || !archivo) {
    return NextResponse.json({ error: "Falta cuenta_id o archivo" }, { status: 400 });
  }

  const supabase = await createServerClient();
  const { data: cuenta } = await supabase
    .from("cuentas_financieras")
    .select("id, nombre, tipo, moneda, banco")
    .eq("id", cuentaId)
    .single();

  if (!cuenta) {
    return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const archivoHash = createHash("sha256").update(buffer).digest("hex");
  const contenido = buffer.toString("utf-8");

  const parsed = parsearItauCSV(contenido, cuentaId);

  if (parsed.movimientos.length === 0) {
    return NextResponse.json(
      { error: "No se detectaron movimientos en el archivo. Verificá el formato.", parsed },
      { status: 422 }
    );
  }

  if (parsed.moneda_detectada && parsed.moneda_detectada !== cuenta.moneda) {
    return NextResponse.json(
      {
        error: `La moneda del extracto (${parsed.moneda_detectada}) no coincide con la moneda de la cuenta (${cuenta.moneda}).`,
      },
      { status: 422 }
    );
  }

  // ¿Este archivo ya fue importado?
  const { data: yaImportado } = await supabase
    .from("extractos_importados")
    .select("id, created_at")
    .eq("cuenta_id", cuentaId)
    .eq("archivo_hash", archivoHash)
    .maybeSingle();

  // Hashes ya presentes en movimientos (deduplicación de líneas exactas)
  const hashes = parsed.movimientos.map((m) => m.hash_dedupe);
  const { data: existentesPorHash } = await supabase
    .from("movimientos_financieros")
    .select("hash_dedupe")
    .eq("cuenta_id", cuentaId)
    .in("hash_dedupe", hashes);
  const setHashesExistentes = new Set(
    ((existentesPorHash ?? []) as Array<{ hash_dedupe: string }>).map((e) => e.hash_dedupe)
  );

  // Candidatos del sistema: movimientos sin extracto_id en la ventana de fechas
  const fechaDesde = parsed.fecha_desde;
  const fechaHasta = parsed.fecha_hasta;
  let candidatosTodos: Array<{
    id: number;
    fecha: string;
    descripcion: string;
    monto: number | string;
    tipo: "ingreso" | "egreso";
    referencia: string | null;
    origen_tipo: string | null;
    origen_id: number | null;
    extracto_id: number | null;
    categorias_financieras: { nombre: string } | null;
  }> = [];

  if (fechaDesde && fechaHasta) {
    // Expandir ventana ± días para captar matches en el borde
    const dDesde = new Date(fechaDesde + "T00:00:00");
    dDesde.setDate(dDesde.getDate() - VENTANA_DIAS);
    const dHasta = new Date(fechaHasta + "T00:00:00");
    dHasta.setDate(dHasta.getDate() + VENTANA_DIAS);
    const desdeExt = dDesde.toISOString().split("T")[0];
    const hastaExt = dHasta.toISOString().split("T")[0];

    const { data: candData } = await supabase
      .from("movimientos_financieros")
      .select(
        "id, fecha, descripcion, monto, tipo, referencia, origen_tipo, origen_id, extracto_id, categorias_financieras!movimientos_financieros_categoria_id_fkey(nombre)"
      )
      .eq("cuenta_id", cuentaId)
      .is("extracto_id", null)
      .gte("fecha", desdeExt)
      .lte("fecha", hastaExt);

    candidatosTodos = (candData ?? []) as never;
  }

  // Detectar líneas del extracto que comparten fecha+monto+tipo con otras del MISMO extracto
  const claveCount = new Map<string, number>();
  for (const m of parsed.movimientos) {
    const k = `${m.fecha}|${m.monto.toFixed(2)}|${m.tipo}`;
    claveCount.set(k, (claveCount.get(k) ?? 0) + 1);
  }

  const lineas: LineaAnalizada[] = parsed.movimientos.map((m, idx) => {
    const claveExtracto = `${m.fecha}|${m.monto.toFixed(2)}|${m.tipo}`;
    const tieneHermanaExtracto = (claveCount.get(claveExtracto) ?? 0) > 1;

    if (setHashesExistentes.has(m.hash_dedupe)) {
      return {
        indice: idx,
        fecha: m.fecha,
        descripcion: m.descripcion,
        referencia: m.referencia,
        tipo: m.tipo,
        monto: m.monto,
        hash_dedupe: m.hash_dedupe,
        saldo_post: m.saldo_post,
        estado: "duplicado_extracto",
        candidatos: [],
        sugerido_id: null,
        requiere_verificacion: false,
      };
    }

    const candidatos: Candidato[] = candidatosTodos
      .filter((c) => {
        if (c.tipo !== m.tipo) return false;
        if (Number(c.monto) !== m.monto) return false;
        if (diffDias(c.fecha, m.fecha) > VENTANA_DIAS) return false;
        return true;
      })
      .map((c) => ({
        id: c.id,
        fecha: c.fecha,
        descripcion: c.descripcion,
        monto: Number(c.monto),
        tipo: c.tipo,
        referencia: c.referencia,
        origen_tipo: c.origen_tipo,
        origen_id: c.origen_id,
        categoria_nombre: c.categorias_financieras?.nombre ?? null,
      }));

    // Si la línea ITAU tiene referencia y un candidato la comparte → match único forzado
    if (m.referencia && candidatos.length > 1) {
      const exact = candidatos.find(
        (c) => c.referencia && c.referencia.trim() === m.referencia!.trim()
      );
      if (exact) {
        return {
          indice: idx,
          fecha: m.fecha,
          descripcion: m.descripcion,
          referencia: m.referencia,
          tipo: m.tipo,
          monto: m.monto,
          hash_dedupe: m.hash_dedupe,
          saldo_post: m.saldo_post,
          estado: "match_unico",
          candidatos: [exact],
          sugerido_id: exact.id,
          requiere_verificacion: false,
        };
      }
    }

    let estado: LineaAnalizada["estado"];
    let sugerido: number | null = null;
    if (candidatos.length === 0) estado = "sin_match";
    else if (candidatos.length === 1) {
      estado = "match_unico";
      sugerido = candidatos[0].id;
    } else estado = "match_ambiguo";

    // Si el extracto tiene otra línea con misma fecha+monto+tipo, no se puede auto-asignar
    // (no sabemos cuál línea del extracto corresponde a qué movimiento del sistema)
    if (tieneHermanaExtracto && estado === "match_unico") {
      estado = "match_ambiguo";
      sugerido = null;
    }

    const requiereVerificacion =
      tieneHermanaExtracto || estado === "match_ambiguo";

    return {
      indice: idx,
      fecha: m.fecha,
      descripcion: m.descripcion,
      referencia: m.referencia,
      tipo: m.tipo,
      monto: m.monto,
      hash_dedupe: m.hash_dedupe,
      saldo_post: m.saldo_post,
      estado,
      candidatos,
      sugerido_id: sugerido,
      requiere_verificacion: requiereVerificacion,
    };
  });

  return NextResponse.json({
    archivo_hash: archivoHash,
    archivo_nombre: archivo.name,
    ya_importado: !!yaImportado,
    extracto_existente_id: yaImportado?.id ?? null,
    cuenta: { id: cuenta.id, nombre: cuenta.nombre, moneda: cuenta.moneda, banco: cuenta.banco },
    fecha_desde: parsed.fecha_desde,
    fecha_hasta: parsed.fecha_hasta,
    saldo_inicial: parsed.saldo_inicial,
    saldo_final: parsed.saldo_final,
    total_lineas: parsed.movimientos.length,
    lineas,
  });
}
