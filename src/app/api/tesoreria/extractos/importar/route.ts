import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { parsearItauCSV } from "@/lib/tesoreria/parsear-itau";

const ROLES = ["super_admin", "tesorero"];

export async function POST(request: NextRequest) {
  try {
    await requireRole(ROLES);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const formData = await request.formData();
  const cuentaId = Number(formData.get("cuenta_id"));
  const archivo = formData.get("archivo") as File | null;
  const formato = (formData.get("formato") as string) || "itau";
  const dryRun = formData.get("dry_run") === "1";

  if (!cuentaId || !archivo) {
    return NextResponse.json({ error: "Falta cuenta_id o archivo" }, { status: 400 });
  }

  const supabase = await createServerClient();
  const { data: cuenta } = await supabase
    .from("cuentas_financieras")
    .select("id, nombre, tipo, moneda")
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
        error: `La moneda del extracto (${parsed.moneda_detectada}) no coincide con la moneda de la cuenta (${cuenta.moneda}). Verificá que estés importando el extracto correcto.`,
      },
      { status: 422 }
    );
  }

  // Verificar duplicados existentes
  const hashes = parsed.movimientos.map((m) => m.hash_dedupe);
  const { data: existentes } = await supabase
    .from("movimientos_financieros")
    .select("hash_dedupe")
    .eq("cuenta_id", cuentaId)
    .in("hash_dedupe", hashes);

  const setExistentes = new Set(
    ((existentes ?? []) as Array<{ hash_dedupe: string }>).map((e) => e.hash_dedupe)
  );
  const nuevos = parsed.movimientos.filter((m) => !setExistentes.has(m.hash_dedupe));

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      preview: true,
      total: parsed.movimientos.length,
      nuevos: nuevos.length,
      duplicados: parsed.movimientos.length - nuevos.length,
      movimientos: nuevos.slice(0, 50),
      fecha_desde: parsed.fecha_desde,
      fecha_hasta: parsed.fecha_hasta,
      saldo_inicial: parsed.saldo_inicial,
      saldo_final: parsed.saldo_final,
    });
  }

  // Verificar si este archivo exacto ya fue importado
  const { data: yaImportado } = await supabase
    .from("extractos_importados")
    .select("id")
    .eq("cuenta_id", cuentaId)
    .eq("archivo_hash", archivoHash)
    .maybeSingle();
  if (yaImportado) {
    return NextResponse.json(
      { error: "Este extracto ya fue importado anteriormente.", extracto_id: yaImportado.id },
      { status: 409 }
    );
  }

  const user = await getCurrentUser();

  const { data: extracto, error: errExtracto } = await supabase
    .from("extractos_importados")
    .insert({
      cuenta_id: cuentaId,
      archivo_nombre: archivo.name,
      archivo_hash: archivoHash,
      formato,
      fecha_desde: parsed.fecha_desde,
      fecha_hasta: parsed.fecha_hasta,
      total_movimientos: parsed.movimientos.length,
      movimientos_creados: 0,
      movimientos_duplicados: parsed.movimientos.length - nuevos.length,
      saldo_inicial_extracto: parsed.saldo_inicial,
      saldo_final_extracto: parsed.saldo_final,
      importado_por: user?.id ?? null,
    })
    .select()
    .single();

  if (errExtracto) {
    return NextResponse.json({ error: errExtracto.message }, { status: 500 });
  }

  if (nuevos.length > 0) {
    const rows = nuevos.map((m) => ({
      cuenta_id: cuentaId,
      tipo: m.tipo,
      categoria_id: null,
      monto: m.monto,
      moneda: cuenta.moneda,
      fecha: m.fecha,
      descripcion: m.descripcion,
      referencia: m.referencia,
      hash_dedupe: m.hash_dedupe,
      extracto_id: extracto.id,
      clasificado: false,
      registrado_por: user?.id ?? null,
    }));

    const { error: errMov } = await supabase.from("movimientos_financieros").insert(rows);
    if (errMov) {
      return NextResponse.json({ error: errMov.message }, { status: 500 });
    }

    await supabase
      .from("extractos_importados")
      .update({ movimientos_creados: nuevos.length })
      .eq("id", extracto.id);
  }

  return NextResponse.json({
    ok: true,
    extracto_id: extracto.id,
    total: parsed.movimientos.length,
    creados: nuevos.length,
    duplicados: parsed.movimientos.length - nuevos.length,
  });
}
