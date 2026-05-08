import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { parsearItauCSV } from "@/lib/tesoreria/parsear-itau";

const ROLES = ["super_admin", "tesorero"];

type Decision =
  | { indice: number; accion: "match"; match_movimiento_id: number }
  | { indice: number; accion: "crear_nuevo" }
  | { indice: number; accion: "ignorar" };

export async function POST(request: NextRequest) {
  try {
    await requireRole(ROLES);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const formData = await request.formData();
  const cuentaId = Number(formData.get("cuenta_id"));
  const archivo = formData.get("archivo") as File | null;
  const decisionesRaw = formData.get("decisiones") as string | null;

  if (!cuentaId || !archivo || !decisionesRaw) {
    return NextResponse.json(
      { error: "Falta cuenta_id, archivo o decisiones" },
      { status: 400 }
    );
  }

  let decisiones: Decision[];
  try {
    decisiones = JSON.parse(decisionesRaw);
    if (!Array.isArray(decisiones)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Decisiones inválidas" }, { status: 400 });
  }

  const supabase = await createServerClient();
  const { data: cuenta } = await supabase
    .from("cuentas_financieras")
    .select("id, nombre, moneda")
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
      { error: "No se detectaron movimientos en el archivo." },
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

  // ¿Ya importado? Cortar.
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

  // Crear fila de extracto
  const { data: extracto, error: errExtracto } = await supabase
    .from("extractos_importados")
    .insert({
      cuenta_id: cuentaId,
      archivo_nombre: archivo.name,
      archivo_hash: archivoHash,
      formato: "itau",
      fecha_desde: parsed.fecha_desde,
      fecha_hasta: parsed.fecha_hasta,
      total_movimientos: parsed.movimientos.length,
      movimientos_creados: 0,
      movimientos_duplicados: 0,
      saldo_inicial_extracto: parsed.saldo_inicial,
      saldo_final_extracto: parsed.saldo_final,
      importado_por: user?.id ?? null,
    })
    .select()
    .single();

  if (errExtracto || !extracto) {
    return NextResponse.json(
      { error: errExtracto?.message ?? "No se pudo crear el extracto" },
      { status: 500 }
    );
  }

  const extractoId = extracto.id as number;
  const decisionesPorIndice = new Map<number, Decision>(
    decisiones.map((d) => [d.indice, d])
  );

  let creados = 0;
  let matcheados = 0;
  let ignorados = 0;
  const errores: Array<{ indice: number; error: string }> = [];

  for (let i = 0; i < parsed.movimientos.length; i++) {
    const linea = parsed.movimientos[i];
    const decision = decisionesPorIndice.get(i);
    if (!decision || decision.accion === "ignorar") {
      ignorados++;
      continue;
    }

    if (decision.accion === "match") {
      const updates: Record<string, unknown> = { extracto_id: extractoId };
      // Si la línea ITAU tiene referencia y el movimiento no la tenía, la guardamos
      if (linea.referencia) {
        const { data: existente } = await supabase
          .from("movimientos_financieros")
          .select("referencia")
          .eq("id", decision.match_movimiento_id)
          .single();
        if (existente && !existente.referencia) {
          updates.referencia = linea.referencia;
        }
      }
      const { error: errUpd } = await supabase
        .from("movimientos_financieros")
        .update(updates)
        .eq("id", decision.match_movimiento_id)
        .eq("cuenta_id", cuentaId)
        .is("extracto_id", null);

      if (errUpd) {
        errores.push({ indice: i, error: errUpd.message });
      } else {
        matcheados++;
      }
      continue;
    }

    if (decision.accion === "crear_nuevo") {
      const { error: errIns } = await supabase.from("movimientos_financieros").insert({
        cuenta_id: cuentaId,
        tipo: linea.tipo,
        categoria_id: null,
        monto: linea.monto,
        moneda: cuenta.moneda,
        fecha: linea.fecha,
        descripcion: linea.descripcion,
        referencia: linea.referencia,
        hash_dedupe: linea.hash_dedupe,
        extracto_id: extractoId,
        clasificado: false,
        registrado_por: user?.id ?? null,
      });
      if (errIns) {
        errores.push({ indice: i, error: errIns.message });
      } else {
        creados++;
      }
    }
  }

  // Actualizar contadores en el extracto
  await supabase
    .from("extractos_importados")
    .update({
      movimientos_creados: creados,
      movimientos_duplicados: ignorados,
    })
    .eq("id", extractoId);

  return NextResponse.json({
    ok: true,
    extracto_id: extractoId,
    creados,
    matcheados,
    ignorados,
    errores,
  });
}
