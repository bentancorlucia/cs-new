import { createClient } from "@supabase/supabase-js";
import type { Database as DbPublic } from "@/types/database";
import type { Database as DbComercial } from "@/types/comercial";
import type { Database as DbContabilidad } from "@/types/contabilidad";
import { leerPaginado } from "@/lib/contabilidad/reportes";
import type { Canal, RangoFechas, RolCuentaVenta } from "@/types/reportes";

/**
 * Motor único de ventas de la tienda. Lo usan el dashboard, los reportes,
 * las exportaciones y el MCP: todos los números salen de acá.
 *
 * Hechos que mueven las cuentas de ventas (4.4.x), cada uno a su fecha contable:
 *   venta      comercial.ventas no anulada            + monto_ventas      costo del kardex
 *   entrega    asiento pedido_entrega (encargue)      + monto_encargues   (sin costo en el kardex)
 *   devolucion comercial.devoluciones                 − importe_devuelto  − costo de lo devuelto
 *   cambio     comercial.devoluciones (lo nuevo)      + importe_nuevo     + costo de lo entregado
 * Lo cobrado por encargues no retirados es seña y las donaciones son un
 * pasivo: se informan aparte, nunca como venta.
 *
 * Lee con service role: quien llama ya validó el rol.
 */

// ------------------------------------------------------------
// Clientes
// ------------------------------------------------------------

export function clientesReportes() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const auth = { persistSession: false, autoRefreshToken: false };
  return {
    publico: createClient<DbPublic>(url, key, { auth }),
    comercial: createClient<DbComercial, "comercial">(url, key, { auth, db: { schema: "comercial" } }),
    conta: createClient<DbContabilidad, "contabilidad">(url, key, { auth, db: { schema: "contabilidad" } }),
  };
}

export type ClientesReportes = ReturnType<typeof clientesReportes>;

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const casiCero = (n: number) => Math.abs(n) < 0.005;

type Respuesta<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>;

/** Todas las filas (paginando de a 1000); un error corta el reporte. */
export async function leerTodo<T>(pedir: (a: number, b: number) => Respuesta<T>): Promise<T[]> {
  const { filas, error } = await leerPaginado<T>(pedir);
  if (error) throw new Error(error);
  return filas;
}

function lotes<T>(xs: T[], n = 300): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < xs.length; i += n) r.push(xs.slice(i, i + n));
  return r;
}

/** Lee por tandas de ids (para no armar URLs gigantes), paginando cada tanda. */
export async function leerPorIds<K, T>(
  ids: K[],
  pedir: (lote: K[], a: number, b: number) => Respuesta<T>
): Promise<T[]> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return [];
  const partes = await Promise.all(lotes(unicos).map((l) => leerTodo<T>((a, b) => pedir(l, a, b))));
  return partes.flat();
}

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

// ------------------------------------------------------------
// Cuentas de la tienda (contabilidad.parametros_cuentas)
// ------------------------------------------------------------

export interface CuentaTienda {
  id: string;
  codigo: string;
  nombre: string;
}

export interface CuentasTienda {
  porRol: Map<string, CuentaTienda>;
  rolDeCuenta: Map<string, string>;
  /** Centros de costo de la tienda: TIENDA + uno por disciplina. */
  centros: string[];
}

export const ROLES_VENTA: RolCuentaVenta[] = ["ventas_socios", "ventas_no_socios", "ventas_disciplinas", "devoluciones"];

