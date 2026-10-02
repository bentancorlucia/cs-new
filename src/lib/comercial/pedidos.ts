import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentUser, getUserRoles } from "@/lib/supabase/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createContabilidadAdminClient } from "@/lib/contabilidad/server";
import { mensajeError, hoyUruguay } from "@/lib/contabilidad/formato";
import { leerPaginado } from "@/lib/contabilidad/reportes";
import { ROLES_LECTURA, ROLES_ESCRITURA } from "@/lib/contabilidad/permisos";
import { ROLES_OPERADOR } from "@/lib/comercial/server";

/**
 * Pedidos, pedidos de disciplinas y donaciones: permisos, búsqueda segura y
 * lectura de la parte contable (asientos, ventas, devoluciones, cuentas
 * corrientes). Solo servidor.
 *
 * La lectura contable se hace con service role DESPUÉS de validar el rol:
 * el rol `tienda` no tiene RLS sobre `contabilidad`, pero tiene que ver el
 * asiento de su pedido y el saldo de las disciplinas.
 */

// ------------------------------------------------------------
// Permisos
// ------------------------------------------------------------

/** Operan pedidos (estados, aprobación, cancelación) y la configuración de donaciones. */
export const ROLES_TIENDA = ["super_admin", "tienda"];
/** Ven pedidos y donaciones (el tesorero, la parte contable). */
export const ROLES_LECTURA_PEDIDOS = ["super_admin", "tienda", "tesorero"];
/** Pedidos de disciplinas y transferencia de donaciones. */
export const ROLES_DISCIPLINAS = ROLES_OPERADOR;

export interface PermisosPedidos {
  userId: string | null;
  roles: string[];
  /** Ve pedidos y donaciones. */
  puedeVer: boolean;
  /** Cambia estados, aprueba, cancela, edita (tienda / super_admin). */
  puedeOperar: boolean;
  /** Pedidos de disciplinas, devoluciones y transferencias de donaciones. */
  puedeOperarComercial: boolean;
  /** Puede abrir /contabilidad (links a asientos). */
  puedeVerContabilidad: boolean;
  /** Puede cargar asientos manuales. */
  puedeEscribirContabilidad: boolean;
}

export async function permisosPedidos(): Promise<PermisosPedidos> {
  const [user, roles] = await Promise.all([getCurrentUser(), getUserRoles()]);
  const tiene = (lista: string[]) => roles.some((r) => lista.includes(r));
  return {
    userId: user?.id ?? null,
    roles,
    puedeVer: tiene(ROLES_LECTURA_PEDIDOS),
    puedeOperar: tiene(ROLES_TIENDA),
    puedeOperarComercial: tiene(ROLES_OPERADOR),
    puedeVerContabilidad: tiene(ROLES_LECTURA),
    puedeEscribirContabilidad: tiene(ROLES_ESCRITURA),
  };
}

/** Error con status HTTP para cortar un route handler. */
export class ErrorHttp extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function exigir(
  condicion: (p: PermisosPedidos) => boolean
): Promise<PermisosPedidos> {
  const p = await permisosPedidos();
  if (!p.userId) throw new ErrorHttp(401, "Iniciá sesión");
  if (!condicion(p)) throw new ErrorHttp(403, "No autorizado");
  return p;
}

/** Respuesta JSON para cualquier error de un route handler. */
export function respuestaError(error: unknown): NextResponse {
  if (error instanceof ErrorHttp) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Datos inválidos", details: error.issues },
      { status: 400 }
    );
  }
  if (error instanceof Error && error.message.startsWith("No autorizado")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const e = error as { message?: string; code?: string } | null;
  console.error(error);
  return NextResponse.json({ error: mensajeError(e) }, { status: 500 });
}

/** Id numérico de la ruta o 400. */
export function idNumerico(valor: string): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorHttp(400, "Id inválido");
  return n;
}

// ------------------------------------------------------------
// Búsqueda segura
// ------------------------------------------------------------

/**
 * Texto de búsqueda listo para un filtro `ilike` dentro de `.or()`.
 *
 * `.or()` arma un string de filtros PostgREST: una coma, un punto o un
 * paréntesis del usuario podrían agregar condiciones. Se sacan los
 * caracteres especiales (comodines de LIKE, comillas, barra) y el valor va
 * entre comillas dobles, donde coma, punto y paréntesis son literales.
 * Devuelve `null` si no queda nada para buscar.
 */
