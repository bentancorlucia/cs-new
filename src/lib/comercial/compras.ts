import { cache } from "react";
import { createComercialClient, ROLES_CONSULTA, ROLES_OPERADOR } from "@/lib/comercial/server";
import {
  createContabilidadAdminClient,
  createContabilidadClient,
  type ContabilidadClient,
} from "@/lib/contabilidad/server";
import { ROLES_LECTURA } from "@/lib/contabilidad/permisos";
import { createServerClient } from "@/lib/supabase/server";
import { getUserRoles } from "@/lib/supabase/roles";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { diasEntre, lunesDe, r2 } from "@/lib/comercial/compras-esquemas";
import type { CentroOpcion, CuentaOpcion } from "@/lib/contabilidad/asientos";
import { createComunicacionesAdminClient } from "@/lib/comunicaciones/server";
import type { OrdenCompraPdfDatos } from "@/lib/pdf/orden-compra-pdf";

/*
 * Consultas de proveedores y compras (cuenta corriente de todo el club).
 * Solo se importa desde Server Components / Server Actions; los
 * componentes cliente importan únicamente los tipos (`import type`).
 *
 * Los saldos se calculan igual que comercial.saldo_documento / saldo_pago:
 *   documento = total − aplicaciones vigentes (0 si está anulado o es contado)
 *   pago      = importe − aplicaciones vigentes (lo no aplicado = anticipo)
 */

// ------------------------------------------------------------
// Permisos
// ------------------------------------------------------------

/** Roles del usuario (memorizado por request). */
export const permisosCompras = cache(async () => {
  const roles = await getUserRoles();
  return {
    roles,
    puedeVer: roles.some((r) => ROLES_CONSULTA.includes(r)),
    puedeOperar: roles.some((r) => ROLES_OPERADOR.includes(r)),
    puedeLeerContabilidad: roles.some((r) => ROLES_LECTURA.includes(r)),
  };
});

/**
 * Lector del plan de cuentas, centros y cotizaciones. El rol `tienda` no
 * tiene lectura en el schema contabilidad (RLS), pero necesita elegir la
 * cuenta de gasto, la caja/banco y ver el TC: para ese caso, y solo para
 * estos catálogos, se usa el cliente de servicio después de validar el rol.
 */
async function lectorContable(): Promise<ContabilidadClient> {
  const p = await permisosCompras();
  if (p.puedeLeerContabilidad) return createContabilidadClient();
  if (!p.puedeVer) throw new Error("No autorizado");
  return createContabilidadAdminClient() as unknown as ContabilidadClient;
}

// ------------------------------------------------------------
// Tipos
// ------------------------------------------------------------

export type Condiciones = {
  moneda: string;
  plazo_dias: number;
  cuenta_gasto_id: string | null;
  centro_costo_id: string | null;
};

export type ProveedorDatos = {
  id: number;
  nombre: string;
  rut: string | null;
  razon_social: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_email: string | null;
  direccion: string | null;
  notas: string | null;
  activo: boolean;
  condiciones: Condiciones | null;
};

export type ProveedorOpcion = {
  id: number;
  nombre: string;
  activo: boolean;
  rut: string | null;
  condiciones: Condiciones | null;
};

export type DocumentoCC = {
  id: number;
  proveedor_id: number;
  proveedor: string;
  tipo: string;
  contado: boolean;
  serie: string;
  numero: string;
  fecha: string;
  vencimiento: string | null;
  moneda: string;
  tc: number;
  total: number;
  estado: string;
  cuenta_pago_id: string | null;
  asiento_id: string | null;
  notas: string | null;
  created_at: string;
  /** Saldo pendiente en su moneda (para NC: lo que queda por aplicar). */
  saldo: number;
  /** Comprometido en órdenes de pago pendientes. */
  comprometido: number;
};

export type PagoCC = {
  id: number;
  numero: string;
  proveedor_id: number;
  proveedor: string;
  moneda: string;
  importe: number;
  cuenta_pago_id: string;
  estado: string;
  fecha_pago: string | null;
  tc: number | null;
  referencia: string | null;
  notas: string | null;
  asiento_id: string | null;
  created_at: string;
  /** Lo aplicado a documentos (en pendientes: lo previsto). */
  aplicado: number;
  /** Lo no aplicado de un pago pagado: anticipo / saldo a favor. */
  saldo: number;
};

export type AplicacionCC = {
  id: number;
  documento_id: number;
  orden_pago_id: number | null;
  nota_credito_id: number | null;
  importe: number;
  fecha: string;
  vigente: boolean;
  asiento_id: string | null;
  created_at: string;
};

export type SaldoMoneda = {
  moneda: string;
  /** Saldo de facturas y notas de débito. */
  deuda: number;
  /** Notas de crédito sin aplicar + anticipos. */
  aFavor: number;
  /** deuda − aFavor (positivo = le debemos). */
  neto: number;
  vencido: number;
};

export type ProveedorListado = ProveedorDatos & {
  saldos: SaldoMoneda[];
  documentosVencidos: number;
  proximoVencimiento: string | null;
};

export type DiferenciaControl = {
  proveedor_id: number;
  proveedor: string;
  moneda: string;
  saldo_documentos: number;
  saldo_contable: number;
  diferencia: number;
};

export type ProductoOpcion = {
  /** `${producto_id}:${variante_id ?? ""}` */
  clave: string;
  producto_id: number;
  variante_id: number | null;
  nombre: string;
  variante: string | null;
  sku: string | null;
  activo: boolean;
};

export type CuentaPagoOpcion = CuentaOpcion;

export type CatalogoContable = {
  cuentasGasto: CuentaOpcion[];
  cuentasPago: CuentaPagoOpcion[];
  centros: CentroOpcion[];
};

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------

const LOTE = 1000;

/** Recorre una consulta de a 1000 filas (límite de PostgREST). */
async function todas<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += LOTE) {
    const { data, error } = await consulta(desde, desde + LOTE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < LOTE) break;
  }
  return out;
}

const num = (v: number | string | null | undefined) => Number(v ?? 0);

function condicionesDe(c: {
  moneda: string;
  plazo_dias: number;
  cuenta_gasto_id: string | null;
  centro_costo_id: string | null;
} | undefined): Condiciones | null {
  if (!c) return null;
  return {
    moneda: c.moneda.trim(),
    plazo_dias: c.plazo_dias,
    cuenta_gasto_id: c.cuenta_gasto_id,
    centro_costo_id: c.centro_costo_id,
  };
}

// ------------------------------------------------------------
// Proveedores y catálogos
// ------------------------------------------------------------

const COLUMNAS_PROVEEDOR =
  "id, nombre, rut, razon_social, contacto_nombre, contacto_telefono, contacto_email, direccion, notas, activo";

