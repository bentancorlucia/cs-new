import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOrderReady, sendOrderCancelled } from "@/lib/email";
import { resolverEmailPedido } from "@/lib/tienda/email-pedido";
import { mensajeError } from "@/lib/contabilidad/formato";
import {
  ErrorHttp,
  contabilidadDePedido,
  exigir,
  idNumerico,
  respuestaError,
} from "@/lib/comercial/pedidos";
import type {
  CampoMto,
  Comprobante,
  DatosOcr,
  EstadoDonacion,
  EstadoPedido,
  PedidoDetalle,
  TipoPedido,
} from "@/components/pedidos/tipos";

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
  motivo_cancelacion: z.string().trim().max(500).optional(),
});

// Transiciones manuales permitidas. La aprobación de transferencias va por
// /verificar: acá no se puede pasar a "pagado" ni salir de "cancelado".
// Pasar a "retirado" reconoce la venta de los encargues (trigger en la base).
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

const uno = <T,>(v: T | T[] | null | undefined): T | null =>
  v == null ? null : Array.isArray(v) ? v[0] ?? null : v;

// GET /api/admin/pedidos/[id] — detalle con comprobante y contabilidad
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const permisos = await exigir((p) => p.puedeVer);
    const pedidoId = idNumerico((await params).id);
    const db = createAdminClient();

    const { data: p, error } = await db
      .from("pedidos")
      .select(
        `*,
        perfiles!perfil_id(nombre, apellido, telefono, cedula, es_socio),
        disciplinas(id, nombre),
        pedido_items(
          id, cantidad, precio_unitario, subtotal, costo_unitario_venta,
          es_encargue, personalizacion, precio_extra_personalizacion,
          productos(id, nombre, slug, mto_campos),
          producto_variantes(id, nombre)
        ),
        donaciones(id, monto, estado, transferencia_id)`
      )
      .eq("id", pedidoId)
      .maybeSingle();
    if (error) throw error;
    if (!p) throw new ErrorHttp(404, "Pedido no encontrado");

    const [{ data: comps }, contabilidad] = await Promise.all([
      db
        .from("comprobantes")
        .select("id, url, nombre_archivo, tipo, tamano_bytes, datos_extraidos, estado, verificado_at, motivo_rechazo")
        .eq("pedido_id", pedidoId)
        .order("created_at", { ascending: false }),
      contabilidadDePedido(pedidoId),
    ]);

    // URL re-firmada por 1 h (la guardada puede estar vencida)
    const pathRegex = /\/storage\/v1\/object\/(?:sign|public)\/comprobantes\/([^?]+)/;
    const comprobantes: Comprobante[] = await Promise.all(
      (comps ?? []).map(async (c) => {
        let url = c.url;
        const m = c.url ? pathRegex.exec(c.url) : null;
        if (m) {
          const { data: firmada } = await db.storage
            .from("comprobantes")
            .createSignedUrl(decodeURIComponent(m[1]), 3600);
          if (firmada?.signedUrl) url = firmada.signedUrl;
        }
        return {
          id: c.id,
          url,
          nombre_archivo: c.nombre_archivo,
          tipo: c.tipo,
          tamano_bytes: c.tamano_bytes,
          datos_extraidos: (c.datos_extraidos as DatosOcr | null) ?? null,
          estado: c.estado,
          verificado_at: c.verificado_at,
          motivo_rechazo: c.motivo_rechazo,
        };
      })
    );

    const perfil = uno(p.perfiles);
    const disc = uno(p.disciplinas);
    const don = uno(p.donaciones);

    const data: PedidoDetalle = {
      id: p.id,
      numero_pedido: p.numero_pedido ?? String(p.id),
      tipo: p.tipo as TipoPedido,
      estado: p.estado as EstadoPedido,
      subtotal: Number(p.subtotal),
      descuento: Number(p.descuento ?? 0),
      total: Number(p.total),
      metodo_pago: p.metodo_pago,
      monto_efectivo: p.monto_efectivo == null ? null : Number(p.monto_efectivo),
      monto_transferencia: p.monto_transferencia == null ? null : Number(p.monto_transferencia),
      nombre_cliente: p.nombre_cliente,
      telefono_cliente: p.telefono_cliente,
      email_cliente: p.email_cliente,
      perfil_id: p.perfil_id,
      notas: p.notas,
      created_at: p.created_at ?? "",
      aplico_precio_socio: p.aplico_precio_socio,
      disciplina: disc ? { id: disc.id, nombre: disc.nombre } : null,
      perfil: perfil
        ? {
            nombre: perfil.nombre,
            apellido: perfil.apellido,
            telefono: perfil.telefono,
            cedula: perfil.cedula,
            es_socio: perfil.es_socio,
          }
        : null,
      items: (p.pedido_items ?? [])
        .slice()
        .sort((a, b) => a.id - b.id)
        .map((i) => {
          const prod = uno(i.productos);
          const v = uno(i.producto_variantes);
          return {
            id: i.id,
            cantidad: i.cantidad,
            precio_unitario: Number(i.precio_unitario),
            subtotal: Number(i.subtotal),
            es_encargue: i.es_encargue,
            personalizacion: (i.personalizacion ?? {}) as Record<string, string | number>,
            precio_extra_personalizacion: Number(i.precio_extra_personalizacion ?? 0),
            costo_unitario_venta: i.costo_unitario_venta == null ? null : Number(i.costo_unitario_venta),
            producto: {
              id: prod?.id ?? 0,
              nombre: prod?.nombre ?? "Producto",
              slug: prod?.slug ?? null,
              mto_campos: Array.isArray(prod?.mto_campos) ? (prod.mto_campos as unknown as CampoMto[]) : [],
            },
            variante: v ? { id: v.id, nombre: v.nombre } : null,
          };
        }),
      donacion: don
        ? {
            id: don.id,
            monto: Number(don.monto),
            estado: don.estado as EstadoDonacion,
            transferencia_id: don.transferencia_id,
          }
        : null,
      comprobantes,
      contabilidad,
      permisos: {
        puedeOperar: permisos.puedeOperar,
        puedeOperarComercial: permisos.puedeOperarComercial,
        puedeVerContabilidad: permisos.puedeVerContabilidad,
        puedeEscribirContabilidad: permisos.puedeEscribirContabilidad,
      },
    };

    return NextResponse.json({ data });
  } catch (error) {
    return respuestaError(error);
  }
}

