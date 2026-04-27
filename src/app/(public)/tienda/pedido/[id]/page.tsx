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

type MtoCampoOpcion = { valor: string; label: string };
type MtoCampo = {
  key: string;
  label: string;
  tipo: "texto" | "numero" | "select" | "talle";
  opciones?: MtoCampoOpcion[];
};

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
    es_encargue: boolean | null;
    personalizacion: Record<string, string | number> | null;
    precio_extra_personalizacion: number | null;
    productos: {
      id: number;
      nombre: string;
      slug: string;
      mto_campos: MtoCampo[] | null;
      mto_tiempo_fabricacion_dias: number | null;
    } | null;
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
        es_encargue,
        personalizacion,
        precio_extra_personalizacion,
        productos (id, nombre, slug, mto_campos, mto_tiempo_fabricacion_dias),
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
    items: pedido.pedido_items.map((item) => {
      const campos = item.productos?.mto_campos ?? [];
      const personalizacion = item.personalizacion ?? {};
      const personalizacionResumen = Object.entries(personalizacion).map(
        ([key, raw]) => {
          const campo = campos.find((c) => c.key === key);
          let valor = String(raw);
          if (campo && (campo.tipo === "select" || campo.tipo === "talle")) {
            const opcion = campo.opciones?.find((o) => o.valor === valor);
            if (opcion) valor = opcion.label;
          }
          return { key, label: campo?.label ?? key, valor };
        }
      );
      return {
        id: item.id,
        nombre: item.productos?.nombre ?? "Producto",
        variante: item.es_encargue
          ? null
          : item.producto_variantes?.nombre ?? null,
        cantidad: item.cantidad,
        precioUnitario: item.precio_unitario,
        subtotal: item.subtotal,
        esEncargue: item.es_encargue === true,
        personalizacion: personalizacionResumen,
        precioExtra: Number(item.precio_extra_personalizacion ?? 0),
        tiempoFabricacionDias: item.productos?.mto_tiempo_fabricacion_dias ?? null,
      };
    }),
  };

  return (
    <PedidoConfirmacionClient
      pedido={serializedPedido}
      paymentStatus={status ?? null}
    />
  );
}