export async function listarProveedoresDatos(): Promise<ProveedorDatos[]> {
  const pub = await createServerClient();
  const com = await createComercialClient();
  const [provs, conds] = await Promise.all([
    todas((d, h) => pub.from("proveedores").select(COLUMNAS_PROVEEDOR).order("nombre").range(d, h)),
    todas((d, h) => com.from("proveedores_condiciones").select("*").range(d, h)),
  ]);
  const mapa = new Map(conds.map((c) => [c.proveedor_id, c]));
  return provs.map((p) => ({
    ...p,
    activo: p.activo !== false,
    condiciones: condicionesDe(mapa.get(p.id)),
  }));
}

export async function obtenerProveedor(id: number): Promise<ProveedorDatos | null> {
  const pub = await createServerClient();
  const com = await createComercialClient();
  const [{ data: p }, { data: c }] = await Promise.all([
    pub.from("proveedores").select(COLUMNAS_PROVEEDOR).eq("id", id).maybeSingle(),
    com.from("proveedores_condiciones").select("*").eq("proveedor_id", id).maybeSingle(),
  ]);
  if (!p) return null;
  return { ...p, activo: p.activo !== false, condiciones: condicionesDe(c ?? undefined) };
}

export async function listarProveedoresOpciones(): Promise<ProveedorOpcion[]> {
  const datos = await listarProveedoresDatos();
  return datos.map((p) => ({ id: p.id, nombre: p.nombre, activo: p.activo, rut: p.rut, condiciones: p.condiciones }));
}

async function nombresProveedores(ids: number[]): Promise<Map<number, string>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  const pub = await createServerClient();
  const { data } = await pub.from("proveedores").select("id, nombre").in("id", unicos);
  return new Map((data ?? []).map((p) => [p.id, p.nombre]));
}

export async function listarProductosOpciones(): Promise<ProductoOpcion[]> {
  const pub = await createServerClient();
  const [productos, variantes] = await Promise.all([
    todas((d, h) => pub.from("productos").select("id, nombre, sku, activo").order("nombre").range(d, h)),
    todas((d, h) =>
      pub.from("producto_variantes").select("id, producto_id, nombre, sku, activo").order("id").range(d, h)
    ),
  ]);
  const porProducto = new Map<number, typeof variantes>();
  for (const v of variantes) {
    const l = porProducto.get(v.producto_id) ?? [];
    l.push(v);
    porProducto.set(v.producto_id, l);
  }
  const out: ProductoOpcion[] = [];
  for (const p of productos) {
    const vs = porProducto.get(p.id);
    if (vs && vs.length > 0) {
      for (const v of vs) {
        out.push({
          clave: `${p.id}:${v.id}`,
          producto_id: p.id,
          variante_id: v.id,
          nombre: p.nombre.trim(),
          variante: v.nombre,
          sku: v.sku ?? p.sku,
          activo: p.activo !== false && v.activo !== false,
        });
      }
    } else {
      out.push({
        clave: `${p.id}:`,
        producto_id: p.id,
        variante_id: null,
        nombre: p.nombre.trim(),
        variante: null,
        sku: p.sku,
        activo: p.activo !== false,
      });
    }
  }
  return out;
}

type NombreItem = { producto_id: number; variante_id: number | null; nombre: string };

/** Nombre "Producto — Variante" de cada ítem de stock (comercial.items). */
async function nombresItems(itemIds: number[]): Promise<Map<number, NombreItem>> {
  const unicos = [...new Set(itemIds)];
  if (unicos.length === 0) return new Map();
  const com = await createComercialClient();
  const { data: items } = await com.from("items").select("id, producto_id, variante_id").in("id", unicos);
  const nombres = await nombresProductos((items ?? []).map((i) => ({ producto_id: i.producto_id, variante_id: i.variante_id })));
  return new Map(
    (items ?? []).map((i) => [
      i.id,
      { producto_id: i.producto_id, variante_id: i.variante_id, nombre: nombres(i.producto_id, i.variante_id) },
    ])
  );
}

async function nombresProductos(
  pares: { producto_id: number; variante_id: number | null }[]
): Promise<(producto: number, variante: number | null) => string> {
  const pub = await createServerClient();
  const prodIds = [...new Set(pares.map((p) => p.producto_id))];
  const varIds = [...new Set(pares.map((p) => p.variante_id).filter((v): v is number => v !== null))];
  const [{ data: ps }, { data: vs }] = await Promise.all([
    prodIds.length ? pub.from("productos").select("id, nombre").in("id", prodIds) : Promise.resolve({ data: [] }),
    varIds.length ? pub.from("producto_variantes").select("id, nombre").in("id", varIds) : Promise.resolve({ data: [] }),
  ]);
  const mp = new Map((ps ?? []).map((p) => [p.id, p.nombre.trim()]));
  const mv = new Map((vs ?? []).map((v) => [v.id, v.nombre]));
  return (producto, variante) => {
    const base = mp.get(producto) ?? `Producto #${producto}`;
    return variante ? `${base} — ${mv.get(variante) ?? `#${variante}`}` : base;
  };
}

export async function cargarCatalogoContable(incluir?: { cuentas?: string[] }): Promise<CatalogoContable> {
  const conta = await lectorContable();
  const [cuentas, centros] = await Promise.all([
    conta
      .from("cuentas")
      .select("id, codigo, nombre, clase, moneda, requiere_auxiliar, requiere_centro_costo, es_disponibilidad, imputable, activa")
      .eq("imputable", true)
      .order("codigo"),
    conta.from("centros_costo").select("id, codigo, nombre, activo").order("codigo"),
  ]);
  const extra = new Set(incluir?.cuentas ?? []);
  const lista = (cuentas.data ?? []).map((c) => ({ ...c, moneda: c.moneda?.trim() || null }));
  const aOpcion = (c: (typeof lista)[number]): CuentaOpcion => ({
    id: c.id,
    codigo: c.codigo,
    nombre: c.nombre,
    moneda: c.moneda,
    requiere_auxiliar: c.requiere_auxiliar as CuentaOpcion["requiere_auxiliar"],
    requiere_centro_costo: c.requiere_centro_costo,
  });
  return {
    // Gasto (o activo): en pesos, sin auxiliar y que no sea caja/banco.
    cuentasGasto: lista
      .filter(
        (c) =>
          (c.activa || extra.has(c.id)) &&
          (c.clase === "egreso" || c.clase === "activo") &&
          !c.moneda &&
          !c.requiere_auxiliar &&
          !c.es_disponibilidad
      )
      .map(aOpcion),
    cuentasPago: lista.filter((c) => c.es_disponibilidad && (c.activa || extra.has(c.id))).map(aOpcion),
    centros: (centros.data ?? []).filter((c) => c.activo !== false).map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre })),
  };
}