// PUT /api/admin/pedidos/[id] — cambio de estado (cancelación vía cancelar_pedido)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const permisos = await exigir((p) => p.puedeOperar);
    const pedidoId = idNumerico((await params).id);
    const db = createAdminClient();
    const parsed = estadoSchema.parse(await request.json());

    const { data: actual } = await db
      .from("pedidos")
      .select("id, estado")
      .eq("id", pedidoId)
      .maybeSingle();
    if (!actual) throw new ErrorHttp(404, "Pedido no encontrado");

    if (actual.estado === parsed.estado) {
      throw new ErrorHttp(400, `El pedido ya está en estado "${parsed.estado}"`);
    }
    if (!(TRANSICIONES[actual.estado] ?? []).includes(parsed.estado)) {
      throw new ErrorHttp(400, `No se puede pasar de "${actual.estado}" a "${parsed.estado}"`);
    }

    if (parsed.estado === "cancelado") {
      // Atómico: revierte los asientos del pedido, devuelve la mercadería al
      // costo con que salió (o libera la reserva), cancela la donación y
      // devuelve el uso del promocode.
      const { data: canc, error: cancError } = await db.rpc("cancelar_pedido", {
        p_pedido_id: pedidoId,
        p_motivo: parsed.motivo_cancelacion || undefined,
        p_registrado_por: permisos.userId ?? undefined,
      });
      if (cancError) throw new ErrorHttp(400, mensajeError(cancError));
      if ((canc as { ok?: boolean } | null)?.ok === false) {
        throw new ErrorHttp(400, "No se pudo cancelar el pedido");
      }
    } else {
      const { data: fila, error } = await db
        .from("pedidos")
        .update({ estado: parsed.estado, updated_at: new Date().toISOString() })
        .eq("id", pedidoId)
        .eq("estado", actual.estado)
        .select("id")
        .maybeSingle();
      if (error) throw new ErrorHttp(400, mensajeError(error));
      if (!fila) {
        throw new ErrorHttp(409, "El pedido cambió mientras lo editabas. Recargá la página.");
      }
    }

    const { data, error } = await db
      .from("pedidos")
      .select("id, estado, numero_pedido, nombre_cliente, perfil_id, email_cliente")
      .eq("id", pedidoId)
      .single();
    if (error) throw error;

    // Avisos por email (cuenta o email_cliente del POS); un error no corta.
    if (parsed.estado === "cancelado" || parsed.estado === "listo_retiro") {
      try {
        const { email, tieneCuenta } = await resolverEmailPedido(db, data);
        if (email && parsed.estado === "cancelado") {
          await sendOrderCancelled(email, {
            nombreCliente: data.nombre_cliente || "Cliente",
            numeroPedido: data.numero_pedido ?? String(data.id),
            motivo: parsed.motivo_cancelacion,
          });
        }
        if (email && parsed.estado === "listo_retiro") {
          const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://clubseminario.com.uy";
          await sendOrderReady(email, {
            nombreCliente: data.nombre_cliente || "Cliente",
            numeroPedido: data.numero_pedido ?? String(data.id),
            pedidoUrl: tieneCuenta ? `${APP_URL}/tienda/pedido/${data.id}` : undefined,
          });
        }
      } catch (emailError) {
        console.error("Error al enviar el aviso del pedido:", emailError);
      }
    }

    return NextResponse.json({ data: { id: data.id, estado: data.estado } });
  } catch (error) {
    return respuestaError(error);
  }
}

// PATCH /api/admin/pedidos/[id] — email de contacto para avisos (clientes sin cuenta)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await exigir((p) => p.puedeOperar);
    const pedidoId = idNumerico((await params).id);
    const db = createAdminClient();
    const parsed = contactoSchema.parse(await request.json());

    const { data, error } = await db
      .from("pedidos")
      .update({ email_cliente: parsed.email_cliente, updated_at: new Date().toISOString() })
      .eq("id", pedidoId)
      .select("id, email_cliente")
      .single();
    if (error) throw new ErrorHttp(400, mensajeError(error));

    return NextResponse.json({ data });
  } catch (error) {
    return respuestaError(error);
  }
}
