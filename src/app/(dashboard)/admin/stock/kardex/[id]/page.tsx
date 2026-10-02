import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createComercialClient, permisosComercial } from "@/lib/comercial/server";
import { leerPaginado } from "@/lib/contabilidad/reportes";
import { origenMovimiento } from "@/lib/comercial/stock";
import { KardexCliente, type FilaKardex } from "@/components/stock/kardex-cliente";
import { cargarStock } from "../../_lib/datos";

export const metadata: Metadata = { title: "Kardex" };
export const dynamic = "force-dynamic";

type Mov = {
  id: number;
  item_id: number;
  fecha: string;
  tipo: string;
  cantidad: number;
  costo_unitario: number;
  valor: number;
  stock_resultante: number;
  valor_resultante: number;
  origen_tipo: string;
  origen_id: string;
  motivo: string | null;
  asiento_id: string | null;
  creado_por: string | null;
  created_at: string;
};

/** `comercial.devoluciones` todavía no está en los tipos generados. */
type ClienteDevoluciones = {
  from(t: "devoluciones"): {
    select(c: "id, pedido_id"): {
      in(col: "id", v: number[]): PromiseLike<{ data: { id: number; pedido_id: number }[] | null }>;
    };
  };
};

export default async function KardexPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variante?: string }>;
}) {
  const [{ id }, { variante }, { puedeOperar }] = await Promise.all([params, searchParams, permisosComercial()]);
  const productoId = Number(id);
  if (!Number.isInteger(productoId) || productoId <= 0) notFound();

  const verCostos = puedeOperar;
  const { productos, error } = await cargarStock({ productoIds: [productoId], verCostos });
  const producto = productos[0];
  if (!producto) notFound();

  // Ítem elegido: "todas" (default con variantes) o una variante / el producto.
  const elegido =
    variante !== undefined && variante !== "todas"
      ? producto.items.find((i) => String(i.varianteId ?? 0) === variante) ?? null
      : null;
  const items = elegido ? [elegido] : producto.items;
  const itemIds = items.map((i) => i.itemId).filter((x): x is number => x !== null);

  const com = await createComercialClient();
  const db = await createServerClient();
  const movsRes = itemIds.length
    ? await leerPaginado<Mov>((a, b) =>
        com
          .from("movimientos")
          .select(
            "id, item_id, fecha, tipo, cantidad, costo_unitario, valor, stock_resultante, valor_resultante, origen_tipo, origen_id, motivo, asiento_id, creado_por, created_at"
          )
          .in("item_id", itemIds)
          .order("id", { ascending: false })
          .range(a, b)
      )
    : { filas: [] as Mov[], error: null };

  const movs = movsRes.filas;

  // Datos para mostrar el origen: número de pedido y pedido de cada devolución.
  const devIds = [...new Set(movs.filter((m) => m.origen_tipo === "devolucion_venta").map((m) => Number(m.origen_id)))];
  const { data: devs } = devIds.length
    ? await (com as unknown as ClienteDevoluciones).from("devoluciones").select("id, pedido_id").in("id", devIds)
    : { data: [] as { id: number; pedido_id: number }[] };
  const pedidoDeDevolucion = new Map((devs ?? []).map((d) => [String(d.id), d.pedido_id]));

  const pedidoIds = [
    ...new Set([
      ...movs
        .filter((m) => m.origen_tipo === "pedido" || m.origen_tipo === "pedido_cancelacion")
        .map((m) => Number(m.origen_id)),
      ...[...pedidoDeDevolucion.values()],
    ]),
  ].filter((n) => Number.isInteger(n));
  const usuarios = [...new Set(movs.map((m) => m.creado_por).filter((u): u is string => !!u))];

  const [{ data: pedidos }, { data: perfiles }] = await Promise.all([
    pedidoIds.length
      ? db.from("pedidos").select("id, numero_pedido").in("id", pedidoIds)
      : Promise.resolve({ data: [] as { id: number; numero_pedido: string | null }[] }),
    usuarios.length
      ? db.from("perfiles").select("id, nombre, apellido").in("id", usuarios)
      : Promise.resolve({ data: [] as { id: string; nombre: string; apellido: string }[] }),
  ]);
  const numeroPedido = new Map((pedidos ?? []).map((p) => [String(p.id), p.numero_pedido]));
  const nombreUsuario = new Map((perfiles ?? []).map((p) => [p.id, `${p.nombre} ${p.apellido}`.trim()]));
  const nombreItem = new Map(producto.items.map((i) => [i.itemId, i.nombre]));

  const filas: FilaKardex[] = movs.map((m) => {
    const origen = origenMovimiento(m.origen_tipo, m.origen_id, { numeroPedido, pedidoDeDevolucion });
    return {
      id: m.id,
      fecha: m.fecha,
      creado: m.created_at,
      tipo: m.tipo,
      item: nombreItem.get(m.item_id) ?? "",
      cantidad: m.cantidad,
      costoUnitario: verCostos ? Number(m.costo_unitario) : null,
      valor: verCostos ? Number(m.valor) : null,
      stockResultante: m.stock_resultante,
      valorResultante: verCostos ? Number(m.valor_resultante) : null,
      origen: origen.etiqueta,
      origenHref: origen.href,
      // El motivo genérico de la carga inicial repite el origen
      motivo: m.origen_tipo === "inventario_inicial" ? null : m.motivo,
      asientoId: m.asiento_id,
      usuario: m.creado_por ? nombreUsuario.get(m.creado_por) ?? null : null,
    };
  });

  return (
    <KardexCliente
      producto={producto}
      seleccion={elegido ? String(elegido.varianteId ?? 0) : "todas"}
      filas={filas}
      verCostos={verCostos}
      puedeOperar={puedeOperar}
      error={error ?? movsRes.error}
    />
  );
}
