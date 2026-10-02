import {
  claveDeYmd,
  debeAgruparPorSemana,
  generarClaves,
  iterarDias,
  rangoAnterior,
  rangoToTimestamps,
  variacionPct,
} from "@/lib/reportes/rango";
import { uruguayDateKey } from "@/lib/timezone";
import type {
  Canal,
  FilaMetodoPago,
  KpiComparado,
  KpiPctComparado,
  MargenCategoria,
  PromocodeEstado,
  PromocodeRanking,
  RangoFechas,
  ReporteDonaciones,
  ReportePromocodes,
  ReporteTienda,
  SerieVentas,
} from "@/types/reportes";
import { controlContable, ORIGENES_VENTA } from "./control";
import {
  cargarCuentasTienda,
  cargarVentas,
  clientesReportes,
  leerPorIds,
  leerTodo,
  productosOrdenados,
  r2,
  ROLES_VENTA,
  totales,
  type ClientesReportes,
  type DatosVentas,
} from "./ventas";

const CANALES: Canal[] = ["online", "pos", "disciplina"];

const kpi = (a: number, b: number): KpiComparado => ({
  valor: r2(a),
  valorAnterior: r2(b),
  variacionPct: variacionPct(r2(a), r2(b)),
});

const pct = (parte: number, total: number): number | null => (total > 0 ? (parte / total) * 100 : null);

const kpiPct = (a: number | null, b: number | null): KpiPctComparado => ({
  valor: a,
  valorAnterior: b,
  diferenciaPp: a != null && b != null ? a - b : null,
});

/** % de las ventas minoristas hechas a socios (por importe, sin devoluciones). */
const socioPct = (t: ReturnType<typeof totales>) =>
  pct(t.brutoPorRol.ventas_socios, t.brutoPorRol.ventas_socios + t.brutoPorRol.ventas_no_socios);

// ------------------------------------------------------------
// Reporte general
// ------------------------------------------------------------

/**
 * Reporte de ventas de la tienda para un rango, comparado con el período
 * anterior de igual largo. Lo usan /admin/reportes, sus exportaciones y el
 * MCP (reporte_tienda). Quien llama ya validó el rol.
 */