/** Nombres de cuentas y centros (para los detalles). */
async function nombresContables(cuentaIds: string[], centroIds: string[]) {
  const conta = await lectorContable();
  const cu = [...new Set(cuentaIds)];
  const ce = [...new Set(centroIds)];
  const [{ data: cs }, { data: cc }] = await Promise.all([
    cu.length ? conta.from("cuentas").select("id, codigo, nombre").in("id", cu) : Promise.resolve({ data: [] }),
    ce.length ? conta.from("centros_costo").select("id, codigo, nombre").in("id", ce) : Promise.resolve({ data: [] }),
  ]);
  return {
    cuentas: new Map((cs ?? []).map((c) => [c.id, `${c.codigo} ${c.nombre}`])),
    centros: new Map((cc ?? []).map((c) => [c.id, c.nombre])),
  };
}

/** TC que usará la base para un documento: cotización del día hábil anterior. */
export async function tcVigenteCompras(fecha: string, moneda: string): Promise<number | null> {
  if (moneda === "UYU") return 1;
  const conta = await lectorContable();
  const { data, error } = await conta.rpc("tc_vigente", { p_moneda: moneda, p_fecha: fecha });
  if (error || data === null || data === undefined) return null;
  const n = Number(data);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ------------------------------------------------------------
// Cuenta corriente
// ------------------------------------------------------------

export type CuentaCorriente = {
  documentos: DocumentoCC[];
  pagos: PagoCC[];
  aplicaciones: AplicacionCC[];
};

/** Documentos, pagos y aplicaciones (de un proveedor o de todos) con sus saldos. */
export async function cargarCuentaCorriente(proveedorId?: number): Promise<CuentaCorriente> {
  const com = await createComercialClient();
  const [docs, pagos] = await Promise.all([
    todas((d, h) => {
      let q = com.from("documentos_proveedor").select("*").order("fecha").order("id");
      if (proveedorId) q = q.eq("proveedor_id", proveedorId);
      return q.range(d, h);
    }),
    todas((d, h) => {
      let q = com.from("ordenes_pago").select("*").order("created_at").order("id");
      if (proveedorId) q = q.eq("proveedor_id", proveedorId);
      return q.range(d, h);
    }),
  ]);
  const docIds = docs.map((d) => d.id);
  let apl: AplicacionCC[] = [];
  if (!proveedorId) {
    apl = await todas((d, h) => com.from("aplicaciones_proveedor").select("*").order("id").range(d, h));
  } else if (docIds.length > 0) {
    // por tramos para no armar URLs gigantes
    for (let i = 0; i < docIds.length; i += 200) {
      const tramo = docIds.slice(i, i + 200);
      const { data, error } = await com.from("aplicaciones_proveedor").select("*").in("documento_id", tramo);
      if (error) throw new Error(error.message);
      apl.push(...(data ?? []));
    }
  }
  apl = apl.map((a) => ({ ...a, importe: num(a.importe) }));

  const nombres = await nombresProveedores([...docs.map((d) => d.proveedor_id), ...pagos.map((p) => p.proveedor_id)]);

  const aplDoc = new Map<number, number>();
  const aplNc = new Map<number, number>();
  const aplPago = new Map<number, number>();
  const previsto = new Map<number, number>();
  const comprometido = new Map<number, number>();
  const estadoPago = new Map(pagos.map((p) => [p.id, p.estado]));
  const suma = (m: Map<number, number>, k: number, v: number) => m.set(k, (m.get(k) ?? 0) + v);

  for (const a of apl) {
    if (a.vigente) {
      suma(aplDoc, a.documento_id, a.importe);
      if (a.nota_credito_id) suma(aplNc, a.nota_credito_id, a.importe);
      if (a.orden_pago_id) suma(aplPago, a.orden_pago_id, a.importe);
    } else if (a.orden_pago_id && estadoPago.get(a.orden_pago_id) === "pendiente") {
      suma(previsto, a.orden_pago_id, a.importe);
      suma(comprometido, a.documento_id, a.importe);
    }
  }

  const documentos: DocumentoCC[] = docs.map((d) => {
    const total = num(d.total);
    let saldo = 0;
    if (d.estado !== "anulado" && !d.contado) {
      saldo = r2(total - (d.tipo === "nota_credito" ? aplNc.get(d.id) ?? 0 : aplDoc.get(d.id) ?? 0));
    }
    return {
      id: d.id,
      proveedor_id: d.proveedor_id,
      proveedor: nombres.get(d.proveedor_id) ?? `Proveedor #${d.proveedor_id}`,
      tipo: d.tipo,
      contado: d.contado,
      serie: d.serie,
      numero: d.numero,
      fecha: d.fecha,
      vencimiento: d.vencimiento,
      moneda: d.moneda.trim(),
      tc: num(d.tc),
      total,
      estado: d.estado,
      cuenta_pago_id: d.cuenta_pago_id,
      asiento_id: d.asiento_id,
      notas: d.notas,
      created_at: d.created_at,
      saldo,
      comprometido: r2(comprometido.get(d.id) ?? 0),
    };
  });

  const pagosCC: PagoCC[] = pagos.map((p) => {
    const importe = num(p.importe);
    const aplicado = p.estado === "pendiente" ? previsto.get(p.id) ?? 0 : aplPago.get(p.id) ?? 0;
    return {
      id: p.id,
      numero: p.numero,
      proveedor_id: p.proveedor_id,
      proveedor: nombres.get(p.proveedor_id) ?? `Proveedor #${p.proveedor_id}`,
      moneda: p.moneda.trim(),
      importe,
      cuenta_pago_id: p.cuenta_pago_id,
      estado: p.estado,
      fecha_pago: p.fecha_pago,
      tc: p.tc === null ? null : num(p.tc),
      referencia: p.referencia,
      notas: p.notas,
      asiento_id: p.asiento_id,
      created_at: p.created_at,
      aplicado: r2(aplicado),
      saldo: p.estado === "pagada" ? r2(importe - aplicado) : 0,
    };
  });

  return { documentos, pagos: pagosCC, aplicaciones: apl };
}

/** Saldos por moneda a partir de la cuenta corriente. */
export function saldosPorMoneda(cc: CuentaCorriente, hoy = hoyUruguay()): SaldoMoneda[] {
  const m = new Map<string, SaldoMoneda>();
  const de = (moneda: string) => {
    let s = m.get(moneda);
    if (!s) {
      s = { moneda, deuda: 0, aFavor: 0, neto: 0, vencido: 0 };
      m.set(moneda, s);
    }
    return s;
  };
  for (const d of cc.documentos) {
    if (d.saldo === 0) continue;
    const s = de(d.moneda);
    if (d.tipo === "nota_credito") s.aFavor += d.saldo;
    else {
      s.deuda += d.saldo;
      if (d.vencimiento && diasEntre(d.vencimiento, hoy) > 0) s.vencido += d.saldo;
    }
  }
  for (const p of cc.pagos) {
    if (p.saldo > 0) de(p.moneda).aFavor += p.saldo;
  }
  return [...m.values()]
    .map((s) => ({ ...s, deuda: r2(s.deuda), aFavor: r2(s.aFavor), vencido: r2(s.vencido), neto: r2(s.deuda - s.aFavor) }))
    .filter((s) => s.deuda !== 0 || s.aFavor !== 0)
    .sort((a, b) => (a.moneda === "UYU" ? -1 : b.moneda === "UYU" ? 1 : a.moneda.localeCompare(b.moneda)));
}

export async function listarProveedores(): Promise<ProveedorListado[]> {
  const [datos, cc] = await Promise.all([listarProveedoresDatos(), cargarCuentaCorriente()]);
  const hoy = hoyUruguay();
  const porProv = new Map<number, CuentaCorriente>();
  const de = (id: number) => {
    let c = porProv.get(id);
    if (!c) {
      c = { documentos: [], pagos: [], aplicaciones: [] };
      porProv.set(id, c);
    }
    return c;
  };
  for (const d of cc.documentos) de(d.proveedor_id).documentos.push(d);
  for (const p of cc.pagos) de(p.proveedor_id).pagos.push(p);

  return datos.map((p) => {
    const c = porProv.get(p.id) ?? { documentos: [], pagos: [], aplicaciones: [] };
    const pendientes = c.documentos.filter((d) => d.tipo !== "nota_credito" && d.saldo > 0 && d.vencimiento);
    const vencidos = pendientes.filter((d) => diasEntre(d.vencimiento!, hoy) > 0);
    const proximo = pendientes
      .filter((d) => diasEntre(d.vencimiento!, hoy) <= 0)
      .map((d) => d.vencimiento!)
      .sort()[0];
    return {
      ...p,
      saldos: saldosPorMoneda(c, hoy),
      documentosVencidos: vencidos.length,
      proximoVencimiento: proximo ?? null,
    };
  });
}

/** Filas de comercial.control_proveedores() con diferencia ≠ 0. */
export async function diferenciasControl(): Promise<{ diferencias: DiferenciaControl[]; error: string | null }> {
  const com = await createComercialClient();
  const { data, error } = await com.rpc("control_proveedores");
  if (error) return { diferencias: [], error: error.message };
  const filas = (data ?? []).filter((f) => Math.abs(num(f.diferencia)) >= 0.005);
  const nombres = await nombresProveedores(filas.map((f) => f.proveedor_id));
  return {
    diferencias: filas.map((f) => ({
      proveedor_id: f.proveedor_id,
      proveedor: nombres.get(f.proveedor_id) ?? `Proveedor #${f.proveedor_id}`,
      moneda: f.moneda.trim(),
      saldo_documentos: num(f.saldo_documentos),
      saldo_contable: num(f.saldo_contable),
      diferencia: num(f.diferencia),
    })),
    error: null,
  };
}

// ------------------------------------------------------------
// Estado de cuenta de un proveedor
// ------------------------------------------------------------

export type MovimientoEstado = {
  clave: string;
  fecha: string;
  orden: number;
  tipo: "factura" | "nota_credito" | "nota_debito" | "pago" | "aplicacion";
  descripcion: string;
  detalle: string | null;
  href: string | null;
  asiento_id: string | null;
  moneda: string;
  /** Aumenta la deuda (factura, ND). */
  debe: number;
  /** Disminuye la deuda (NC, pago). */
  haber: number;
  saldo: number;
  anulado: boolean;
  contado: boolean;
};

export type FichaProveedor = {
  proveedor: ProveedorDatos;
  saldos: SaldoMoneda[];
  movimientos: MovimientoEstado[];
  pendientes: (DocumentoCC & { diasVencido: number })[];
  notasCredito: DocumentoCC[];
  anticipos: PagoCC[];
  pagosPendientes: PagoCC[];
  ordenesAbiertas: OrdenCompraListado[];
};

export async function fichaProveedor(id: number): Promise<FichaProveedor | null> {
  const proveedor = await obtenerProveedor(id);
  if (!proveedor) return null;
  const hoy = hoyUruguay();
  const [cc, ordenes] = await Promise.all([cargarCuentaCorriente(id), listarOrdenesCompra(id)]);
  const docPorId = new Map(cc.documentos.map((d) => [d.id, d]));
  const pagoPorId = new Map(cc.pagos.map((p) => [p.id, p]));
  const nom = (d: DocumentoCC) =>
    `${d.tipo === "factura" ? "Factura" : d.tipo === "nota_credito" ? "Nota de crédito" : "Nota de débito"} ${d.serie ? `${d.serie}-` : ""}${d.numero}`;

  const movs: Omit<MovimientoEstado, "saldo">[] = [];
  for (const d of cc.documentos) {
    const anulado = d.estado === "anulado";
    const afecta = !anulado && !d.contado;
    movs.push({
      clave: `d${d.id}`,
      fecha: d.fecha,
      orden: 0,
      tipo: d.tipo as MovimientoEstado["tipo"],
      descripcion: nom(d),
      detalle: d.contado ? "Contado" : d.vencimiento ? `Vence ${d.vencimiento}` : null,
      href: `/admin/compras/documentos/${d.id}`,
      asiento_id: d.asiento_id,
      moneda: d.moneda,
      debe: afecta && d.tipo !== "nota_credito" ? d.total : 0,
      haber: afecta && d.tipo === "nota_credito" ? d.total : 0,
      anulado,
      contado: d.contado,
    });
  }
  for (const p of cc.pagos) {
    if (p.estado === "pendiente") continue;
    movs.push({
      clave: `p${p.id}`,
      fecha: p.fecha_pago ?? p.created_at.slice(0, 10),
      orden: 1,
      tipo: "pago",
      descripcion: `Pago ${p.numero}`,
      detalle: p.referencia,
      href: `/admin/compras/pagos/${p.id}`,
      asiento_id: p.asiento_id,
      moneda: p.moneda,
      debe: 0,
      haber: p.estado === "pagada" ? p.importe : 0,
      anulado: p.estado === "anulada",
      contado: false,
    });
  }
  // Aplicaciones: informativas (no cambian el saldo neto)
  for (const a of cc.aplicaciones) {
    if (!a.vigente) continue;
    const doc = docPorId.get(a.documento_id);
    if (!doc) continue;
    let origen = "";
    if (a.nota_credito_id) {
      const nc = docPorId.get(a.nota_credito_id);
      origen = nc ? nom(nc) : "Nota de crédito";
    } else if (a.orden_pago_id) {
      const p = pagoPorId.get(a.orden_pago_id);
      // Las aplicaciones del propio pago ya se ven en el pago; mostramos las de anticipo.
      if (p && a.asiento_id === p.asiento_id) continue;
      origen = p ? `Anticipo ${p.numero}` : "Anticipo";
    }
    movs.push({
      clave: `a${a.id}`,
      fecha: a.fecha,
      orden: 2,
      tipo: "aplicacion",
      descripcion: `${origen} aplicado a ${nom(doc)}`,
      detalle: null,
      href: `/admin/compras/documentos/${doc.id}`,
      asiento_id: a.asiento_id,
      moneda: doc.moneda,
      debe: 0,
      haber: 0,
      anulado: false,
      contado: false,
    });
  }
  movs.sort((a, b) => (a.fecha === b.fecha ? a.orden - b.orden : a.fecha < b.fecha ? -1 : 1));
  const corriente = new Map<string, number>();
  const movimientos: MovimientoEstado[] = movs.map((m) => {
    const s = r2((corriente.get(m.moneda) ?? 0) + m.debe - m.haber);
    corriente.set(m.moneda, s);
    return { ...m, saldo: s };
  });

  const pendientes = cc.documentos
    .filter((d) => d.tipo !== "nota_credito" && d.saldo > 0)
    .map((d) => ({ ...d, diasVencido: d.vencimiento ? diasEntre(d.vencimiento, hoy) : 0 }))
    .sort((a, b) => (a.vencimiento ?? a.fecha).localeCompare(b.vencimiento ?? b.fecha));

  return {
    proveedor,
    saldos: saldosPorMoneda(cc, hoy),
    movimientos,
    pendientes,
    notasCredito: cc.documentos.filter((d) => d.tipo === "nota_credito" && d.saldo > 0),
    anticipos: cc.pagos.filter((p) => p.saldo > 0),
    pagosPendientes: cc.pagos.filter((p) => p.estado === "pendiente"),
    ordenesAbiertas: ordenes.filter((o) => ["borrador", "aprobada", "recibida_parcial"].includes(o.estado)),
  };
}

// ------------------------------------------------------------
// Órdenes de compra
// ------------------------------------------------------------

export type OrdenCompraListado = {
  id: number;
  numero: string;
  proveedor_id: number;
  proveedor: string;
  fecha: string;
  moneda: string;
  estado: string;
  notas: string | null;
  total: number;
  unidades: number;
  recibidas: number;
  lineas: number;
  created_at: string;
};

export async function listarOrdenesCompra(proveedorId?: number): Promise<OrdenCompraListado[]> {
  const com = await createComercialClient();
  const ordenes = await todas((d, h) => {
    let q = com.from("ordenes_compra").select("*").order("fecha", { ascending: false }).order("id", { ascending: false });
    if (proveedorId) q = q.eq("proveedor_id", proveedorId);
    return q.range(d, h);
  });
  const ids = ordenes.map((o) => o.id);
  const items: { orden_id: number; cantidad: number; cantidad_recibida: number; costo_unitario: number }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await com
      .from("orden_compra_items")
      .select("orden_id, cantidad, cantidad_recibida, costo_unitario")
      .in("orden_id", ids.slice(i, i + 200));
    items.push(...(data ?? []));
  }
  const nombres = await nombresProveedores(ordenes.map((o) => o.proveedor_id));
  return ordenes.map((o) => {
    const its = items.filter((i) => i.orden_id === o.id);
    return {
      id: o.id,
      numero: o.numero,
      proveedor_id: o.proveedor_id,
      proveedor: nombres.get(o.proveedor_id) ?? `Proveedor #${o.proveedor_id}`,
      fecha: o.fecha,
      moneda: o.moneda.trim(),
      estado: o.estado,
      notas: o.notas,
      total: r2(its.reduce((s, i) => s + i.cantidad * num(i.costo_unitario), 0)),
      unidades: its.reduce((s, i) => s + i.cantidad, 0),
      recibidas: its.reduce((s, i) => s + i.cantidad_recibida, 0),
      lineas: its.length,
      created_at: o.created_at,
    };
  });
}