export async function cargarCuentasTienda(cl: ClientesReportes): Promise<CuentasTienda> {
  const [{ data: params, error: e1 }, { data: centros, error: e2 }] = await Promise.all([
    cl.conta.from("parametros_cuentas").select("rol, cuenta_id, cuentas(codigo, nombre)").eq("proceso", "tienda"),
    cl.conta.from("centros_costo").select("id, codigo, disciplina_id"),
  ]);
  if (e1 || e2) throw new Error((e1 ?? e2)!.message);
  const porRol = new Map<string, CuentaTienda>();
  const rolDeCuenta = new Map<string, string>();
  for (const p of (params ?? []) as unknown as { rol: string; cuenta_id: string; cuentas: { codigo: string; nombre: string } | null }[]) {
    porRol.set(p.rol, { id: p.cuenta_id, codigo: p.cuentas?.codigo ?? "", nombre: p.cuentas?.nombre ?? p.rol });
    if (!rolDeCuenta.has(p.cuenta_id)) rolDeCuenta.set(p.cuenta_id, p.rol);
  }
  for (const r of ROLES_VENTA) {
    if (!porRol.has(r)) throw new Error(`Falta la cuenta contable de la tienda para "${r}" (parametros_cuentas)`);
  }
  return {
    porRol,
    rolDeCuenta,
    centros: (centros ?? []).filter((c) => c.codigo === "TIENDA" || c.disciplina_id != null).map((c) => c.id),
  };
}

// ------------------------------------------------------------
// Filas
// ------------------------------------------------------------

export interface VentaRow {
  pedido_id: number;
  fecha: string;
  cuenta_ingreso_id: string;
  monto_ventas: number;
  monto_encargues: number;
  monto_donacion: number;
  costo: number;
  asiento_id: string;
  asiento_entrega_id: string | null;
  anulada: boolean;
}

const COLUMNAS_VENTA =
  "pedido_id, fecha, cuenta_ingreso_id, monto_ventas, monto_encargues, monto_donacion, costo, asiento_id, asiento_entrega_id, anulada";

interface DevolucionRow {
  id: number;
  pedido_id: number;
  fecha: string;
  importe_devuelto: number;
  importe_nuevo: number;
  devolucion_items: {
    item_id: number;
    cantidad: number;
    importe: number;
    costo: number;
    es_nuevo: boolean;
    items: { producto_id: number } | null;
  }[];
}

export interface PedidoInfo {
  id: number;
  numero: string | null;
  canal: Canal;
  metodoPago: string;
  socio: boolean;
  promocodeId: number | null;
  promocodeCodigo: string | null;
  descuento: number;
  total: number;
}

const COLUMNAS_PEDIDO =
  "id, numero_pedido, tipo, metodo_pago, aplico_precio_socio, promocode_id, promocode_codigo, descuento, total";

type FilaPedido = {
  id: number;
  numero_pedido: string | null;
  tipo: string;
  metodo_pago: string | null;
  aplico_precio_socio: boolean | null;
  promocode_id: number | null;
  promocode_codigo: string | null;
  descuento: number | null;
  total: number;
};

export function canalDe(tipo: string): Canal {
  return tipo === "pos" ? "pos" : tipo === "disciplina" ? "disciplina" : "online";
}

// ------------------------------------------------------------
// Hechos
// ------------------------------------------------------------

export type TipoHecho = "venta" | "entrega" | "devolucion" | "cambio";

export interface Hecho {
  tipo: TipoHecho;
  fecha: string;
  pedidoId: number;
  canal: Canal;
  metodoPago: string;
  rol: RolCuentaVenta;
  /** Aporte (con signo) a las ventas netas. */
  importe: number;
  /** Aporte (con signo) al costo. */
  costo: number;
}

export interface DetalleProductos {
  productos: Map<number, { unidades: number; facturacion: number; costo: number }>;
  info: Map<number, { nombre: string; sku: string | null; categoriaId: number | null }>;
  categorias: Map<number, string>;
  unidadesSinCosto: number;
}

export interface DatosVentas {
  rango: RangoFechas;
  cuentas: CuentasTienda;
  hechos: Hecho[];
  /** Todas las ventas con fecha en el rango, incluidas las anuladas. */
  ventasRango: VentaRow[];
  pedidos: Map<number, PedidoInfo>;
  detalle: DetalleProductos | null;
}