export async function generarReporteTienda(rango: RangoFechas, cl: ClientesReportes = clientesReportes()): Promise<ReporteTienda> {
  const previo = rangoAnterior(rango);
  const cuentas = await cargarCuentasTienda(cl);

  const [actual, anterior, vigencias] = await Promise.all([
    cargarVentas(cl, rango, { detalle: true, cuentas }),
    cargarVentas(cl, previo, { cuentas }),
    promocodesVigentes(cl, rango),
  ]);
  const t = totales(actual);
  const tp = totales(anterior);

  const [control, controlCosto] = await Promise.all([
    controlContable(cl, cuentas, rango, {
      concepto: "Ventas netas",
      reportePorRol: t.porRol,
      signo: "acreedor",
      origenes: ORIGENES_VENTA,
      centros: cuentas.centros,
    }),
    controlContable(cl, cuentas, rango, {
      concepto: "Costo de lo vendido",
      reportePorRol: { costo_ventas: t.costo },
      signo: "deudor",
      origenes: ORIGENES_VENTA,
      centros: cuentas.centros,
    }),
  ]);

  // Por canal
  const porCanal = CANALES.map((canal) => {
    const hs = actual.hechos.filter((h) => h.canal === canal);
    const ventas = hs.reduce((s, h) => s + h.importe, 0);
    const costo = hs.reduce((s, h) => s + h.costo, 0);
    return {
      canal,
      ventas: r2(ventas),
      costo: r2(costo),
      margen: r2(ventas - costo),
      pedidos: hs.filter((h) => h.tipo === "venta").length,
    };
  });

  // Por cuenta contable (socios / no socios / disciplinas / devoluciones)
  const porCuenta = ROLES_VENTA.map((rol) => {
    const c = cuentas.porRol.get(rol)!;
    return { rol, codigo: c.codigo, nombre: c.nombre, ventas: r2(t.porRol[rol]) };
  });

  // Por método de pago del pedido; devoluciones y cambios aparte
  const metodos = new Map<string, { ventas: number; pedidos: number }>();
  for (const h of actual.hechos) {
    const clave = h.tipo === "devolucion" || h.tipo === "cambio" ? "devoluciones" : h.metodoPago;
    const m = metodos.get(clave) ?? { ventas: 0, pedidos: 0 };
    m.ventas += h.importe;
    if (h.tipo === "venta") m.pedidos++;
    metodos.set(clave, m);
  }
  const porMetodoPago: FilaMetodoPago[] = [...metodos.entries()]
    .map(([clave, m]) => ({ clave, ventas: r2(m.ventas), pedidos: m.pedidos }))
    .sort((a, b) => (a.clave === "devoluciones" ? 1 : b.clave === "devoluciones" ? -1 : b.ventas - a.ventas));

  // Productos y categorías
  const productos = actual.detalle ? productosOrdenados(actual.detalle) : [];
  const categorias = new Map<string, MargenCategoria>();
  for (const p of productos) {
    const clave = String(p.categoria_id ?? "sin");
    const c = categorias.get(clave) ?? {
      categoria_id: p.categoria_id,
      nombre: p.categoria,
      unidades: 0,
      facturacion: 0,
      costo: 0,
      margen: 0,
      margenPct: null,
    };
    c.unidades += p.unidades;
    c.facturacion += p.facturacion;
    c.costo += p.costo;
    categorias.set(clave, c);
  }
  const margenPorCategoria = [...categorias.values()]
    .map((c) => ({
      ...c,
      facturacion: r2(c.facturacion),
      costo: r2(c.costo),
      margen: r2(c.facturacion - c.costo),
      margenPct: pct(c.facturacion - c.costo, c.facturacion),
    }))
    .sort((a, b) => b.margen - a.margen);

  return {
    rango,
    rangoAnterior: previo,
    generado: new Date().toISOString(),
    ventas: kpi(t.ventas, tp.ventas),
    costo: kpi(t.costo, tp.costo),
    margen: kpi(t.margen, tp.margen),
    margenPct: kpiPct(pct(t.margen, t.ventas), pct(tp.margen, tp.ventas)),
    pedidos: kpi(t.pedidos, tp.pedidos),
    ticketPromedio: kpi(t.pedidos ? t.cobradoPedidos / t.pedidos : 0, tp.pedidos ? tp.cobradoPedidos / tp.pedidos : 0),
    ventasSocioPct: kpiPct(socioPct(t), socioPct(tp)),
    composicion: {
      ventasPedidos: r2(t.composicion.ventasPedidos),
      encarguesEntregados: r2(t.composicion.encarguesEntregados),
      devoluciones: r2(t.composicion.devoluciones),
      cambios: r2(t.composicion.cambios),
      ventasNetas: r2(t.ventas),
    },
    encarguesPendientes: { pedidos: t.encarguesPendientes.pedidos, importe: r2(t.encarguesPendientes.importe) },
    donaciones: { pedidos: t.donaciones.pedidos, importe: r2(t.donaciones.importe) },
    anuladas: { pedidos: t.anuladas.pedidos, importe: r2(t.anuladas.importe) },
    unidadesSinCosto: actual.detalle?.unidadesSinCosto ?? 0,
    porCanal,
    porCuenta,
    porMetodoPago,
    topProductos: productos.slice(0, 10),
    margenPorCategoria,
    serie: serieVentas(actual, rango, vigencias),
    control,
    controlCosto,
  };
}