export type OrdenItemDetalle = {
  id: number;
  producto_id: number;
  variante_id: number | null;
  nombre: string;
  cantidad: number;
  cantidad_recibida: number;
  costo_unitario: number;
};

export type RecepcionListado = {
  id: number;
  numero: string;
  proveedor_id: number;
  proveedor: string;
  orden_id: number | null;
  orden_numero: string | null;
  fecha: string;
  moneda: string;
  tc: number;
  remito: string | null;
  estado: string;
  asiento_id: string | null;
  unidades: number;
  facturadas: number;
  total: number;
  valor: number;
};

export type OrdenCompraDetalle = OrdenCompraListado & {
  aprobada_at: string | null;
  items: OrdenItemDetalle[];
  recepciones: RecepcionListado[];
};

export async function obtenerOrdenCompra(id: number): Promise<OrdenCompraDetalle | null> {
  const com = await createComercialClient();
  const { data: o } = await com.from("ordenes_compra").select("*").eq("id", id).maybeSingle();
  if (!o) return null;
  const [{ data: items }, recepciones, nombres] = await Promise.all([
    com.from("orden_compra_items").select("*").eq("orden_id", id).order("id"),
    listarRecepciones({ ordenId: id }),
    nombresProveedores([o.proveedor_id]),
  ]);
  const its = items ?? [];
  const nombre = await nombresProductos(its);
  return {
    id: o.id,
    numero: o.numero,
    proveedor_id: o.proveedor_id,
    proveedor: nombres.get(o.proveedor_id) ?? `Proveedor #${o.proveedor_id}`,
    fecha: o.fecha,
    moneda: o.moneda.trim(),
    estado: o.estado,
    notas: o.notas,
    aprobada_at: o.aprobada_at,
    created_at: o.created_at,
    total: r2(its.reduce((s, i) => s + i.cantidad * num(i.costo_unitario), 0)),
    unidades: its.reduce((s, i) => s + i.cantidad, 0),
    recibidas: its.reduce((s, i) => s + i.cantidad_recibida, 0),
    lineas: its.length,
    items: its.map((i) => ({
      id: i.id,
      producto_id: i.producto_id,
      variante_id: i.variante_id,
      nombre: nombre(i.producto_id, i.variante_id),
      cantidad: i.cantidad,
      cantidad_recibida: i.cantidad_recibida,
      costo_unitario: num(i.costo_unitario),
    })),
    recepciones,
  };
}

