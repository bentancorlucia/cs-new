import { hoyUruguay } from "@/lib/contabilidad/formato";
import { sumarDias } from "@/lib/reportes/rango";
import { controlContable, ORIGENES_VENTA } from "@/lib/reportes/control";
import {
  canalDe,
  cargarCuentasTienda,
  cargarVentas,
  clientesReportes,
  leerTodo,
  productosOrdenados,
  r2,
  totales,
  type ClientesReportes,
  type DatosVentas,
} from "@/lib/reportes/ventas";
import type { DashboardTienda, ResumenVentas } from "@/types/reportes";

/**
 * Foto de la tienda para /admin y el MCP (estado_tienda_hoy). Las ventas
 * salen del mismo motor que los reportes (comercial.ventas a fecha
 * contable, sin donaciones, con devoluciones), así hoy / 7 días / mes dan
 * lo mismo que el reporte de esos rangos. Quien llama ya validó el rol.
 */
export async function obtenerDashboardTienda(cl: ClientesReportes = clientesReportes()): Promise<DashboardTienda> {
  const hoy = hoyUruguay();
  const inicioSemana = sumarDias(hoy, -6);
  const inicioMes = `${hoy.slice(0, 8)}01`;
  const inicioAnio = sumarDias(hoy, -364);
  const mes = { desde: inicioMes, hasta: hoy };

  const cuentas = await cargarCuentasTienda(cl);
  const delMesP = cargarVentas(cl, mes, { detalle: true, cuentas });
  const controlP = delMesP.then((d) =>
    controlContable(cl, cuentas, mes, {
      concepto: "Ventas netas",
      reportePorRol: totales(d).porRol,
      signo: "acreedor",
      origenes: ORIGENES_VENTA,
      centros: cuentas.centros,
    })
  );
  const [anual, delMes, control, pendientes, encargues, activos, stock, recientes] = await Promise.all([
    cargarVentas(cl, { desde: inicioAnio < inicioMes ? inicioAnio : inicioMes, hasta: hoy }, { cuentas }),
    delMesP,
    controlP,
    contarPendientes(cl),
    leerTodo<{ pedido_id: number; monto_encargues: number }>((a, b) =>
      cl.comercial
        .from("ventas")
        .select("pedido_id, monto_encargues")
        .eq("anulada", false)
        .gt("monto_encargues", 0)
        .is("asiento_entrega_id", null)
        .order("pedido_id")
        .range(a, b)
    ),
    cl.publico.from("productos").select("id", { count: "exact", head: true }).or("activo.eq.true,activo_pos.eq.true"),
    estadoStock(cl),
    pedidosRecientes(cl),
  ]);
  if (activos.error) throw new Error(activos.error.message);

  const resumen = (desde: string): ResumenVentas => {
    const hs = anual.hechos.filter((h) => h.fecha >= desde && h.fecha <= hoy);
    const ventas = hs.reduce((s, h) => s + h.importe, 0);
    const costo = hs.reduce((s, h) => s + h.costo, 0);
    return { ventas: r2(ventas), costo: r2(costo), margen: r2(ventas - costo), pedidos: hs.filter((h) => h.tipo === "venta").length };
  };

  return {
    hoy,
    generado: new Date().toISOString(),
    ventas: { hoy: resumen(hoy), semana: resumen(inicioSemana), mes: resumen(inicioMes) },
    pendientes,
    encarguesPendientes: {
      pedidos: encargues.length,
      importe: r2(encargues.reduce((s, e) => s + Number(e.monto_encargues), 0)),
    },
    productosActivos: activos.count ?? 0,
    stock,
    pedidosRecientes: recientes,
    topProductosMes: delMes.detalle
      ? productosOrdenados(delMes.detalle).slice(0, 5)
      : [],
    serie: serieDiaria(anual, inicioAnio, hoy),
    controlMes: {
      reporte: control.reporte,
      saldoCuentas: control.saldoCuentas,
      diferencia: control.diferencia,
      cuadra: control.cuadra,
    },
  };
}

function serieDiaria(d: DatosVentas, desde: string, hasta: string) {
  const dias = new Map<string, { fecha: string; online: number; pos: number; disciplina: number }>();
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) dias.set(f, { fecha: f, online: 0, pos: 0, disciplina: 0 });
  for (const h of d.hechos) {
    const b = dias.get(h.fecha);
    if (b) b[h.canal] += h.importe;
  }
  return [...dias.values()].map((b) => ({ ...b, online: r2(b.online), pos: r2(b.pos), disciplina: r2(b.disciplina) }));
}