export const ID_SIN_DETALLE = 0;

export async function cargarVentas(
  cl: ClientesReportes,
  rango: RangoFechas,
  opciones: { detalle?: boolean; cuentas?: CuentasTienda } = {}
): Promise<DatosVentas> {
  const { desde, hasta } = rango;

  const [cuentas, ventasRango, entregas, devoluciones] = await Promise.all([
    opciones.cuentas ? Promise.resolve(opciones.cuentas) : cargarCuentasTienda(cl),
    leerTodo<VentaRow>((a, b) =>
      cl.comercial
        .from("ventas")
        .select(COLUMNAS_VENTA)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("pedido_id")
        .range(a, b)
    ),
    // Encargues retirados en el rango: el asiento de entrega fija la fecha.
    leerTodo<{ id: string; fecha: string; origen_id: string | null }>((a, b) =>
      cl.conta
        .from("asientos")
        .select("id, fecha, origen_id")
        .eq("origen_tipo", "pedido_entrega")
        .eq("estado", "confirmado")
        .is("revertido_por_id", null)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("id")
        .range(a, b)
    ),
    leerTodo<DevolucionRow>((a, b) =>
      cl.comercial
        .from("devoluciones")
        .select(
          "id, pedido_id, fecha, importe_devuelto, importe_nuevo, devolucion_items(item_id, cantidad, importe, costo, es_nuevo, items(producto_id))"
        )
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("id")
        .range(a, b) as unknown as Respuesta<DevolucionRow>
    ),
  ]);

  // Ventas de otros períodos que tienen entregas o devoluciones en este
  const ventaPorPedido = new Map<number, VentaRow>(ventasRango.map((v) => [v.pedido_id, v]));
  const faltan = [
    ...entregas.map((e) => Number(e.origen_id)),
    ...devoluciones.map((d) => d.pedido_id),
  ].filter((id) => Number.isFinite(id) && !ventaPorPedido.has(id));
  const otras = await leerPorIds<number, VentaRow>(faltan, (lote, a, b) =>
    cl.comercial.from("ventas").select(COLUMNAS_VENTA).in("pedido_id", lote).order("pedido_id").range(a, b)
  );
  otras.forEach((v) => ventaPorPedido.set(v.pedido_id, v));

  const filasPedido = await leerPorIds<number, FilaPedido>([...ventaPorPedido.keys()], (lote, a, b) =>
    cl.publico.from("pedidos").select(COLUMNAS_PEDIDO).in("id", lote).order("id").range(a, b)
  );
  const pedidos = new Map<number, PedidoInfo>(
    filasPedido.map((p) => [
      p.id,
      {
        id: p.id,
        numero: p.numero_pedido,
        canal: canalDe(p.tipo),
        metodoPago: p.metodo_pago || "sin_metodo",
        socio: !!p.aplico_precio_socio,
        promocodeId: p.promocode_id,
        promocodeCodigo: p.promocode_codigo,
        descuento: num(p.descuento),
        total: num(p.total),
      },
    ])
  );

  const rolVenta = (v: VentaRow): RolCuentaVenta => {
    const rol = cuentas.rolDeCuenta.get(v.cuenta_ingreso_id);
    return rol === "ventas_socios" || rol === "ventas_no_socios" || rol === "ventas_disciplinas" ? rol : "ventas_no_socios";
  };
  const base = (pedidoId: number) => {
    const p = pedidos.get(pedidoId);
    return { canal: p?.canal ?? ("online" as Canal), metodoPago: p?.metodoPago ?? "sin_metodo" };
  };

  const hechos: Hecho[] = [];
  for (const v of ventasRango) {
    if (v.anulada) continue;
    hechos.push({
      tipo: "venta",
      fecha: v.fecha,
      pedidoId: v.pedido_id,
      ...base(v.pedido_id),
      rol: rolVenta(v),
      importe: num(v.monto_ventas),
      costo: num(v.costo),
    });
  }
  const entregasVigentes: { venta: VentaRow; fecha: string }[] = [];
  for (const e of entregas) {
    const v = ventaPorPedido.get(Number(e.origen_id));
    if (!v || v.anulada || v.asiento_entrega_id !== e.id) continue;
    entregasVigentes.push({ venta: v, fecha: e.fecha });
    hechos.push({
      tipo: "entrega",
      fecha: e.fecha,
      pedidoId: v.pedido_id,
      ...base(v.pedido_id),
      rol: rolVenta(v),
      importe: num(v.monto_encargues),
      costo: 0,
    });
  }
  for (const d of devoluciones) {
    const v = ventaPorPedido.get(d.pedido_id);
    const items = d.devolucion_items ?? [];
    const costoDevuelto = items.filter((i) => !i.es_nuevo).reduce((s, i) => s + num(i.costo), 0);
    const costoNuevo = items.filter((i) => i.es_nuevo).reduce((s, i) => s + num(i.costo), 0);
    if (num(d.importe_devuelto) > 0 || costoDevuelto > 0) {
      hechos.push({
        tipo: "devolucion",
        fecha: d.fecha,
        pedidoId: d.pedido_id,
        ...base(d.pedido_id),
        rol: "devoluciones",
        importe: -num(d.importe_devuelto),
        costo: -costoDevuelto,
      });
    }
    if (num(d.importe_nuevo) > 0 || costoNuevo > 0) {
      hechos.push({
        tipo: "cambio",
        fecha: d.fecha,
        pedidoId: d.pedido_id,
        ...base(d.pedido_id),
        rol: v ? rolVenta(v) : "ventas_no_socios",
        importe: num(d.importe_nuevo),
        costo: costoNuevo,
      });
    }
  }

  const detalle = opciones.detalle
    ? await cargarDetalle(cl, ventasRango.filter((v) => !v.anulada), entregasVigentes, devoluciones)
    : null;

  return { rango, cuentas, hechos, ventasRango, pedidos, detalle };
}