/** Lo que va en el PDF de la orden: la orden, la ficha del proveedor y el código de cada producto. */
export async function datosPdfOrdenCompra(id: number): Promise<OrdenCompraPdfDatos | null> {
  const o = await obtenerOrdenCompra(id);
  if (!o) return null;
  const pub = await createServerClient();
  const prodIds = [...new Set(o.items.map((i) => i.producto_id))];
  const varIds = [...new Set(o.items.map((i) => i.variante_id).filter((v): v is number => v !== null))];
  const [prov, { data: ps }, { data: vs }] = await Promise.all([
    obtenerProveedor(o.proveedor_id),
    prodIds.length ? pub.from("productos").select("id, sku").in("id", prodIds) : Promise.resolve({ data: [] }),
    varIds.length ? pub.from("producto_variantes").select("id, sku").in("id", varIds) : Promise.resolve({ data: [] }),
  ]);
  const skuProducto = new Map((ps ?? []).map((p) => [p.id, p.sku]));
  const skuVariante = new Map((vs ?? []).map((v) => [v.id, v.sku]));
  return {
    numero: o.numero,
    fecha: o.fecha,
    estado: o.estado,
    moneda: o.moneda,
    notas: o.notas,
    aprobada_at: o.aprobada_at,
    plazo_dias: prov?.condiciones?.plazo_dias ?? null,
    proveedor: {
      nombre: o.proveedor,
      razon_social: prov?.razon_social ?? null,
      rut: prov?.rut ?? null,
      direccion: prov?.direccion ?? null,
      contacto_nombre: prov?.contacto_nombre ?? null,
      contacto_email: prov?.contacto_email ?? null,
      contacto_telefono: prov?.contacto_telefono ?? null,
    },
    items: o.items.map((i) => ({
      codigo: (i.variante_id !== null ? skuVariante.get(i.variante_id) : null) || skuProducto.get(i.producto_id) || null,
      descripcion: i.nombre,
      cantidad: i.cantidad,
      precio: i.costo_unitario,
    })),
  };
}