async function contarPendientes(cl: ClientesReportes): Promise<DashboardTienda["pendientes"]> {
  const contar = (estados: string[]) =>
    cl.publico.from("pedidos").select("id", { count: "exact", head: true }).in("estado", estados);
  const [v, p, e, r] = await Promise.all([
    contar(["pendiente_verificacion"]),
    contar(["pagado", "preparando"]),
    contar(["encargado"]),
    contar(["listo_retiro"]),
  ]);
  const error = v.error ?? p.error ?? e.error ?? r.error;
  if (error) throw new Error(error.message);
  return { verificacion: v.count ?? 0, preparar: p.count ?? 0, encargados: e.count ?? 0, retirar: r.count ?? 0 };
}

/**
 * Stock por producto con el mismo criterio que /admin/stock: existencia de
 * comercial.items (o el espejo si el ítem todavía no pasó por el motor),
 * sumada por producto; bajo = 0 < stock ≤ mínimo; agotado = 0.
 */
async function estadoStock(cl: ClientesReportes): Promise<DashboardTienda["stock"]> {
  type FilaProd = {
    id: number;
    nombre: string;
    sku: string | null;
    stock_actual: number;
    stock_minimo: number | null;
    activo: boolean | null;
    activo_pos: boolean;
    producto_variantes: { id: number; stock_actual: number }[];
  };
  const [prods, items] = await Promise.all([
    leerTodo<FilaProd>((a, b) =>
      cl.publico
        .from("productos")
        .select("id, nombre, sku, stock_actual, stock_minimo, activo, activo_pos, producto_variantes(id, stock_actual)")
        .order("id")
        .range(a, b) as unknown as PromiseLike<{ data: FilaProd[] | null; error: { message: string } | null }>
    ),
    leerTodo<{ producto_id: number; variante_id: number | null; stock: number }>((a, b) =>
      cl.comercial.from("items").select("producto_id, variante_id, stock").order("id").range(a, b)
    ),
  ]);
  const stockItem = new Map(items.map((i) => [`${i.producto_id}:${i.variante_id ?? 0}`, i.stock]));

  const vendibles = prods
    .filter((p) => p.activo !== false || p.activo_pos)
    .map((p) => {
      const vars = p.producto_variantes ?? [];
      const stock =
        vars.length > 0
          ? vars.reduce((s, v) => s + (stockItem.get(`${p.id}:${v.id}`) ?? Math.max(0, v.stock_actual ?? 0)), 0) +
            (stockItem.get(`${p.id}:0`) ?? 0)
          : (stockItem.get(`${p.id}:0`) ?? Math.max(0, p.stock_actual ?? 0));
      return { id: p.id, nombre: p.nombre, sku: p.sku, stock, stockMinimo: p.stock_minimo ?? 0 };
    });
  const bajo = vendibles.filter((p) => p.stock > 0 && p.stock <= p.stockMinimo);
  const agotados = vendibles.filter((p) => p.stock === 0);
  return {
    bajo: bajo.length,
    agotados: agotados.length,
    alertas: [...bajo, ...agotados]
      .sort((a, b) => a.stock - b.stock || b.stockMinimo - a.stockMinimo || a.nombre.localeCompare(b.nombre))
      .slice(0, 8),
  };
}

async function pedidosRecientes(cl: ClientesReportes): Promise<DashboardTienda["pedidosRecientes"]> {
  type Fila = {
    id: number;
    numero_pedido: string | null;
    tipo: string;
    estado: string;
    total: number;
    nombre_cliente: string | null;
    created_at: string | null;
    perfiles: { nombre: string | null; apellido: string | null } | null;
    donaciones: { monto: number; estado: string }[] | { monto: number; estado: string } | null;
  };
  const { data, error } = await cl.publico
    .from("pedidos")
    .select(
      "id, numero_pedido, tipo, estado, total, nombre_cliente, created_at, perfiles!perfil_id(nombre, apellido), donaciones(monto, estado)"
    )
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Fila[]).map((p) => {
    const dons = Array.isArray(p.donaciones) ? p.donaciones : p.donaciones ? [p.donaciones] : [];
    const donacion = dons.filter((d) => d.estado !== "cancelada").reduce((s, d) => s + Number(d.monto), 0);
    const perfil = p.perfiles ? `${p.perfiles.nombre ?? ""} ${p.perfiles.apellido ?? ""}`.trim() : "";
    return {
      id: p.id,
      numero_pedido: p.numero_pedido,
      tipo: canalDe(p.tipo),
      estado: p.estado,
      importe: r2(Number(p.total) - donacion),
      cliente: perfil || p.nombre_cliente,
      created_at: p.created_at ?? "",
    };
  });
}