// ------------------------------------------------------------
// Detalle por producto
// ------------------------------------------------------------

type ItemPedido = {
  id: number;
  pedido_id: number;
  producto_id: number;
  cantidad: number;
  subtotal: number;
  es_encargue: boolean;
};

type MovimientoVenta = {
  asiento_id: string | null;
  cantidad: number;
  valor: number;
  items: { producto_id: number } | null;
};

async function cargarDetalle(
  cl: ClientesReportes,
  ventas: VentaRow[],
  entregas: { venta: VentaRow; fecha: string }[],
  devoluciones: DevolucionRow[]
): Promise<DetalleProductos> {
  const pedidoIds = [...ventas.map((v) => v.pedido_id), ...entregas.map((e) => e.venta.pedido_id)];

  const [itemsPedido, movimientos] = await Promise.all([
    leerPorIds<number, ItemPedido>(pedidoIds, (lote, a, b) =>
      cl.publico
        .from("pedido_items")
        .select("id, pedido_id, producto_id, cantidad, subtotal, es_encargue")
        .in("pedido_id", lote)
        .order("id")
        .range(a, b)
    ),
    // Salidas del kardex de cada venta: las que quedaron vinculadas a su asiento.
    leerPorIds<string, MovimientoVenta>(
      ventas.map((v) => v.asiento_id),
      (lote, a, b) =>
        cl.comercial
          .from("movimientos")
          .select("asiento_id, cantidad, valor, items(producto_id)")
          .in("asiento_id", lote)
          .eq("tipo", "venta")
          .order("id")
          .range(a, b) as unknown as Respuesta<MovimientoVenta>
    ),
  ]);

  const itemsPorPedido = new Map<number, ItemPedido[]>();
  for (const i of itemsPedido) {
    const l = itemsPorPedido.get(i.pedido_id);
    if (l) l.push(i);
    else itemsPorPedido.set(i.pedido_id, [i]);
  }
  const movsPorAsiento = new Map<string, MovimientoVenta[]>();
  for (const m of movimientos) {
    if (!m.asiento_id) continue;
    const l = movsPorAsiento.get(m.asiento_id);
    if (l) l.push(m);
    else movsPorAsiento.set(m.asiento_id, [m]);
  }

  const productos = new Map<number, { unidades: number; facturacion: number; costo: number }>();
  const sumar = (id: number, unidades: number, facturacion: number, costo: number) => {
    const p = productos.get(id);
    if (p) {
      p.unidades += unidades;
      p.facturacion += facturacion;
      p.costo += costo;
    } else productos.set(id, { unidades, facturacion, costo });
  };
  let unidadesSinCosto = 0;

  // Prorratea un importe entre ítems en proporción a su subtotal (el
  // descuento del pedido se reparte igual que en el asiento de la venta).
  const prorratear = (items: ItemPedido[], importe: number) => {
    const base = items.reduce((s, i) => s + num(i.subtotal), 0);
    if (base > 0) {
      for (const i of items) sumar(i.producto_id, i.cantidad, (num(i.subtotal) * importe) / base, 0);
    } else if (importe !== 0) {
      sumar(ID_SIN_DETALLE, 0, importe, 0);
    }
  };

  for (const v of ventas) {
    const items = (itemsPorPedido.get(v.pedido_id) ?? []).filter((i) => !i.es_encargue);
    prorratear(items, num(v.monto_ventas));
    let costoKardex = 0;
    for (const m of movsPorAsiento.get(v.asiento_id) ?? []) {
      const costo = -num(m.valor);
      costoKardex += costo;
      sumar(m.items?.producto_id ?? ID_SIN_DETALLE, 0, 0, costo);
      if (costo === 0) unidadesSinCosto += -m.cantidad;
    }
    // Lo que el kardex no explique (no debería pasar) queda sin detalle,
    // así el total por producto es siempre el del reporte.
    const resto = num(v.costo) - costoKardex;
    if (!casiCero(resto)) sumar(ID_SIN_DETALLE, 0, 0, resto);
  }
  for (const { venta } of entregas) {
    const items = (itemsPorPedido.get(venta.pedido_id) ?? []).filter((i) => i.es_encargue);
    prorratear(items, num(venta.monto_encargues));
    unidadesSinCosto += items.reduce((s, i) => s + i.cantidad, 0);
  }
  for (const d of devoluciones) {
    for (const i of d.devolucion_items ?? []) {
      const s = i.es_nuevo ? 1 : -1;
      sumar(i.items?.producto_id ?? ID_SIN_DETALLE, s * i.cantidad, s * num(i.importe), s * num(i.costo));
    }
  }

  const ids = [...productos.keys()].filter((id) => id !== ID_SIN_DETALLE);
  const filas = await leerPorIds<number, { id: number; nombre: string; sku: string | null; categoria_id: number | null }>(
    ids,
    (lote, a, b) => cl.publico.from("productos").select("id, nombre, sku, categoria_id").in("id", lote).order("id").range(a, b)
  );
  const info = new Map(filas.map((p) => [p.id, { nombre: p.nombre, sku: p.sku, categoriaId: p.categoria_id }]));
  const cats = await leerPorIds<number, { id: number; nombre: string }>(
    filas.map((p) => p.categoria_id).filter((c): c is number => c != null),
    (lote, a, b) => cl.publico.from("categorias_producto").select("id, nombre").in("id", lote).order("id").range(a, b)
  );

  return { productos, info, categorias: new Map(cats.map((c) => [c.id, c.nombre])), unidadesSinCosto };
}