export type EnvioOrdenCompra = {
  id: string;
  email: string;
  estado: string;
  error: string | null;
  enviado_at: string | null;
  created_at: string;
};

/** Mails de la orden al proveedor (comunicaciones.mensajes con ref orden_compra). */
export async function enviosOrdenCompra(id: number): Promise<EnvioOrdenCompra[]> {
  const { puedeVer } = await permisosCompras();
  if (!puedeVer) return [];
  const db = createComunicacionesAdminClient();
  const { data } = await db
    .from("mensajes")
    .select("id, email, estado, error, enviado_at, created_at")
    .eq("ref_tipo", "orden_compra")
    .eq("ref_id", String(id))
    .order("created_at", { ascending: false })
    .limit(20);
  return data ?? [];
}

// ------------------------------------------------------------
// Recepciones
// ------------------------------------------------------------

export async function listarRecepciones(f?: {
  ordenId?: number;
  proveedorId?: number;
  id?: number;
}): Promise<RecepcionListado[]> {
  const com = await createComercialClient();
  const recs = await todas((d, h) => {
    let q = com.from("recepciones").select("*").order("fecha", { ascending: false }).order("id", { ascending: false });
    if (f?.ordenId) q = q.eq("orden_id", f.ordenId);
    if (f?.proveedorId) q = q.eq("proveedor_id", f.proveedorId);
    if (f?.id) q = q.eq("id", f.id);
    return q.range(d, h);
  });
  const ids = recs.map((r) => r.id);
  const items: { recepcion_id: number; cantidad: number; cantidad_facturada: number; costo_unitario: number; valor: number }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await com
      .from("recepcion_items")
      .select("recepcion_id, cantidad, cantidad_facturada, costo_unitario, valor")
      .in("recepcion_id", ids.slice(i, i + 200));
    items.push(...(data ?? []));
  }
  const ordenIds = [...new Set(recs.map((r) => r.orden_id).filter((x): x is number => x !== null))];
  const { data: ords } = ordenIds.length
    ? await com.from("ordenes_compra").select("id, numero").in("id", ordenIds)
    : { data: [] as { id: number; numero: string }[] };
  const numOrden = new Map((ords ?? []).map((o) => [o.id, o.numero]));
  const nombres = await nombresProveedores(recs.map((r) => r.proveedor_id));
  return recs.map((r) => {
    const its = items.filter((i) => i.recepcion_id === r.id);
    return {
      id: r.id,
      numero: r.numero,
      proveedor_id: r.proveedor_id,
      proveedor: nombres.get(r.proveedor_id) ?? `Proveedor #${r.proveedor_id}`,
      orden_id: r.orden_id,
      orden_numero: r.orden_id ? numOrden.get(r.orden_id) ?? null : null,
      fecha: r.fecha,
      moneda: r.moneda.trim(),
      tc: num(r.tc),
      remito: r.remito,
      estado: r.estado,
      asiento_id: r.asiento_id,
      unidades: its.reduce((s, i) => s + i.cantidad, 0),
      facturadas: its.reduce((s, i) => s + i.cantidad_facturada, 0),
      total: r2(its.reduce((s, i) => s + i.cantidad * num(i.costo_unitario), 0)),
      valor: r2(its.reduce((s, i) => s + num(i.valor), 0)),
    };
  });
}

export type RecepcionItemDetalle = {
  id: number;
  item_id: number;
  nombre: string;
  cantidad: number;
  cantidad_facturada: number;
  costo_unitario: number;
  valor: number;
};

export type RecepcionDetalle = RecepcionListado & {
  items: RecepcionItemDetalle[];
  documentos: { id: number; nombre: string; estado: string }[];
};

export async function obtenerRecepcion(id: number): Promise<RecepcionDetalle | null> {
  const com = await createComercialClient();
  const [r] = await listarRecepciones({ id });
  if (!r) return null;
  const { data: items } = await com.from("recepcion_items").select("*").eq("recepcion_id", id).order("id");
  const its = items ?? [];
  const nombres = await nombresItems(its.map((i) => i.item_id));
  const riIds = its.map((i) => i.id);
  const { data: lineas } = riIds.length
    ? await com.from("documento_proveedor_lineas").select("documento_id").in("recepcion_item_id", riIds)
    : { data: [] as { documento_id: number }[] };
  const docIds = [...new Set((lineas ?? []).map((l) => l.documento_id))];
  const { data: docs } = docIds.length
    ? await com.from("documentos_proveedor").select("id, tipo, serie, numero, estado").in("id", docIds)
    : { data: [] as { id: number; tipo: string; serie: string; numero: string; estado: string }[] };
  return {
    ...r,
    items: its.map((i) => ({
      id: i.id,
      item_id: i.item_id,
      nombre: nombres.get(i.item_id)?.nombre ?? `Ítem #${i.item_id}`,
      cantidad: i.cantidad,
      cantidad_facturada: i.cantidad_facturada,
      costo_unitario: num(i.costo_unitario),
      valor: num(i.valor),
    })),
    documentos: (docs ?? []).map((d) => ({
      id: d.id,
      nombre: `${d.tipo === "factura" ? "Factura" : d.tipo} ${d.serie ? `${d.serie}-` : ""}${d.numero}`,
      estado: d.estado,
    })),
  };
}

