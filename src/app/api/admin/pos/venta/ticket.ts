import type { createAdminClient } from "@/lib/supabase/admin";
import type { MtoCampo } from "@/types/mto";
import { resumirPersonalizacion } from "@/lib/mto/pricing";
import type { MetodoPagoPos, TicketVenta } from "@/components/pos/tipos";

type AdminDb = ReturnType<typeof createAdminClient>;

/** Texto del descuento del pedido tal como quedó guardado. */
export function conceptoDescuento(tipo: string | null, porcentaje: number | null, motivo: string | null): string {
  const base =
    tipo === "socio"
      ? "Beneficio socio"
      : tipo === "porcentaje" && porcentaje
        ? `Descuento ${porcentaje}%`
        : "Descuento";
  return motivo ? `${base} (${motivo})` : base;
}

/**
 * Ticket de un pedido del POS leído de la base (reintentos con la misma
 * clave). Devuelve `null` si el pedido no existe y `"en_proceso"` si
 * todavía no tiene ítems (la venta original sigue registrándose).
 */
export async function ticketDesdeBase(db: AdminDb, pedidoId: number): Promise<TicketVenta | "en_proceso" | null> {
  const { data: p } = await db
    .from("pedidos")
    .select(
      "id, numero_pedido, created_at, estado, nombre_cliente, subtotal, descuento, descuento_tipo, descuento_porcentaje, descuento_motivo, total, metodo_pago, monto_efectivo, monto_transferencia, pedido_items(cantidad, precio_unitario, precio_extra_personalizacion, subtotal, es_encargue, personalizacion, productos(nombre, mto_campos), producto_variantes(nombre))"
    )
    .eq("id", pedidoId)
    .maybeSingle();
  if (!p) return null;
  const items = p.pedido_items ?? [];
  if (items.length === 0) return "en_proceso";
  const descuento = Number(p.descuento ?? 0);
  return {
    pedido_id: p.id,
    numero_pedido: p.numero_pedido ?? String(p.id),
    fecha: p.created_at ?? new Date().toISOString(),
    estado: p.estado ?? "",
    cliente: p.nombre_cliente,
    items: items.map((i) => {
      const campos = (Array.isArray(i.productos?.mto_campos) ? i.productos.mto_campos : []) as unknown as MtoCampo[];
      const pers = (i.personalizacion ?? {}) as Record<string, string | number>;
      const detalle = i.es_encargue
        ? resumirPersonalizacion(campos, pers)
            .map((r) => `${r.label}: ${r.valor}`)
            .join(" · ") || null
        : null;
      const nombre = i.productos?.nombre ?? "Producto";
      return {
        nombre: i.producto_variantes?.nombre ? `${nombre} - ${i.producto_variantes.nombre}` : nombre,
        detalle,
        cantidad: i.cantidad,
        precio_unitario: Number(i.precio_unitario) + Number(i.precio_extra_personalizacion ?? 0),
        subtotal: Number(i.subtotal),
        es_encargue: i.es_encargue,
      };
    }),
    subtotal: Number(p.subtotal),
    descuentos:
      descuento > 0
        ? [
            {
              concepto: conceptoDescuento(
                p.descuento_tipo,
                p.descuento_porcentaje == null ? null : Number(p.descuento_porcentaje),
                p.descuento_motivo
              ),
              importe: descuento,
            },
          ]
        : [],
    total: Number(p.total),
    metodo_pago: (p.metodo_pago ?? "efectivo") as MetodoPagoPos,
    monto_efectivo: p.monto_efectivo == null ? null : Number(p.monto_efectivo),
    monto_transferencia: p.monto_transferencia == null ? null : Number(p.monto_transferencia),
  };
}
