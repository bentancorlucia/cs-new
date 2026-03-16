import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { preferenceClient, APP_URL, isLocalhost, getCheckoutUrl } from "@/lib/mercadopago/client";
import { z } from "zod";

const compraEntradaSchema = z.object({
  evento_id: z.number().int().positive(),
  tipo_entrada_id: z.number().int().positive(),
  lote_id: z.number().int().positive(),
  cantidad: z.number().int().min(1).max(10),
  nombre_asistente: z.string().min(1).max(200),
  cedula_asistente: z.string().max(20).optional(),
  email_asistente: z.string().email(),
});

// POST /api/eventos/comprar — Comprar entradas para un evento
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const db = supabase as any;

    // 1. Auth
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Debés iniciar sesión para comprar entradas" },
        { status: 401 }
      );
    }

    // 2. Validate body
    const body = await request.json();
    const parsed = compraEntradaSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { evento_id, tipo_entrada_id, lote_id, cantidad, nombre_asistente, cedula_asistente, email_asistente } = parsed.data;

    // 3. Validate event exists and is published
    const { data: evento } = await db
      .from("eventos")
      .select("id, titulo, slug, estado, capacidad_total, es_gratuito")
      .eq("id", evento_id)
      .single();

    if (!evento || evento.estado === "cancelado" || evento.estado === "finalizado") {
      return NextResponse.json({ error: "Evento no disponible" }, { status: 400 });
    }

    // 4. Validate ticket type
    const { data: tipoEntrada } = await db
      .from("tipo_entradas")
      .select("id, nombre, precio, solo_socios, capacidad")
      .eq("id", tipo_entrada_id)
      .eq("evento_id", evento_id)
      .eq("activo", true)
      .single();

    if (!tipoEntrada) {
      return NextResponse.json({ error: "Tipo de entrada no disponible" }, { status: 400 });
    }

    // Check socios-only restriction
    if (tipoEntrada.solo_socios) {
      const { data: perfil } = await db
        .from("perfiles")
        .select("es_socio")
        .eq("id", user.id)
        .single();

      if (!perfil?.es_socio) {
        return NextResponse.json(
          { error: "Esta entrada es solo para socios del club" },
          { status: 403 }
        );
      }
    }

    // 5. Validate lot
    const { data: lote } = await db
      .from("lotes_entrada")
      .select("id, nombre, precio, cantidad, vendidas, estado")
      .eq("id", lote_id)
      .eq("tipo_entrada_id", tipo_entrada_id)
      .single();

    if (!lote || lote.estado !== "activo") {
      return NextResponse.json({ error: "Lote no disponible" }, { status: 400 });
    }

    const disponibles = lote.cantidad - lote.vendidas;
    if (cantidad > disponibles) {
      return NextResponse.json(
        { error: `Solo quedan ${disponibles} entradas disponibles en este lote` },
        { status: 400 }
      );
    }

    // 6. Check total capacity
    if (evento.capacidad_total) {
      const { count: totalVendidas } = await db
        .from("entradas")
        .select("id", { count: "exact", head: true })
        .eq("evento_id", evento_id)
        .in("estado", ["pagada", "usada", "pendiente"]);

      if ((totalVendidas || 0) + cantidad > evento.capacidad_total) {
        return NextResponse.json({ error: "No hay suficiente capacidad para este evento" }, { status: 400 });
      }
    }

    const precioUnitario = Number(lote.precio);
    const totalPago = precioUnitario * cantidad;

    // 7. Create entries (pending payment)
    const entradasToInsert = Array.from({ length: cantidad }, () => ({
      evento_id,
      tipo_entrada_id,
      lote_id,
      perfil_id: user.id,
      nombre_asistente,
      cedula_asistente: cedula_asistente || null,
      email_asistente,
      precio_pagado: Number(precioUnitario),
      estado: evento.es_gratuito ? "pagada" : "pendiente",
      metodo_pago: evento.es_gratuito ? "cortesia" : "mercadopago",
    }));

    const { data: entradas, error: entradasError } = await db
      .from("entradas")
      .insert(entradasToInsert)
      .select("id, codigo");

    if (entradasError || !entradas || entradas.length === 0) {
      console.error("Error al crear entradas:", entradasError);
      return NextResponse.json({ error: "Error al crear las entradas" }, { status: 500 });
    }

    // 8. Update lot sold count
    await db
      .from("lotes_entrada")
      .update({ vendidas: lote.vendidas + cantidad })
      .eq("id", lote_id);

    // Check if lot is now sold out
    if (lote.vendidas + cantidad >= lote.cantidad) {
      await db
        .from("lotes_entrada")
        .update({ estado: "agotado" })
        .eq("id", lote_id);
    }

    // 9. If free event, return directly
    if (evento.es_gratuito) {
      return NextResponse.json({
        entrada_ids: entradas.map((e: any) => e.id),
        gratuito: true,
      });
    }

    // 10. Create MercadoPago preference
    const entradaIds = entradas.map((e: any) => e.id);
    const externalReference = `EVT-${evento_id}-${entradaIds.join(",")}`;
    let preference;
    try {
      preference = await preferenceClient.create({
        body: {
          items: [
            {
              id: `entrada-${tipo_entrada_id}`,
              title: `${evento.titulo} — ${tipoEntrada.nombre} x${cantidad}`,
              quantity: cantidad,
              unit_price: precioUnitario,
              currency_id: "UYU",
            },
          ],
          ...(isLocalhost()
            ? {}
            : {
                back_urls: {
                  success: `${APP_URL}/eventos/${evento.slug}?compra=exitosa`,
                  failure: `${APP_URL}/eventos/${evento.slug}?compra=fallida`,
                  pending: `${APP_URL}/eventos/${evento.slug}?compra=pendiente`,
                },
                auto_return: "approved" as const,
                notification_url: `${APP_URL}/api/webhooks/mercadopago`,
              }),
          external_reference: externalReference,
          payer: {
            name: nombre_asistente,
            email: email_asistente,
          },
          statement_descriptor: "Club Seminario",
        },
      });
    } catch (mpError: any) {
      console.error("MercadoPago error:", mpError?.message, mpError?.cause || "");
      return NextResponse.json(
        { error: "Error al conectar con MercadoPago. Intentá de nuevo." },
        { status: 502 }
      );
    }

    // 11. Save MP preference ids on entries
    for (const entrada of entradas) {
      await db
        .from("entradas")
        .update({ mercadopago_payment_id: preference.id })
        .eq("id", entrada.id);
    }

    return NextResponse.json({
      entrada_ids: entradaIds,
      checkout_url: getCheckoutUrl(preference),
      gratuito: false,
    });
  } catch (error) {
    console.error("Error en /api/eventos/comprar:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