export type PendienteFacturar = {
  recepcion_item_id: number;
  recepcion_id: number;
  recepcion_numero: string;
  fecha: string;
  remito: string | null;
  moneda: string;
  nombre: string;
  cantidad: number;
  facturada: number;
  pendiente: number;
  costo_unitario: number;
};

/** Ítems recibidos de un proveedor que todavía no se facturaron. */
export async function pendientesDeFacturar(proveedorId: number): Promise<PendienteFacturar[]> {
  const com = await createComercialClient();
  const { data: recs } = await com
    .from("recepciones")
    .select("id, numero, fecha, remito, moneda")
    .eq("proveedor_id", proveedorId)
    .eq("estado", "confirmada")
    .order("fecha");
  const lista = recs ?? [];
  if (lista.length === 0) return [];
  const { data: items } = await com
    .from("recepcion_items")
    .select("*")
    .in("recepcion_id", lista.map((r) => r.id))
    .order("id");
  const pend = (items ?? []).filter((i) => i.cantidad_facturada < i.cantidad);
  const nombres = await nombresItems(pend.map((i) => i.item_id));
  const porId = new Map(lista.map((r) => [r.id, r]));
  return pend.map((i) => {
    const r = porId.get(i.recepcion_id)!;
    return {
      recepcion_item_id: i.id,
      recepcion_id: r.id,
      recepcion_numero: r.numero,
      fecha: r.fecha,
      remito: r.remito,
      moneda: r.moneda.trim(),
      nombre: nombres.get(i.item_id)?.nombre ?? `Ítem #${i.item_id}`,
      cantidad: i.cantidad,
      facturada: i.cantidad_facturada,
      pendiente: i.cantidad - i.cantidad_facturada,
      costo_unitario: num(i.costo_unitario),
    };
  });
}

// ------------------------------------------------------------
// Documentos
// ------------------------------------------------------------

export type LineaDocumentoDetalle = {
  id: number;
  tipo: string;
  descripcion: string;
  detalle: string | null;
  cantidad: number | null;
  importe: number;
  href: string | null;
};

export type AplicacionDetalle = {
  id: number;
  fecha: string;
  importe: number;
  vigente: boolean;
  asiento_id: string | null;
  /** Lo que se aplicó (pago o NC) o a qué se aplicó (cuando el documento es una NC). */
  descripcion: string;
  href: string;
};

export type DocumentoDetalle = DocumentoCC & {
  cuenta_pago: string | null;
  lineas: LineaDocumentoDetalle[];
  aplicaciones: AplicacionDetalle[];
};

export async function obtenerDocumento(id: number): Promise<DocumentoDetalle | null> {
  const com = await createComercialClient();
  const { data: base } = await com.from("documentos_proveedor").select("proveedor_id").eq("id", id).maybeSingle();
  if (!base) return null;
  const cc = await cargarCuentaCorriente(base.proveedor_id);
  const d = cc.documentos.find((x) => x.id === id);
  if (!d) return null;

  const { data: lineas } = await com.from("documento_proveedor_lineas").select("*").eq("documento_id", id).order("id");
  const ls = lineas ?? [];
  const riIds = ls.map((l) => l.recepcion_item_id).filter((x): x is number => x !== null);
  const { data: ris } = riIds.length
    ? await com.from("recepcion_items").select("id, item_id, recepcion_id, costo_unitario").in("id", riIds)
    : { data: [] as { id: number; item_id: number; recepcion_id: number; costo_unitario: number }[] };
  const recIds = [...new Set((ris ?? []).map((r) => r.recepcion_id))];
  const { data: recs } = recIds.length
    ? await com.from("recepciones").select("id, numero").in("id", recIds)
    : { data: [] as { id: number; numero: string }[] };
  const riPorId = new Map((ris ?? []).map((r) => [r.id, r]));
  const recPorId = new Map((recs ?? []).map((r) => [r.id, r.numero]));
  const items = await nombresItems([
    ...(ris ?? []).map((r) => r.item_id),
    ...ls.map((l) => l.item_id).filter((x): x is number => x !== null),
  ]);
  const contables = await nombresContables(
    [...ls.map((l) => l.cuenta_id).filter((x): x is string => !!x), ...(d.cuenta_pago_id ? [d.cuenta_pago_id] : [])],
    ls.map((l) => l.centro_costo_id).filter((x): x is string => !!x)
  );

  const docPorId = new Map(cc.documentos.map((x) => [x.id, x]));
  const pagoPorId = new Map(cc.pagos.map((x) => [x.id, x]));
  const apls = cc.aplicaciones.filter((a) =>
    d.tipo === "nota_credito" ? a.nota_credito_id === id : a.documento_id === id
  );
  const nombreDoc = (x: DocumentoCC) =>
    `${x.tipo === "factura" ? "Factura" : x.tipo === "nota_credito" ? "Nota de crédito" : "Nota de débito"} ${x.serie ? `${x.serie}-` : ""}${x.numero}`;

  return {
    ...d,
    cuenta_pago: d.cuenta_pago_id ? contables.cuentas.get(d.cuenta_pago_id) ?? null : null,
    lineas: ls.map((l) => {
      if (l.tipo === "recepcion") {
        const ri = l.recepcion_item_id ? riPorId.get(l.recepcion_item_id) : undefined;
        return {
          id: l.id,
          tipo: l.tipo,
          descripcion: ri ? items.get(ri.item_id)?.nombre ?? "Mercadería" : "Mercadería",
          detalle: ri
            ? `Recepción ${recPorId.get(ri.recepcion_id) ?? ""} · costo recibido ${num(ri.costo_unitario)}`
            : null,
          cantidad: l.cantidad,
          importe: num(l.importe),
          href: ri ? `/admin/compras/recepciones/${ri.recepcion_id}` : null,
        };
      }
      if (l.tipo === "gasto") {
        const cuenta = l.cuenta_id ? contables.cuentas.get(l.cuenta_id) ?? "Gasto" : "Gasto";
        const centro = l.centro_costo_id ? contables.centros.get(l.centro_costo_id) : null;
        return {
          id: l.id,
          tipo: l.tipo,
          descripcion: l.descripcion || cuenta,
          detalle: [l.descripcion ? cuenta : null, centro ? `Centro: ${centro}` : null].filter(Boolean).join(" · ") || null,
          cantidad: null,
          importe: num(l.importe),
          href: null,
        };
      }
      return {
        id: l.id,
        tipo: l.tipo,
        descripcion: l.item_id ? items.get(l.item_id)?.nombre ?? "Mercadería devuelta" : "Mercadería devuelta",
        detalle: "Devolución de mercadería",
        cantidad: l.cantidad,
        importe: num(l.importe),
        href: null,
      };
    }),
    aplicaciones: apls.map((a) => {
      if (d.tipo === "nota_credito") {
        const destino = docPorId.get(a.documento_id);
        return {
          id: a.id,
          fecha: a.fecha,
          importe: a.importe,
          vigente: a.vigente,
          asiento_id: a.asiento_id,
          descripcion: destino ? `Aplicada a ${nombreDoc(destino)}` : "Aplicada",
          href: `/admin/compras/documentos/${a.documento_id}`,
        };
      }
      if (a.nota_credito_id) {
        const nc = docPorId.get(a.nota_credito_id);
        return {
          id: a.id,
          fecha: a.fecha,
          importe: a.importe,
          vigente: a.vigente,
          asiento_id: a.asiento_id,
          descripcion: nc ? nombreDoc(nc) : "Nota de crédito",
          href: `/admin/compras/documentos/${a.nota_credito_id}`,
        };
      }
      const p = a.orden_pago_id ? pagoPorId.get(a.orden_pago_id) : undefined;
      return {
        id: a.id,
        fecha: a.fecha,
        importe: a.importe,
        vigente: a.vigente,
        asiento_id: a.asiento_id,
        descripcion: p
          ? `${p.estado === "pendiente" ? "Orden de pago" : a.asiento_id && a.asiento_id !== p.asiento_id ? "Anticipo" : "Pago"} ${p.numero}${p.estado === "pendiente" ? " (pendiente)" : p.estado === "anulada" ? " (anulada)" : ""}`
          : "Pago",
        href: `/admin/compras/pagos/${a.orden_pago_id}`,
      };
    }),
  };
}