// ------------------------------------------------------------
// Resúmenes
// ------------------------------------------------------------

export interface Totales {
  ventas: number;
  costo: number;
  margen: number;
  pedidos: number;
  /** Cobrado sin donación por los pedidos del período (ventas + encargues). */
  cobradoPedidos: number;
  porRol: Record<RolCuentaVenta, number>;
  /** Ventas brutas (sin devoluciones) por rol, para el % a socios. */
  brutoPorRol: Record<RolCuentaVenta, number>;
  composicion: { ventasPedidos: number; encarguesEntregados: number; devoluciones: number; cambios: number };
  encarguesPendientes: { pedidos: number; importe: number };
  donaciones: { pedidos: number; importe: number };
  anuladas: { pedidos: number; importe: number };
}

const ceroRoles = (): Record<RolCuentaVenta, number> => ({
  ventas_socios: 0,
  ventas_no_socios: 0,
  ventas_disciplinas: 0,
  devoluciones: 0,
});

export function totales(d: DatosVentas): Totales {
  const t: Totales = {
    ventas: 0,
    costo: 0,
    margen: 0,
    pedidos: 0,
    cobradoPedidos: 0,
    porRol: ceroRoles(),
    brutoPorRol: ceroRoles(),
    composicion: { ventasPedidos: 0, encarguesEntregados: 0, devoluciones: 0, cambios: 0 },
    encarguesPendientes: { pedidos: 0, importe: 0 },
    donaciones: { pedidos: 0, importe: 0 },
    anuladas: { pedidos: 0, importe: 0 },
  };
  for (const h of d.hechos) {
    t.ventas += h.importe;
    t.costo += h.costo;
    t.porRol[h.rol] += h.importe;
    if (h.tipo !== "devolucion") t.brutoPorRol[h.rol] += h.importe;
    if (h.tipo === "venta") t.composicion.ventasPedidos += h.importe;
    if (h.tipo === "entrega") t.composicion.encarguesEntregados += h.importe;
    if (h.tipo === "devolucion") t.composicion.devoluciones += h.importe;
    if (h.tipo === "cambio") t.composicion.cambios += h.importe;
  }
  for (const v of d.ventasRango) {
    const cobrado = num(v.monto_ventas) + num(v.monto_encargues);
    if (v.anulada) {
      t.anuladas.pedidos++;
      t.anuladas.importe += cobrado;
      continue;
    }
    t.pedidos++;
    t.cobradoPedidos += cobrado;
    if (num(v.monto_encargues) > 0 && !v.asiento_entrega_id) {
      t.encarguesPendientes.pedidos++;
      t.encarguesPendientes.importe += num(v.monto_encargues);
    }
    if (num(v.monto_donacion) > 0) {
      t.donaciones.pedidos++;
      t.donaciones.importe += num(v.monto_donacion);
    }
  }
  t.margen = t.ventas - t.costo;
  return t;
}

/** Productos ordenados por facturación (con su categoría). */
export function productosOrdenados(det: DetalleProductos) {
  return [...det.productos.entries()]
    .map(([id, p]) => {
      const i = info(det, id);
      return {
        producto_id: id,
        nombre: i.nombre,
        sku: i.sku,
        categoria_id: i.categoriaId,
        categoria: i.categoriaId != null ? (det.categorias.get(i.categoriaId) ?? "Sin categoría") : "Sin categoría",
        unidades: p.unidades,
        facturacion: r2(p.facturacion),
        costo: r2(p.costo),
        margen: r2(p.facturacion - p.costo),
        margenPct: p.facturacion > 0 ? ((p.facturacion - p.costo) / p.facturacion) * 100 : null,
      };
    })
    .filter((p) => p.unidades !== 0 || !casiCero(p.facturacion) || !casiCero(p.costo))
    .sort((a, b) => b.facturacion - a.facturacion || b.unidades - a.unidades);
}

function info(det: DetalleProductos, id: number) {
  if (id === ID_SIN_DETALLE) return { nombre: "Sin detalle de ítems", sku: null, categoriaId: null };
  return det.info.get(id) ?? { nombre: `Producto #${id}`, sku: null, categoriaId: null };
}