/** Serie por día (o semana ISO si el rango supera 60 días). */
export function serieVentas(
  d: DatosVentas,
  rango: RangoFechas,
  vigencias: { codigo: string; desde: string; hasta: string }[] = []
): SerieVentas[] {
  const porSemana = debeAgruparPorSemana(rango);
  const buckets = new Map<string, SerieVentas>(
    generarClaves(rango, porSemana).map((k) => [
      k,
      { fecha: k, ventas: 0, costo: 0, margen: 0, pedidos: 0, online: 0, pos: 0, disciplina: 0, promocodesActivos: [] },
    ])
  );
  for (const h of d.hechos) {
    const b = buckets.get(claveDeYmd(h.fecha, porSemana));
    if (!b) continue;
    b.ventas += h.importe;
    b.costo += h.costo;
    b[h.canal] += h.importe;
    if (h.tipo === "venta") b.pedidos++;
  }
  if (vigencias.length) {
    const codigos = new Map<string, Set<string>>();
    for (const dia of iterarDias(rango)) {
      const k = claveDeYmd(dia, porSemana);
      for (const v of vigencias) {
        if (v.desde <= dia && dia <= v.hasta) {
          const s = codigos.get(k) ?? new Set<string>();
          s.add(v.codigo);
          codigos.set(k, s);
        }
      }
    }
    codigos.forEach((s, k) => {
      const b = buckets.get(k);
      if (b) b.promocodesActivos = [...s].sort();
    });
  }
  return [...buckets.values()].map((b) => ({
    ...b,
    ventas: r2(b.ventas),
    costo: r2(b.costo),
    margen: r2(b.ventas - b.costo),
    online: r2(b.online),
    pos: r2(b.pos),
    disciplina: r2(b.disciplina),
  }));
}

async function promocodesVigentes(cl: ClientesReportes, rango: RangoFechas) {
  const { desdeIso, hastaIso } = rangoToTimestamps(rango);
  const filas = await leerTodo<{ codigo: string; fecha_inicio: string; fecha_fin: string }>((a, b) =>
    cl.publico
      .from("promocodes")
      .select("codigo, fecha_inicio, fecha_fin")
      .lte("fecha_inicio", hastaIso)
      .gte("fecha_fin", desdeIso)
      .order("id")
      .range(a, b)
  );
  return filas.map((p) => ({
    codigo: p.codigo,
    desde: uruguayDateKey(p.fecha_inicio),
    hasta: uruguayDateKey(p.fecha_fin),
  }));
}

// ------------------------------------------------------------
// Donaciones
// ------------------------------------------------------------

/**
 * Donaciones cobradas con los pedidos vendidos en el período (fecha
 * contable de la venta, ventas no anuladas): lo mismo que se acreditó en
 * "Donaciones a transferir". No son venta.
 */