// ------------------------------------------------------------
// Pagos
// ------------------------------------------------------------

export type PagoDetalle = PagoCC & {
  cuenta_pago: string | null;
  aplicaciones: AplicacionDetalle[];
  /** Facturas/ND pendientes del proveedor en la moneda (para aplicar el anticipo). */
  pendientes: DocumentoCC[];
};

export async function obtenerPago(id: number): Promise<PagoDetalle | null> {
  const com = await createComercialClient();
  const { data: base } = await com.from("ordenes_pago").select("proveedor_id").eq("id", id).maybeSingle();
  if (!base) return null;
  const cc = await cargarCuentaCorriente(base.proveedor_id);
  const p = cc.pagos.find((x) => x.id === id);
  if (!p) return null;
  const contables = await nombresContables([p.cuenta_pago_id], []);
  const docPorId = new Map(cc.documentos.map((x) => [x.id, x]));
  return {
    ...p,
    cuenta_pago: contables.cuentas.get(p.cuenta_pago_id) ?? null,
    aplicaciones: cc.aplicaciones
      .filter((a) => a.orden_pago_id === id)
      .map((a) => {
        const d = docPorId.get(a.documento_id);
        return {
          id: a.id,
          fecha: a.fecha,
          importe: a.importe,
          vigente: a.vigente,
          asiento_id: a.asiento_id,
          descripcion: d
            ? `${d.tipo === "factura" ? "Factura" : "Nota de débito"} ${d.serie ? `${d.serie}-` : ""}${d.numero}`
            : `Documento #${a.documento_id}`,
          href: `/admin/compras/documentos/${a.documento_id}`,
        };
      }),
    pendientes: cc.documentos
      .filter((d) => d.tipo !== "nota_credito" && d.saldo > 0 && d.moneda === p.moneda)
      .sort((a, b) => (a.vencimiento ?? a.fecha).localeCompare(b.vencimiento ?? b.fecha)),
  };
}

/** Documentos que admiten pago o aplicación: facturas/ND con saldo, por vencimiento. */
export async function documentosPendientes(proveedorId: number, moneda?: string): Promise<DocumentoCC[]> {
  const cc = await cargarCuentaCorriente(proveedorId);
  return cc.documentos
    .filter((d) => d.tipo !== "nota_credito" && d.saldo > 0 && (!moneda || d.moneda === moneda))
    .sort((a, b) => (a.vencimiento ?? a.fecha).localeCompare(b.vencimiento ?? b.fecha));
}

// ------------------------------------------------------------
// Vencimientos
// ------------------------------------------------------------

/** Clave del grupo de documentos ya vencidos (ordena antes que cualquier fecha). */
export const VENCIDAS = "0000-vencidas";

export type SemanaVencimientos = {
  /** Lunes de la semana, o VENCIDAS. */
  lunes: string;
  documentos: (DocumentoCC & { diasVencido: number })[];
  totales: { moneda: string; total: number }[];
};

export async function vencimientosDelClub(): Promise<{
  semanas: SemanaVencimientos[];
  totales: { moneda: string; total: number; vencido: number }[];
}> {
  const cc = await cargarCuentaCorriente();
  const hoy = hoyUruguay();
  const pend = cc.documentos
    .filter((d) => d.tipo !== "nota_credito" && d.saldo > 0)
    .map((d) => ({ ...d, diasVencido: diasEntre(d.vencimiento ?? d.fecha, hoy) }))
    .sort((a, b) => (a.vencimiento ?? a.fecha).localeCompare(b.vencimiento ?? b.fecha) || a.proveedor.localeCompare(b.proveedor));

  const semanas = new Map<string, SemanaVencimientos>();
  const totales = new Map<string, { moneda: string; total: number; vencido: number }>();
  for (const d of pend) {
    // Todo lo vencido va junto, al principio; lo demás por semana (lunes a domingo).
    const lunes = d.diasVencido > 0 ? VENCIDAS : lunesDe(d.vencimiento ?? d.fecha);
    let s = semanas.get(lunes);
    if (!s) {
      s = { lunes, documentos: [], totales: [] };
      semanas.set(lunes, s);
    }
    s.documentos.push(d);
    const t = totales.get(d.moneda) ?? { moneda: d.moneda, total: 0, vencido: 0 };
    t.total = r2(t.total + d.saldo);
    if (d.diasVencido > 0) t.vencido = r2(t.vencido + d.saldo);
    totales.set(d.moneda, t);
  }
  for (const s of semanas.values()) {
    const m = new Map<string, number>();
    for (const d of s.documentos) m.set(d.moneda, r2((m.get(d.moneda) ?? 0) + d.saldo));
    s.totales = [...m.entries()].map(([moneda, total]) => ({ moneda, total })).sort((a) => (a.moneda === "UYU" ? -1 : 1));
  }
  return {
    semanas: [...semanas.values()].sort((a, b) => a.lunes.localeCompare(b.lunes)),
    totales: [...totales.values()].sort((a) => (a.moneda === "UYU" ? -1 : 1)),
  };
}