export function patronBusqueda(texto: string | null | undefined): string | null {
  const limpio = (texto ?? "")
    .replace(/[%_*\\"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return limpio ? `"%${limpio}%"` : null;
}

/**
 * Perfiles cuyo nombre o apellido coincide con la búsqueda (para encontrar
 * pedidos online, que no guardan nombre_cliente). Busca cada palabra.
 */
export async function perfilesQueCoinciden(
  db: ReturnType<typeof createAdminClient>,
  texto: string
): Promise<string[]> {
  const palabras = texto
    .replace(/[%_*\\"]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length >= 2)
    .slice(0, 3);
  if (palabras.length === 0) return [];
  let q = db.from("perfiles").select("id");
  for (const p of palabras) {
    q = q.or(`nombre.ilike."%${p}%",apellido.ilike."%${p}%"`);
  }
  const { data } = await q.limit(200);
  return (data ?? []).map((r) => r.id);
}

// ------------------------------------------------------------
// Contabilidad: cuentas, asientos, saldos
// ------------------------------------------------------------

export interface CuentaRef {
  id: string;
  codigo: string;
  nombre: string;
}

export interface AsientoRef {
  id: string;
  numero: number | null;
  fecha: string;
  descripcion: string;
  origen_tipo: string | null;
  tipo: string;
  importe: number;
  motivo: string | null;
  revertido_por: AsientoRef | null;
}

type ContabilidadAdmin = ReturnType<typeof createContabilidadAdminClient>;

export async function cuentaDeParametro(
  cdb: ContabilidadAdmin,
  proceso: string,
  rol: string
): Promise<CuentaRef | null> {
  const { data } = await cdb
    .from("parametros_cuentas")
    .select("cuentas!inner(id, codigo, nombre)")
    .eq("proceso", proceso)
    .eq("rol", rol)
    .is("moneda", null)
    .maybeSingle();
  const c = data?.cuentas as CuentaRef | CuentaRef[] | undefined;
  return (Array.isArray(c) ? c[0] : c) ?? null;
}

export async function ejercicioVigente(
  cdb: ContabilidadAdmin,
  fecha = hoyUruguay()
): Promise<{ id: string; nombre: string; fecha_inicio: string; fecha_fin: string } | null> {
  const { data } = await cdb
    .from("ejercicios")
    .select("id, nombre, fecha_inicio, fecha_fin")
    .lte("fecha_inicio", fecha)
    .gte("fecha_fin", fecha)
    .maybeSingle();
  return data ?? null;
}

/** Asientos por id, con su importe (Σ debe) y la reversión si la tienen. */
export async function asientosPorId(cdb: ContabilidadAdmin, ids: string[]): Promise<Map<string, AsientoRef>> {
  const mapa = new Map<string, AsientoRef>();
  const unicos = [...new Set(ids.filter(Boolean))];
  if (unicos.length === 0) return mapa;

  const { data: cab } = await cdb
    .from("asientos")
    .select("id, numero, fecha, descripcion, origen_tipo, tipo, motivo, revertido_por_id")
    .in("id", unicos);
  const revIds = (cab ?? []).map((a) => a.revertido_por_id).filter((x): x is string => !!x);
  const { data: revs } = revIds.length
    ? await cdb
        .from("asientos")
        .select("id, numero, fecha, descripcion, origen_tipo, tipo, motivo, revertido_por_id")
        .in("id", revIds)
    : { data: [] };
  const todos = [...(cab ?? []), ...(revs ?? [])];
  const { data: lineas } = await cdb
    .from("lineas")
    .select("asiento_id, debe")
    .in(
      "asiento_id",
      todos.map((a) => a.id)
    );
  const importe = new Map<string, number>();
  for (const l of lineas ?? []) {
    importe.set(l.asiento_id, (importe.get(l.asiento_id) ?? 0) + Number(l.debe));
  }
  const ref = (a: (typeof todos)[number]): AsientoRef => ({
    id: a.id,
    numero: a.numero,
    fecha: a.fecha,
    descripcion: a.descripcion,
    origen_tipo: a.origen_tipo,
    tipo: a.tipo,
    motivo: a.motivo,
    importe: Math.round((importe.get(a.id) ?? 0) * 100) / 100,
    revertido_por: null,
  });
  const revMapa = new Map((revs ?? []).map((r) => [r.id, ref(r)]));
  for (const a of cab ?? []) {
    mapa.set(a.id, { ...ref(a), revertido_por: a.revertido_por_id ? revMapa.get(a.revertido_por_id) ?? null : null });
  }
  return mapa;
}

export interface LineaCuenta {
  id: number;
  debe: number;
  haber: number;
  descripcion: string | null;
  disciplina_id: number | null;
  asiento: {
    id: string;
    numero: number | null;
    fecha: string;
    descripcion: string;
    origen_tipo: string | null;
    origen_id: string | null;
  };
}

/**
 * Líneas confirmadas de una cuenta en un ejercicio (la apertura ya trae lo
 * anterior), opcionalmente de un auxiliar de disciplina. Lee de a 1000.
 */
export async function lineasDeCuenta(
  cdb: ContabilidadAdmin,
  cuentaId: string,
  ejercicioId: string,
  opciones: { disciplinaId?: number } = {}
): Promise<{ filas: LineaCuenta[]; error: string | null }> {
  const r = await leerPaginado((desde, hasta) => {
    let q = cdb
      .from("lineas")
      .select(
        "id, debe, haber, descripcion, disciplina_id, asientos!inner(id, numero, fecha, descripcion, estado, ejercicio_id, origen_tipo, origen_id)"
      )
      .eq("cuenta_id", cuentaId)
      .eq("asientos.estado", "confirmado")
      .eq("asientos.ejercicio_id", ejercicioId);
    if (opciones.disciplinaId) q = q.eq("disciplina_id", opciones.disciplinaId);
    return q.order("id").range(desde, hasta);
  });
  return {
    error: r.error,
    filas: r.filas.map((l) => {
      const a = (Array.isArray(l.asientos) ? l.asientos[0] : l.asientos) as LineaCuenta["asiento"];
      return {
        id: l.id,
        debe: Number(l.debe),
        haber: Number(l.haber),
        descripcion: l.descripcion,
        disciplina_id: l.disciplina_id,
        asiento: {
          id: a.id,
          numero: a.numero,
          fecha: a.fecha,
          descripcion: a.descripcion,
          origen_tipo: a.origen_tipo,
          origen_id: a.origen_id,
        },
      };
    }),
  };
}

// ------------------------------------------------------------
// Contabilidad de un pedido
// ------------------------------------------------------------

export interface DevolucionItem {
  id: number;
  pedido_item_id: number | null;
  nombre: string;
  cantidad: number;
  importe: number;
  costo: number;
  es_nuevo: boolean;
}

export interface Devolucion {
  id: number;
  fecha: string;
  medio: "caja" | "banco";
  importe_devuelto: number;
  importe_nuevo: number;
  neto: number;
  motivo: string;
  created_at: string;
  asiento: AsientoRef | null;
  items: DevolucionItem[];
}

export interface ContabilidadPedido {
  venta: {
    fecha: string;
    monto_ventas: number;
    monto_encargues: number;
    encargue_reconocido: boolean;
    monto_donacion: number;
    costo: number;
    anulada: boolean;
    cuenta_ingreso: CuentaRef | null;
  } | null;
  /** Venta, efectivo de un mixto, entrega de encargue (con su reversión si fue cancelado). */
  asientos: AsientoRef[];
  devoluciones: Devolucion[];
  /** Ventas netas reconocidas, costo neto y margen (después de devoluciones/cambios). */
  resultado: { ventas: number; costo: number; margen: number; margen_pct: number | null } | null;
  error: string | null;
}

interface FilaDevolucion {
  id: number;
  fecha: string;
  medio: "caja" | "banco";
  importe_devuelto: number | string;
  importe_nuevo: number | string;
  neto: number | string;
  motivo: string;
  created_at: string;
  asiento_id: string | null;
  devolucion_items: {
    id: number;
    pedido_item_id: number | null;
    item_id: number;
    cantidad: number;
    importe: number | string;
    costo: number | string;
    es_nuevo: boolean;
  }[];
}

const ORDEN_ORIGEN: Record<string, number> = { pedido_efectivo: 0, pedido_venta: 1, pedido_entrega: 2 };

export async function contabilidadDePedido(pedidoId: number): Promise<ContabilidadPedido> {
  const cdb = createContabilidadAdminClient();
  // Las tablas de comercial (ventas, devoluciones) se leen con service role:
  // ya se validó el rol, y así no depende de que los tipos generados
  // incluyan las tablas nuevas.
  const com = (createAdminClient() as unknown as SupabaseClient).schema("comercial");

  const [ventaRes, asientosRes, devRes] = await Promise.all([
    com
      .from("ventas")
      .select("fecha, monto_ventas, monto_encargues, monto_donacion, costo, anulada, cuenta_ingreso_id, asiento_entrega_id")
      .eq("pedido_id", pedidoId)
      .maybeSingle(),
    cdb
      .from("asientos")
      .select("id, origen_tipo")
      .eq("origen_id", String(pedidoId))
      .in("origen_tipo", ["pedido_venta", "pedido_efectivo", "pedido_entrega"])
      .eq("estado", "confirmado"),
    com
      .from("devoluciones")
      .select(
        "id, fecha, medio, importe_devuelto, importe_nuevo, neto, motivo, created_at, asiento_id, devolucion_items(id, pedido_item_id, item_id, cantidad, importe, costo, es_nuevo)"
      )
      .eq("pedido_id", pedidoId)
      .order("id"),
  ]);

  // 42P01: la tabla de devoluciones todavía no existe en esta base.
  const devError = devRes.error && devRes.error.code !== "42P01" && devRes.error.code !== "PGRST205" ? devRes.error : null;
  const error = ventaRes.error ?? asientosRes.error ?? devError;
  const filasDev = (devRes.error ? [] : (devRes.data ?? [])) as FilaDevolucion[];

  const ids = [
    ...(asientosRes.data ?? []).map((a) => a.id),
    ...filasDev.map((d) => d.asiento_id).filter((x): x is string => !!x),
  ];
  const asientos = await asientosPorId(cdb, ids);

  // Nombres de lo devuelto / entregado en un cambio
  const itemIds = [...new Set(filasDev.flatMap((d) => d.devolucion_items.map((i) => i.item_id)))];
  const nombres = new Map<number, string>();
  if (itemIds.length > 0) {
    const { data: items } = await com
      .from("items")
      .select("id, producto_id, variante_id")
      .in("id", itemIds);
    const filas = (items ?? []) as { id: number; producto_id: number; variante_id: number | null }[];
    const db = createAdminClient();
    const [{ data: prods }, { data: vars }] = await Promise.all([
      db.from("productos").select("id, nombre").in("id", [...new Set(filas.map((f) => f.producto_id))]),
      db
        .from("producto_variantes")
        .select("id, nombre")
        .in("id", filas.map((f) => f.variante_id).filter((x): x is number => x != null)),
    ]);
    const np = new Map((prods ?? []).map((p) => [p.id, p.nombre]));
    const nv = new Map((vars ?? []).map((v) => [v.id, v.nombre]));
    for (const f of filas) {
      const base = np.get(f.producto_id) ?? `Producto ${f.producto_id}`;
      nombres.set(f.id, f.variante_id ? `${base} — ${nv.get(f.variante_id) ?? ""}` : base);
    }
  }

  const devoluciones: Devolucion[] = filasDev.map((d) => ({
    id: d.id,
    fecha: d.fecha,
    medio: d.medio,
    importe_devuelto: Number(d.importe_devuelto),
    importe_nuevo: Number(d.importe_nuevo),
    neto: Number(d.neto),
    motivo: d.motivo,
    created_at: d.created_at,
    asiento: d.asiento_id ? asientos.get(d.asiento_id) ?? null : null,
    items: d.devolucion_items.map((i) => ({
      id: i.id,
      pedido_item_id: i.pedido_item_id,
      nombre: nombres.get(i.item_id) ?? "",
      cantidad: i.cantidad,
      importe: Number(i.importe),
      costo: Number(i.costo),
      es_nuevo: i.es_nuevo,
    })),
  }));

  const v = ventaRes.data as {
    fecha: string;
    monto_ventas: number | string;
    monto_encargues: number | string;
    monto_donacion: number | string;
    costo: number | string;
    anulada: boolean;
    cuenta_ingreso_id: string;
    asiento_entrega_id: string | null;
  } | null;

  let cuentaIngreso: CuentaRef | null = null;
  if (v) {
    const { data } = await cdb.from("cuentas").select("id, codigo, nombre").eq("id", v.cuenta_ingreso_id).maybeSingle();
    cuentaIngreso = data ?? null;
  }

  const venta = v
    ? {
        fecha: v.fecha,
        monto_ventas: Number(v.monto_ventas),
        monto_encargues: Number(v.monto_encargues),
        encargue_reconocido: !!v.asiento_entrega_id,
        monto_donacion: Number(v.monto_donacion),
        costo: Number(v.costo),
        anulada: v.anulada,
        cuenta_ingreso: cuentaIngreso,
      }
    : null;

  let resultado: ContabilidadPedido["resultado"] = null;
  if (venta && !venta.anulada) {
    const devuelto = devoluciones.reduce((s, d) => s + d.importe_nuevo - d.importe_devuelto, 0);
    const costoDev = devoluciones.reduce(
      (s, d) => s + d.items.reduce((c, i) => c + (i.es_nuevo ? i.costo : -i.costo), 0),
      0
    );
    const ventas = venta.monto_ventas + (venta.encargue_reconocido ? venta.monto_encargues : 0) + devuelto;
    const costo = venta.costo + costoDev;
    const margen = ventas - costo;
    resultado = {
      ventas: Math.round(ventas * 100) / 100,
      costo: Math.round(costo * 100) / 100,
      margen: Math.round(margen * 100) / 100,
      margen_pct: ventas > 0 ? margen / ventas : null,
    };
  }

  const lista = (asientosRes.data ?? [])
    .map((a) => asientos.get(a.id))
    .filter((a): a is AsientoRef => !!a)
    .sort((a, b) => (ORDEN_ORIGEN[a.origen_tipo ?? ""] ?? 9) - (ORDEN_ORIGEN[b.origen_tipo ?? ""] ?? 9));

  return {
    venta,
    asientos: lista,
    devoluciones,
    resultado,
    error: error ? mensajeError(error) : null,
  };
}