export async function generarReporteDonaciones(
  rango: RangoFechas,
  cl: ClientesReportes = clientesReportes()
): Promise<ReporteDonaciones> {
  const cuentas = await cargarCuentasTienda(cl);
  const [datos, config, pendientes] = await Promise.all([
    cargarVentas(cl, rango, { cuentas }),
    cl.publico.from("donaciones_config").select("activo").eq("id", 1).maybeSingle(),
    leerTodo<{ monto: number }>((a, b) =>
      cl.publico.from("donaciones").select("monto").eq("estado", "pendiente_pago").order("id").range(a, b)
    ),
  ]);
  if (config.error) throw new Error(config.error.message);

  if (!cuentas.porRol.has("donaciones")) throw new Error('Falta la cuenta contable de la tienda para "donaciones"');

  const conDonacion = datos.ventasRango.filter((v) => !v.anulada && Number(v.monto_donacion) > 0);
  const estados = await leerPorIds<number, { pedido_id: number; estado: string }>(
    conDonacion.map((v) => v.pedido_id),
    (lote, a, b) => cl.publico.from("donaciones").select("pedido_id, estado").in("pedido_id", lote).order("id").range(a, b)
  );
  const estadoDe = new Map(estados.map((e) => [e.pedido_id, e.estado]));

  const total = conDonacion.reduce((s, v) => s + Number(v.monto_donacion), 0);
  const pedidosOnline = datos.ventasRango.filter((v) => !v.anulada && datos.pedidos.get(v.pedido_id)?.canal === "online").length;

  const porEstado = new Map<string, { cantidad: number; total: number }>();
  for (const v of conDonacion) {
    const e = estadoDe.get(v.pedido_id) ?? "cobrada";
    const x = porEstado.get(e) ?? { cantidad: 0, total: 0 };
    x.cantidad++;
    x.total += Number(v.monto_donacion);
    porEstado.set(e, x);
  }

  const porSemana = debeAgruparPorSemana(rango);
  const serie = new Map(generarClaves(rango, porSemana).map((k) => [k, { fecha: k, monto: 0, cantidad: 0 }]));
  for (const v of conDonacion) {
    const b = serie.get(claveDeYmd(v.fecha, porSemana));
    if (b) {
      b.monto += Number(v.monto_donacion);
      b.cantidad++;
    }
  }

  const control = await controlContable(cl, cuentas, rango, {
    concepto: "Donaciones cobradas",
    reportePorRol: { donaciones: total },
    signo: "acreedor",
    origenes: ["pedido_venta"],
    centros: null,
  });

  return {
    rango,
    generado: new Date().toISOString(),
    totalDonado: r2(total),
    cantidad: conDonacion.length,
    promedio: conDonacion.length ? r2(total / conDonacion.length) : 0,
    pedidosOnline,
    tasaConversionPct: pct(conDonacion.filter((v) => datos.pedidos.get(v.pedido_id)?.canal === "online").length, pedidosOnline),
    porEstado: [...porEstado.entries()]
      .map(([estado, x]) => ({ estado, cantidad: x.cantidad, total: r2(x.total) }))
      .sort((a, b) => b.total - a.total),
    pendientesDeCobro: { cantidad: pendientes.length, total: r2(pendientes.reduce((s, p) => s + Number(p.monto), 0)) },
    serie: [...serie.values()].map((s) => ({ ...s, monto: r2(s.monto) })),
    detalle: conDonacion
      .map((v) => {
        const p = datos.pedidos.get(v.pedido_id);
        return {
          pedido_id: v.pedido_id,
          numero_pedido: p?.numero ?? null,
          fecha: v.fecha,
          canal: p?.canal ?? ("online" as Canal),
          monto: r2(Number(v.monto_donacion)),
          estado: estadoDe.get(v.pedido_id) ?? "cobrada",
        };
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.pedido_id - a.pedido_id),
    configActiva: !!config.data?.activo,
    control,
  };
}

// ------------------------------------------------------------
// Promocodes
// ------------------------------------------------------------

type PromocodeRow = {
  id: number;
  codigo: string;
  descripcion: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  usos_actuales: number;
  usos_max: number | null;
  activo: boolean;
};

/**
 * Uso de promocodes en los pedidos vendidos en el período (mismas ventas
 * que el reporte general). Facturación = lo cobrado sin donación (ventas +
 * encargues) y costo = costo real del kardex de esos pedidos.
 */
export async function generarReportePromocodes(
  rango: RangoFechas,
  cl: ClientesReportes = clientesReportes()
): Promise<ReportePromocodes> {
  const [datos, codigos] = await Promise.all([
    cargarVentas(cl, rango),
    leerTodo<PromocodeRow>((a, b) =>
      cl.publico
        .from("promocodes")
        .select("id, codigo, descripcion, fecha_inicio, fecha_fin, usos_actuales, usos_max, activo")
        .order("id")
        .range(a, b)
    ),
  ]);

  const ventas = datos.ventasRango.filter((v) => !v.anulada);
  const cobrado = (v: (typeof ventas)[number]) => Number(v.monto_ventas) + Number(v.monto_encargues);
  const con = ventas.filter((v) => datos.pedidos.get(v.pedido_id)?.promocodeId != null);
  const sin = ventas.filter((v) => datos.pedidos.get(v.pedido_id)?.promocodeId == null);

  const totalDescontado = con.reduce((s, v) => s + (datos.pedidos.get(v.pedido_id)?.descuento ?? 0), 0);
  const facturacionTotal = ventas.reduce((s, v) => s + cobrado(v), 0);
  const facturacionCon = con.reduce((s, v) => s + cobrado(v), 0);
  const costoCon = con.reduce((s, v) => s + Number(v.costo), 0);

  const porCodigo = new Map<number, PromocodeRanking>();
  const codigoInfo = new Map(codigos.map((c) => [c.id, c]));
  for (const v of con) {
    const p = datos.pedidos.get(v.pedido_id)!;
    const id = p.promocodeId!;
    const info = codigoInfo.get(id);
    const r = porCodigo.get(id) ?? {
      promocode_id: id,
      codigo: info?.codigo ?? p.promocodeCodigo ?? `#${id}`,
      descripcion: info?.descripcion ?? null,
      usos: 0,
      descontado: 0,
      facturacion: 0,
      costo: 0,
      margen: 0,
      margenPct: null,
    };
    r.usos++;
    r.descontado += p.descuento;
    r.facturacion += cobrado(v);
    r.costo += Number(v.costo);
    porCodigo.set(id, r);
  }
  const ranking = [...porCodigo.values()]
    .map((r) => ({
      ...r,
      descontado: r2(r.descontado),
      facturacion: r2(r.facturacion),
      costo: r2(r.costo),
      margen: r2(r.facturacion - r.costo),
      margenPct: pct(r.facturacion - r.costo, r.facturacion),
    }))
    .sort((a, b) => b.usos - a.usos || b.descontado - a.descontado);

  // Estado de los códigos, hoy (hora de Uruguay)
  const ahora = Date.now();
  const detalleEstados: PromocodeEstado[] = codigos.map((c) => {
    const agotado = c.usos_max != null && c.usos_actuales >= c.usos_max;
    const vencido = new Date(c.fecha_fin).getTime() < ahora;
    const vigente = c.activo && new Date(c.fecha_inicio).getTime() <= ahora && !vencido && !agotado;
    return {
      promocode_id: c.id,
      codigo: c.codigo,
      descripcion: c.descripcion,
      activo: c.activo,
      vigente,
      vencido,
      agotado,
      sinUso: c.usos_actuales === 0,
      fecha_inicio: c.fecha_inicio,
      fecha_fin: c.fecha_fin,
      usos_actuales: c.usos_actuales,
      usos_max: c.usos_max,
    };
  });

  const conSocio = con.filter((v) => datos.pedidos.get(v.pedido_id)?.socio).length;

  return {
    rango,
    generado: new Date().toISOString(),
    totalDescontado: r2(totalDescontado),
    cantidadUsos: con.length,
    descuentoSobreVentasPct: pct(totalDescontado, facturacionTotal + totalDescontado),
    facturacionConCodigo: r2(facturacionCon),
    margenConCodigo: r2(facturacionCon - costoCon),
    margenConCodigoPct: pct(facturacionCon - costoCon, facturacionCon),
    ticketConCodigo: con.length ? r2(facturacionCon / con.length) : 0,
    ticketSinCodigo: sin.length ? r2(sin.reduce((s, v) => s + cobrado(v), 0) / sin.length) : 0,
    ranking,
    acumulacionPrecioSocio: { conPrecioSocio: conSocio, soloDescuento: con.length - conSocio },
    contadoresEstado: {
      vigentes: detalleEstados.filter((e) => e.vigente).length,
      vencidos: detalleEstados.filter((e) => e.vencido).length,
      agotados: detalleEstados.filter((e) => e.agotado).length,
      sinUso: detalleEstados.filter((e) => e.sinUso).length,
    },
    detalleEstados,
  };
}

