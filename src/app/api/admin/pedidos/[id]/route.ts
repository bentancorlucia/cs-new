import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { sendOrderReady, sendOrderCancelled } from "@/lib/email";
import { resolverEmailPedido } from "@/lib/tienda/email-pedido";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const estadoSchema = z.object({
  estado: z.enum([
    "pendiente",
    "pendiente_verificacion",
    "pagado",
    "preparando",
    "encargado",
    "listo_retiro",
    "retirado",
    "cancelado",
  ]),
  motivo_cancelacion: z.string().optional(),
});

// Transiciones manuales permitidas. La aprobación de transferencias va por
// /verificar y el pago de MercadoPago por el webhook: acá no se puede pasar
// a "pagado" ni salir de "cancelado" sin tocar stock y tesorería.
const TRANSICIONES: Record<string, string[]> = {
  pendiente: ["cancelado"],
  pendiente_verificacion: ["cancelado"],
  pagado: ["encargado", "preparando", "listo_retiro", "retirado", "cancelado"],
  encargado: ["preparando", "listo_retiro", "cancelado"],
  preparando: ["listo_retiro", "retirado", "cancelado"],
  listo_retiro: ["preparando", "retirado", "cancelado"],
  retirado: ["cancelado"],
  cancelado: [],
};

const contactoSchema = z.object({
  email_cliente: z
    .string()
    .trim()
    .max(255)
    .refine((v) => v === "" || z.string().email().safeParse(v).success, {
      message: "Email inválido",
    })
    .transform((v) => (v === "" ? null : v.toLowerCase())),
});

// GET /api/admin/pedidos/[id] — detalle de pedido
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("pedidos")
      .select(
        `
        *,
        perfiles!perfil_id(id, nombre, apellido, telefono, cedula, es_socio),
        pedido_items(
          id, cantidad, precio_unitario, subtotal,
          es_encargue, personalizacion, precio_extra_personalizacion,
          productos(id, nombre, slug, mto_campos),
          producto_variantes(id, nombre)
        ),
        donaciones(id, monto, estado, cobrada_at, transferencia_id)
      `
      )
      .eq("id", parseInt(id))
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    // Normalizar donaciones a array (PostgREST devuelve objeto único por UNIQUE en pedido_id)
    const dRaw = (data as any).donaciones;
    (data as any).donaciones = dRaw == null ? [] : Array.isArray(dRaw) ? dRaw : [dRaw];

    const { data: comprobantesData } = await supabase
      .from("comprobantes")
      .select(
        "id, url, nombre_archivo, tipo, tamano_bytes, datos_extraidos, estado, verificado_at, motivo_rechazo"
      )
      .eq("pedido_id", parseInt(id))
      .order("created_at", { ascending: false });

    (data as any).comprobantes = comprobantesData ?? [];

    if (Array.isArray((data as any).comprobantes) && (data as any).comprobantes.length > 0) {
      const pathRegex = /\/storage\/v1\/object\/(?:sign|public)\/comprobantes\/([^?]+)/;
      await Promise.all(
        (data as any).comprobantes.map(async (comp: any) => {
          if (!comp?.url) return;
          const match = pathRegex.exec(comp.url);
          if (!match) return;
          const path = decodeURIComponent(match[1]);
          const { data: signed } = await supabase.storage
            .from("comprobantes")
            .createSignedUrl(path, 3600);
          if (signed?.signedUrl) {
            comp.url = signed.signedUrl;
          }
        })
      );
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/admin/pedidos/[id] — actualizar estado
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const supabase = createAdminClient();
    const body = await request.json();
    const parsed = estadoSchema.parse(body);

    const db = supabase as any;
    const pedidoId = parseInt(id);

    const { data: actual } = await db
      .from("pedidos")
      .select("id, estado")
      .eq("id", pedidoId)
      .single();

    if (!actual) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    if (actual.estado === parsed.estado) {
      return NextResponse.json(
        { error: `El pedido ya está en estado "${parsed.estado}"` },
        { status: 400 }
      );
    }

    if (!(TRANSICIONES[actual.estado] ?? []).includes(parsed.estado)) {
      return NextResponse.json(
        {
          error: `No se puede pasar de "${actual.estado}" a "${parsed.estado}"`,
        },
        { status: 400 }
      );
    }

    let data: any;

    if (parsed.estado === "cancelado") {
      // Atómico: repone stock (o libera la reserva), revierte ingresos en
      // tesorería, cancela la donación y devuelve el uso del promocode.
      const user = await getCurrentUser();
      const { data: canc, error: cancError } = await db.rpc("cancelar_pedido", {
        p_pedido_id: pedidoId,
        p_motivo: parsed.motivo_cancelacion || null,
        p_registrado_por: user?.id ?? null,
      });
      if (cancError) throw cancError;
      if (canc?.ok === false) {
        return NextResponse.json({ error: "No se pudo cancelar el pedido" }, { status: 400 });
      }

      const { data: row, error } = await db
        .from("pedidos")
        .select()
        .eq("id", pedidoId)
        .single();
      if (error) throw error;
      data = row;
    } else {
      const { data: row, error } = await db
        .from("pedidos")
        .update({
          estado: parsed.estado,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pedidoId)
        .eq("estado", actual.estado)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!row) {
        return NextResponse.json(
          { error: "El pedido cambió mientras lo editabas. Recargá la página." },
          { status: 409 }
        );
      }
      data = row;
    }

    // Send cancellation email (cuenta o email_cliente del POS)
    if (parsed.estado === "cancelado") {
      try {
        const { email: userEmail } = await resolverEmailPedido(db, data);
        if (userEmail) {
          await sendOrderCancelled(userEmail, {
            nombreCliente: data.nombre_cliente || "Cliente",
            numeroPedido: data.numero_pedido,
            motivo: parsed.motivo_cancelacion,
          });
        }
      } catch (emailError) {
        console.error("Error sending order cancelled email:", emailError);
      }
    }

    // Send "ready for pickup" email when order transitions to listo_retiro
    if (parsed.estado === "listo_retiro") {
      try {
        const { email: userEmail, tieneCuenta } = await resolverEmailPedido(db, data);
        if (userEmail) {
          const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://clubseminario.com.uy";
          await sendOrderReady(userEmail, {
            nombreCliente: data.nombre_cliente || "Cliente",
            numeroPedido: data.numero_pedido,
            pedidoUrl: tieneCuenta ? `${APP_URL}/tienda/pedido/${data.id}` : undefined,
          });
        }
      } catch (emailError) {
        console.error("Error sending order ready email:", emailError);
      }
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/admin/pedidos/[id] — actualizar email de contacto para avisos
// (clientes presenciales sin cuenta).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const db = createAdminClient() as any;
    const parsed = contactoSchema.parse(await request.json());

    const { data, error } = await db
      .from("pedidos")
      .update({
        email_cliente: parsed.email_cliente,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parseInt(id))
      .select("id, email_cliente")
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
