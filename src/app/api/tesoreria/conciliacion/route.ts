import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import {
  parsearExtracto,
  matchearMovimientos,
  type MovimientoBanco,
  type MovimientoSistema,
} from "@/lib/tesoreria/parsear-extracto";

const TESORERIA_ROLES = ["super_admin", "tesorero"];

/** GET — Lista de conciliaciones o detalle de una */
export async function GET(request: NextRequest) {
  try {
    await requireRole(TESORERIA_ROLES);
    const supabase = await createServerClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const cuentaId = searchParams.get("cuenta_id");

    if (id) {
      // Detalle de conciliación con sus items
      const { data: conciliacion, error } = await supabase
        .from("conciliaciones")
        .select("*")
        .eq("id", parseInt(id))
        .single();

      if (error) throw error;

      const { data: items, error: itemsError } = await supabase
        .from("conciliacion_items")
        .select("*, movimiento:movimientos_financieros(*)")
        .eq("conciliacion_id", parseInt(id))
        .order("created_at", { ascending: true });

      if (itemsError) throw itemsError;

      return NextResponse.json({ data: { ...conciliacion, items } });
    }

    // Lista de conciliaciones
    let query = supabase
      .from("conciliaciones")
      .select("*, cuenta:cuentas_financieras(nombre, moneda)")
      .order("created_at", { ascending: false });

    if (cuentaId) {
      query = query.eq("cuenta_id", parseInt(cuentaId));
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** POST — Crear conciliación y procesar archivo de extracto */
export async function POST(request: NextRequest) {
  try {
    await requireRole(TESORERIA_ROLES);
    const supabase = await createServerClient();

    const formData = await request.formData();
    const cuentaId = parseInt(formData.get("cuenta_id") as string);
    const periodoDesde = formData.get("periodo_desde") as string;
    const periodoHasta = formData.get("periodo_hasta") as string;
    const saldoBanco = parseFloat(formData.get("saldo_banco") as string);
    const formato = formData.get("formato") as string;
    const file = formData.get("archivo") as File | null;

    if (!cuentaId || !periodoDesde || !periodoHasta || isNaN(saldoBanco)) {
      return NextResponse.json(
        { error: "Faltan datos requeridos" },
        { status: 400 }
      );
    }

    // Obtener saldo del sistema para la cuenta
    const { data: cuenta, error: cuentaError } = await supabase
      .from("cuentas_financieras")
      .select("saldo_actual")
      .eq("id", cuentaId)
      .single();

    if (cuentaError) throw cuentaError;
    const saldoSistema = cuenta.saldo_actual;

    // Subir archivo al storage si existe
    let archivoUrl: string | null = null;
    let movsBanco: MovimientoBanco[] = [];

    if (file) {
      const ext = file.name.split(".").pop();
      const storagePath = `conciliaciones/${cuentaId}/${Date.now()}.${ext}`;

      const buffer = await file.arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from("extractos")
        .upload(storagePath, buffer, {
          contentType: file.type,
        });

      if (uploadError) {
        console.error("Error subiendo extracto:", uploadError);
      } else {
        archivoUrl = storagePath;
      }

      // Parsear el archivo
      const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
      if (isExcel) {
        movsBanco = parsearExtracto(
          buffer,
          file.name,
          (formato as any) || "generico"
        );
      } else {
        const text = new TextDecoder("utf-8").decode(buffer);
        movsBanco = parsearExtracto(
          text,
          file.name,
          (formato as any) || "generico"
        );
      }
    }

    // Obtener movimientos del sistema del período (no conciliados)
    const { data: movsDB, error: movsError } = await supabase
      .from("movimientos_financieros")
      .select("id, fecha, descripcion, monto, tipo, conciliado, categoria:categorias_financieras(nombre)")
      .eq("cuenta_id", cuentaId)
      .gte("fecha", periodoDesde)
      .lte("fecha", periodoHasta)
      .order("fecha", { ascending: true });

    if (movsError) throw movsError;

    const movsSistema: MovimientoSistema[] = (movsDB || []).map((m: any) => ({
      id: m.id,
      fecha: m.fecha,
      descripcion: m.descripcion,
      monto: m.monto,
      tipo: m.tipo,
      categoria_nombre: m.categoria?.nombre,
      conciliado: m.conciliado,
    }));

    // Ejecutar matching automático
    const matchResult = matchearMovimientos(movsSistema, movsBanco);

    // Crear la conciliación
    const { data: conciliacion, error: concError } = await supabase
      .from("conciliaciones")
      .insert({
        cuenta_id: cuentaId,
        periodo_desde: periodoDesde,
        periodo_hasta: periodoHasta,
        saldo_banco: saldoBanco,
        saldo_sistema: saldoSistema,
        diferencia: saldoBanco - saldoSistema,
        archivo_extracto_url: archivoUrl,
        estado: "en_proceso",
        movimientos_matcheados: matchResult.matched.length,
        movimientos_pendientes_banco: matchResult.sinMatchBanco.length,
        movimientos_pendientes_sistema: matchResult.sinMatchSistema.length,
      } as any)
      .select()
      .single();

    if (concError) throw concError;

    // Crear items de conciliación
    const items: any[] = [];

    // Items matcheados
    for (const match of matchResult.matched) {
      items.push({
        conciliacion_id: conciliacion.id,
        movimiento_id: match.sistema.id,
        fecha_banco: match.banco.fecha,
        descripcion_banco: match.banco.descripcion,
        monto_banco: match.banco.tipo === "egreso" ? -match.banco.monto : match.banco.monto,
        estado: "matcheado",
      });
    }

    // Items sin match en sistema (movimientos del banco sin par)
    for (const banco of matchResult.sinMatchBanco) {
      items.push({
        conciliacion_id: conciliacion.id,
        movimiento_id: null,
        fecha_banco: banco.fecha,
        descripcion_banco: banco.descripcion,
        monto_banco: banco.tipo === "egreso" ? -banco.monto : banco.monto,
        estado: "pendiente_sistema",
      });
    }

    // Items sin match en banco (movimientos del sistema sin par)
    for (const sistema of matchResult.sinMatchSistema) {
      items.push({
        conciliacion_id: conciliacion.id,
        movimiento_id: sistema.id,
        fecha_banco: null,
        descripcion_banco: null,
        monto_banco: null,
        estado: "pendiente_banco",
      });
    }

    if (items.length > 0) {
      const { error: itemsError } = await supabase
        .from("conciliacion_items")
        .insert(items);

      if (itemsError) throw itemsError;
    }

    return NextResponse.json({
      data: {
        conciliacion,
        resumen: {
          matcheados: matchResult.matched.length,
          pendientes_banco: matchResult.sinMatchBanco.length,
          pendientes_sistema: matchResult.sinMatchSistema.length,
          total_banco: movsBanco.length,
          total_sistema: movsSistema.length,
        },
      },
    });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** PUT — Actualizar item de conciliación o finalizar conciliación */
export async function PUT(request: NextRequest) {
  try {
    await requireRole(TESORERIA_ROLES);
    const supabase = await createServerClient();
    const body = await request.json();
    const { action } = body;

    if (action === "confirmar_item") {
      // Confirmar un match o cambiar estado de un item
      const { item_id, estado, movimiento_id } = body;

      const updateData: any = { estado };
      if (movimiento_id !== undefined) {
        updateData.movimiento_id = movimiento_id;
      }

      const { error } = await supabase
        .from("conciliacion_items")
        .update(updateData)
        .eq("id", item_id);

      if (error) throw error;

      // Si se confirmó un match, marcar el movimiento como conciliado
      if (estado === "matcheado" && movimiento_id) {
        await supabase
          .from("movimientos_financieros")
          .update({ conciliado: true } as any)
          .eq("id", movimiento_id);
      }

      return NextResponse.json({ success: true });
    }

    if (action === "finalizar") {
      // Finalizar conciliación
      const { conciliacion_id } = body;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Contar items por estado
      const { data: items, error: itemsError } = await supabase
        .from("conciliacion_items")
        .select("estado")
        .eq("conciliacion_id", conciliacion_id);

      if (itemsError) throw itemsError;

      const matcheados = items?.filter((i) => i.estado === "matcheado").length || 0;
      const pendBanco = items?.filter((i) => i.estado === "pendiente_banco").length || 0;
      const pendSistema = items?.filter((i) => i.estado === "pendiente_sistema").length || 0;

      // Marcar todos los movimientos matcheados como conciliados
      const { data: matchedItems } = await supabase
        .from("conciliacion_items")
        .select("movimiento_id")
        .eq("conciliacion_id", conciliacion_id)
        .eq("estado", "matcheado")
        .not("movimiento_id", "is", null);

      if (matchedItems && matchedItems.length > 0) {
        const movIds = matchedItems
          .map((i) => i.movimiento_id)
          .filter(Boolean);

        for (const movId of movIds) {
          await supabase
            .from("movimientos_financieros")
            .update({ conciliado: true, conciliacion_id } as any)
            .eq("id", movId as number);
        }
      }

      // Actualizar conciliación
      const { error: updateError } = await supabase
        .from("conciliaciones")
        .update({
          estado: "completada",
          movimientos_matcheados: matcheados,
          movimientos_pendientes_banco: pendBanco,
          movimientos_pendientes_sistema: pendSistema,
          completada_por: user?.id,
          completada_at: new Date().toISOString(),
        } as any)
        .eq("id", conciliacion_id);

      if (updateError) throw updateError;

      return NextResponse.json({ success: true });
    }

    if (action === "ignorar_item") {
      const { item_id } = body;
      const { error } = await supabase
        .from("conciliacion_items")
        .update({ estado: "ignorado" } as any)
        .eq("id", item_id);

      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
