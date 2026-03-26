import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PedidoConfirmacionClient } from "./pedido-confirmacion-client";

export const metadata: Metadata = {
  title: "Pedido",
  description: "Estado de tu pedido en Club Seminario.",
};

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}

type PedidoResult = {
  id: number;
  numero_pedido: string;
  estado: string;
  subtotal: number;
  descuento: number;
  total: number;
  metodo_pago: string | null;
  notas: string | null;
  created_at: string;
  pedido_items: {
    id: number;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
    productos: { id: number; nombre: string; slug: string } | null;
    producto_variantes: { id: number; nombre: string } | null;
  }[];
};

export default async function PedidoPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { status } = await searchParams;
  const pedidoId = parseInt(id);

  if (isNaN(pedidoId)) notFound();

  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const { data: pedidoRaw } = await supabase
    .from("pedidos")
    .select(
      `
      id,
      numero_pedido,
      estado,
      subtotal,
      descuento,
      total,
      metodo_pago,
      notas,
      created_at,
      pedido_items (
        id,
        cantidad,
        precio_unitario,
        subtotal,
        productos (id, nombre, slug),
        producto_variantes (id, nombre)
      )
    `
    )
    .eq("id", pedidoId)
    .eq("perfil_id", user.id)
    .single();

  const pedido = pedidoRaw as PedidoResult | null;

  if (!pedido) notFound();

  const serializedPedido = {
    id: pedido.id,
    numero_pedido: pedido.numero_pedido,
    estado: pedido.estado,
    subtotal: pedido.subtotal,
    descuento: pedido.descuento,
    total: pedido.total,
    metodo_pago: pedido.metodo_pago,
    notas: pedido.notas,
    created_at: pedido.created_at,
    items: pedido.pedido_items.map((item) => ({
      id: item.id,
      nombre: item.productos?.nombre ?? "Producto",
      variante: item.producto_variantes?.nombre ?? null,
      cantidad: item.cantidad,
      precioUnitario: item.precio_unitario,
      subtotal: item.subtotal,
    })),
  };

  return (
    <PedidoConfirmacionClient
      pedido={serializedPedido}
      paymentStatus={status ?? null}
    />
  );
}
