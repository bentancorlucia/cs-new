import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buscarPromocodeVigente,
  validarMontoMinimo,
} from "@/lib/promocodes/validate";
import { aplicarPromocode, type ApplyItem } from "@/lib/promocodes/apply";

const itemSchema = z.object({
  precio: z.number().nonnegative(),
  precioSocio: z.number().nonnegative().optional().nullable(),
  precioExtra: z.number().nonnegative().optional(),
  cantidad: z.number().int().positive(),
});

const bodySchema = z.object({
  codigo: z.string().min(1).max(40),
  items: z.array(itemSchema).min(1),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { codigo, items } = parsed.data;

    const validacion = await buscarPromocodeVigente(codigo);
    if (!validacion.ok) {
      return NextResponse.json({ error: validacion.error }, { status: 400 });
    }

    const promo = validacion.promo;

    const db = createAdminClient() as any;
    const { data: perfil } = await db
      .from("perfiles")
      .select("es_socio")
      .eq("id", user.id)
      .single();

    const esSocio = perfil?.es_socio === true;

    const subtotalNormal = items.reduce(
      (sum, i) =>
        sum + (Number(i.precio) + Number(i.precioExtra ?? 0)) * i.cantidad,
      0
    );

    const minimoCheck = validarMontoMinimo(promo, subtotalNormal);
    if (!minimoCheck.ok) {
      return NextResponse.json({ error: minimoCheck.error }, { status: 400 });
    }

    const result = aplicarPromocode({
      items: items as ApplyItem[],
      esSocio,
      promo,
    });

    return NextResponse.json({
      promocode: {
        codigo: promo.codigo,
        descripcion: promo.descripcion,
        tipo_descuento: promo.tipo_descuento,
        valor: Number(promo.valor),
        acumulable_con_precio_socio: promo.acumulable_con_precio_socio,
      },
      preview: {
        subtotal: result.subtotal,
        descuento: result.descuento,
        total: result.total,
        aplicoPrecioSocio: result.aplicoPrecioSocio,
        aplicoPromocode: result.aplicoPromocode,
      },
    });
  } catch (e: any) {
    console.error("Error validando promocode:", e?.message || e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
