import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createComercialClient } from "@/lib/comercial/server";
import { leerPaginado } from "@/lib/contabilidad/reportes";
import { nombreUsuario, origenMovimiento } from "@/lib/comercial/stock";
import { KardexCliente, type FilaKardex } from "@/components/stock/kardex-cliente";
import { cargarStock } from "../../_lib/datos";
import { centrosCosto, comercialSinTipos, nombresUsuarios, permisosStock } from "../../_lib/extra";

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

export default async function KardexPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variante?: string }>;
}) {
  const [{ id }, { variante }, { puedeOperar }] = await Promise.all([params, searchParams, permisosStock()]);
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

  // Datos para mostrar el origen: número de pedido, pedido de cada
  // devolución y número de bajas y recuentos (tablas aún sin tipos generados).
  const sinTipos = await comercialSinTipos();
  const idsDe = (tipo: string) => [...new Set(movs.filter((m) => m.origen_tipo === tipo).map((m) => Number(m.origen_id)))];
  const [devIds, bajaIds, recIds] = [idsDe("devolucion_venta"), idsDe("baja"), idsDe("recuento")];
  const [devs, bajas, recs, centros] = await Promise.all([
    devIds.length ? sinTipos.from("devoluciones").select("id, pedido_id").in("id", devIds) : Promise.resolve({ data: [] }),
    bajaIds.length ? sinTipos.from("bajas").select("id, numero").in("id", bajaIds) : Promise.resolve({ data: [] }),
    recIds.length ? sinTipos.from("recuentos").select("id, numero").in("id", recIds) : Promise.resolve({ data: [] }),
    puedeOperar ? centrosCosto() : Promise.resolve([]),
  ]);
  const pedidoDeDevolucion = new Map(
    ((devs.data ?? []) as { id: number; pedido_id: number }[]).map((d) => [String(d.id), d.pedido_id])
  );
  const numeroBaja = new Map(((bajas.data ?? []) as { id: number; numero: string }[]).map((b) => [String(b.id), b.numero]));
  const numeroRecuento = new Map(((recs.data ?? []) as { id: number; numero: string }[]).map((r) => [String(r.id), r.numero]));

  const pedidoIds = [
    ...new Set([
      ...movs
        .filter((m) => m.origen_tipo === "pedido" || m.origen_tipo === "pedido_cancelacion")
        .map((m) => Number(m.origen_id)),
      ...[...pedidoDeDevolucion.values()],
    ]),
  ].filter((n) => Number.isInteger(n));

  const [{ data: pedidos }, nombres] = await Promise.all([
    pedidoIds.length
      ? db.from("pedidos").select("id, numero_pedido").in("id", pedidoIds)
      : Promise.resolve({ data: [] as { id: number; numero_pedido: string | null }[] }),
    nombresUsuarios(movs.map((m) => m.creado_por)),
  ]);
  const numeroPedido = new Map((pedidos ?? []).map((p) => [String(p.id), p.numero_pedido]));
  const nombreItem = new Map(producto.items.map((i) => [i.itemId, i.nombre]));

  const filas: FilaKardex[] = movs.map((m) => {
    const origen = origenMovimiento(m.origen_tipo, m.origen_id, {
      numeroPedido,
      pedidoDeDevolucion,
      numeroBaja,
      numeroRecuento,
    });
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
      usuario: nombreUsuario(m.creado_por, nombres),
    };
  });

  return (
    <KardexCliente
      producto={producto}
      seleccion={elegido ? String(elegido.varianteId ?? 0) : "todas"}
      filas={filas}
      verCostos={verCostos}
      puedeOperar={puedeOperar}
      centros={centros}
      error={error ?? movsRes.error}
    />
  );
}
