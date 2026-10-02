import { createServerClient as createSsrClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createContabilidadAdminClient } from "@/lib/contabilidad/server";
import { hoyUruguay, mensajeError } from "@/lib/contabilidad/formato";

/*
 * Caja del POS (schema `comercial`): sesiones, movimientos, arqueos.
 * Solo se importa desde Server Components, Server Actions y route
 * handlers; los componentes cliente importan únicamente los tipos.
 *
 * Las escrituras van por las funciones de la base con la sesión del
 * usuario (abrir_caja, movimiento_caja, cerrar_caja), que registran
 * quién operó y vuelven a validar el rol. Las lecturas de contabilidad
 * (plan de cuentas, saldo de la caja, asientos) usan service role porque
 * el rol `tienda` no lee el schema contable: quien llama tiene que haber
 * validado el permiso antes (exigirOperador / permisosComercial).
 */

// ------------------------------------------------------------
// Tipos de las tablas y funciones de caja (todavía no están en
// src/types/comercial.ts; cuando se regeneren, este bloque se puede
// reemplazar por los tipos generados).
// ------------------------------------------------------------

type CajaRow = { id: number; nombre: string; cuenta_id: string; activa: boolean };

type SesionRow = {
  id: number;
  caja_id: number;
  estado: "abierta" | "cerrada";
  abierta_por: string | null;
  abierta_at: string;
  saldo_inicial: number;
  contado_inicial: number;
  cerrada_por: string | null;
  cerrada_at: string | null;
  saldo_final: number | null;
  contado_final: number | null;
  notas: string | null;
};

export type TipoMovimientoCaja = "deposito_banco" | "retiro" | "ingreso" | "gasto";

type MovimientoRow = {
  id: number;
  sesion_id: number;
  tipo: TipoMovimientoCaja | "arqueo";
  importe: number;
  entra: boolean;
  descripcion: string;
  asiento_id: string | null;
  creado_por: string | null;
  created_at: string;
};

type Tabla<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };

type CajaDatabase = {
  comercial: {
    Tables: {
      cajas: Tabla<CajaRow>;
      caja_sesiones: Tabla<SesionRow>;
      caja_movimientos: Tabla<MovimientoRow>;
    };
    Views: { [_ in never]: never };
    Functions: {
      abrir_caja: {
        Args: { p_caja: number; p_contado: number; p_notas?: string | null };
        Returns: number;
      };
      movimiento_caja: {
        Args: {
          p_sesion: number;
          p_tipo: TipoMovimientoCaja;
          p_importe: number;
          p_cuenta_contrapartida: string;
          p_descripcion: string;
          p_centro_costo?: string | null;
        };
        Returns: number;
      };
      cerrar_caja: {
        Args: { p_sesion: number; p_contado: number; p_notas?: string | null };
        Returns: number;
      };
      resumen_caja: {
        Args: { p_sesion: number };
        Returns: { concepto: string; entradas: number; salidas: number; cantidad: number }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

/** Cliente del schema `comercial` con la sesión del usuario, tipado para la caja. */
export async function createCajaClient() {
  const cookieStore = await cookies();
  return createSsrClient<CajaDatabase, "comercial">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "comercial" },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Llamado desde un Server Component: el proxy refresca la sesión.
          }
        },
      },
    }
  );
}

// ------------------------------------------------------------
// Tipos que ve la UI
// ------------------------------------------------------------

export type Caja = { id: number; nombre: string; cuenta_id: string };

export type SesionCaja = SesionRow & {
  abierta_por_nombre: string | null;
  cerrada_por_nombre: string | null;
};

export type FilaResumenCaja = { concepto: string; entradas: number; salidas: number; cantidad: number };

export type MovimientoCaja = MovimientoRow & { creado_por_nombre: string | null };

export type EstadoCaja = {
  caja: Caja | null;
  sesion: SesionCaja | null;
  /** Saldo contable de la cuenta de la caja: el efectivo que tiene que haber. */
  esperado: number | null;
  resumen: FilaResumenCaja[];
  movimientos: MovimientoCaja[];
  error: string | null;
};

export type CuentaCaja = {
  id: string;
  codigo: string;
  nombre: string;
  requiere_centro_costo: boolean;
};

export type CatalogosCaja = {
  /** Cuentas bancarias en pesos (destino de los depósitos). */
  bancos: CuentaCaja[];
  /** Otras disponibilidades en pesos (retiros e ingresos: caja oficina, fondo fijo…). */
  disponibilidades: CuentaCaja[];
  /** Cuentas de egreso imputables sin auxiliar (gastos menores). */
  gastos: CuentaCaja[];
  centros: { id: string; codigo: string; nombre: string }[];
  bancoSugerido: string | null;
  centroTienda: string | null;
};

export type AsientoSesion = {
  id: string;
  numero: number | null;
  fecha: string;
  descripcion: string;
  origen_tipo: string | null;
  debe: number;
  haber: number;
};

export type SesionHistorial = SesionCaja & {
  resumen: FilaResumenCaja[];
  movimientos: MovimientoCaja[];
  asientos: AsientoSesion[];
};

const COLUMNAS_SESION =
  "id, caja_id, estado, abierta_por, abierta_at, saldo_inicial, contado_inicial, cerrada_por, cerrada_at, saldo_final, contado_final, notas";
const COLUMNAS_MOVIMIENTO =
  "id, sesion_id, tipo, importe, entra, descripcion, asiento_id, creado_por, created_at";

/** Cuenta del Banco Itaú de la tienda (cobros y depósitos del POS). */
export const CODIGO_BANCO_TIENDA = "1.1.01.07";

// ------------------------------------------------------------
// Lecturas
// ------------------------------------------------------------

async function nombresPerfiles(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  const mapa = new Map<string, string>();
  if (unicos.length === 0) return mapa;
  const { data } = await createAdminClient()
    .from("perfiles")
    .select("id, nombre, apellido")
    .in("id", unicos);
  for (const p of data ?? []) {
    mapa.set(p.id, [p.nombre, p.apellido].filter(Boolean).join(" ") || "—");
  }
  return mapa;
}

function numero(v: number | string | null | undefined): number {
  return Number(v ?? 0);
}

function normalizarSesion(s: SesionRow, nombres: Map<string, string>): SesionCaja {
  return {
    ...s,
    saldo_inicial: numero(s.saldo_inicial),
    contado_inicial: numero(s.contado_inicial),
    saldo_final: s.saldo_final == null ? null : numero(s.saldo_final),
    contado_final: s.contado_final == null ? null : numero(s.contado_final),
    abierta_por_nombre: s.abierta_por ? nombres.get(s.abierta_por) ?? null : null,
    cerrada_por_nombre: s.cerrada_por ? nombres.get(s.cerrada_por) ?? null : null,
  };
}

function normalizarMovimiento(m: MovimientoRow, nombres: Map<string, string>): MovimientoCaja {
  return {
    ...m,
    importe: numero(m.importe),
    creado_por_nombre: m.creado_por ? nombres.get(m.creado_por) ?? null : null,
  };
}

/** La caja del POS: la primera activa. */
export async function leerCaja(): Promise<Caja | null> {
  const db = await createCajaClient();
  const { data } = await db
    .from("cajas")
    .select("id, nombre, cuenta_id, activa")
    .eq("activa", true)
    .order("id")
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id, nombre: data.nombre, cuenta_id: data.cuenta_id } : null;
}

/**
 * Saldo contable de una cuenta en el ejercicio de hoy (lo mismo que
 * calcula `comercial._saldo_caja` en la base).
 */
export async function saldoContable(cuentaId: string): Promise<number | null> {
  const cdb = createContabilidadAdminClient();
  const hoy = hoyUruguay();
  const { data: ej } = await cdb
    .from("ejercicios")
    .select("fecha_inicio, fecha_fin")
    .lte("fecha_inicio", hoy)
    .gte("fecha_fin", hoy)
    .maybeSingle();
  if (!ej) return null;
  const { data, error } = await cdb
    .rpc("saldos", { p_desde: ej.fecha_inicio, p_hasta: ej.fecha_fin, p_excluir_cierre: false })
    .eq("cuenta_id", cuentaId);
  if (error) return null;
  return (data ?? []).reduce(
    (s, f) =>
      s + numero(f.debe_anterior) - numero(f.haber_anterior) + numero(f.debe) - numero(f.haber),
    0
  );
}

export async function resumenSesion(sesionId: number): Promise<FilaResumenCaja[]> {
  const db = await createCajaClient();
  const { data } = await db.rpc("resumen_caja", { p_sesion: sesionId });
  return (data ?? []).map((f) => ({
    concepto: f.concepto,
    entradas: numero(f.entradas),
    salidas: numero(f.salidas),
    cantidad: numero(f.cantidad),
  }));
}

/** Estado de la caja para el POS: sesión abierta, efectivo esperado, resumen y movimientos. */
export async function leerEstadoCaja(): Promise<EstadoCaja> {
  const caja = await leerCaja();
  if (!caja) {
    return {
      caja: null,
      sesion: null,
      esperado: null,
      resumen: [],
      movimientos: [],
      error: "No hay una caja activa configurada",
    };
  }
  const db = await createCajaClient();
  const [{ data: sesion, error }, esperado] = await Promise.all([
    db
      .from("caja_sesiones")
      .select(COLUMNAS_SESION)
      .eq("caja_id", caja.id)
      .eq("estado", "abierta")
      .maybeSingle(),
    saldoContable(caja.cuenta_id),
  ]);
  if (error) {
    return { caja, sesion: null, esperado, resumen: [], movimientos: [], error: mensajeError(error) };
  }
  if (!sesion) {
    return { caja, sesion: null, esperado, resumen: [], movimientos: [], error: null };
  }
  const [resumen, { data: movs }] = await Promise.all([
    resumenSesion(sesion.id),
    db
      .from("caja_movimientos")
      .select(COLUMNAS_MOVIMIENTO)
      .eq("sesion_id", sesion.id)
      .order("id", { ascending: false }),
  ]);
  const nombres = await nombresPerfiles([
    sesion.abierta_por,
    ...(movs ?? []).map((m) => m.creado_por),
  ]);
  return {
    caja,
    sesion: normalizarSesion(sesion, nombres),
    esperado,
    resumen,
    movimientos: (movs ?? []).map((m) => normalizarMovimiento(m, nombres)),
    error: null,
  };
}

/** ¿Hay una caja abierta? (la base lo vuelve a exigir al cobrar en efectivo). */
export async function hayCajaAbierta(): Promise<boolean> {
  const db = await createCajaClient();
  const { count } = await db
    .from("caja_sesiones")
    .select("id", { count: "exact", head: true })
    .eq("estado", "abierta");
  return (count ?? 0) > 0;
}

/** Cuentas y centros de costo para los movimientos de caja. */
export async function leerCatalogosCaja(cuentaCaja: string | null): Promise<CatalogosCaja> {
  const cdb = createContabilidadAdminClient();
  const [{ data: cuentas }, { data: centros }] = await Promise.all([
    cdb
      .from("cuentas")
      .select("id, codigo, nombre, clase, moneda, es_disponibilidad, requiere_centro_costo, requiere_auxiliar, imputable, activa")
      .eq("activa", true)
      .eq("imputable", true)
      .order("codigo"),
    cdb.from("centros_costo").select("id, codigo, nombre").eq("activo", true).order("codigo"),
  ]);
  const lista = cuentas ?? [];
  const aCuenta = (c: (typeof lista)[number]): CuentaCaja => ({
    id: c.id,
    codigo: c.codigo,
    nombre: c.nombre,
    requiere_centro_costo: c.requiere_centro_costo,
  });
  const enPesos = lista.filter((c) => c.es_disponibilidad && c.moneda == null && c.id !== cuentaCaja);
  const bancos = enPesos.filter((c) => /banco/i.test(c.nombre)).map(aCuenta);
  const disponibilidades = enPesos.map(aCuenta);
  const gastos = lista
    .filter((c) => c.clase === "egreso" && c.requiere_auxiliar == null)
    .map(aCuenta);
  const bancoSugerido =
    lista.find((c) => c.codigo === CODIGO_BANCO_TIENDA)?.id ?? bancos[0]?.id ?? null;
  const centroTienda = (centros ?? []).find((c) => c.codigo === "TIENDA")?.id ?? null;
  return {
    bancos: bancos.length > 0 ? bancos : disponibilidades,
    disponibilidades,
    gastos,
    centros: centros ?? [],
    bancoSugerido,
    centroTienda,
  };
}

/** Asientos que movieron la cuenta de la caja durante una sesión. */
async function asientosDeSesion(cuentaCaja: string, s: SesionRow): Promise<AsientoSesion[]> {
  const cdb = createContabilidadAdminClient();
  let q = cdb
    .from("lineas")
    .select("debe, haber, asientos!inner(id, numero, fecha, descripcion, origen_tipo, estado, created_at)")
    .eq("cuenta_id", cuentaCaja)
    .eq("asientos.estado", "confirmado")
    .gte("asientos.created_at", s.abierta_at)
    .limit(1000);
  if (s.cerrada_at) q = q.lte("asientos.created_at", s.cerrada_at);
  const { data } = await q;
  const porAsiento = new Map<string, AsientoSesion & { created_at: string }>();
  for (const l of data ?? []) {
    const a = l.asientos;
    if (!a) continue;
    const previo = porAsiento.get(a.id);
    if (previo) {
      previo.debe += numero(l.debe);
      previo.haber += numero(l.haber);
    } else {
      porAsiento.set(a.id, {
        id: a.id,
        numero: a.numero,
        fecha: a.fecha,
        descripcion: a.descripcion,
        origen_tipo: a.origen_tipo,
        debe: numero(l.debe),
        haber: numero(l.haber),
        created_at: a.created_at,
      });
    }
  }
  return [...porAsiento.values()]
    .sort((x, y) => x.created_at.localeCompare(y.created_at))
    .map((a) => ({
      id: a.id,
      numero: a.numero,
      fecha: a.fecha,
      descripcion: a.descripcion,
      origen_tipo: a.origen_tipo,
      debe: a.debe,
      haber: a.haber,
    }));
}

/** Últimas sesiones de la caja con su resumen, movimientos y asientos. */
export async function leerHistorialCaja(limite = 30): Promise<{
  caja: Caja | null;
  sesiones: SesionHistorial[];
  error: string | null;
}> {
  const caja = await leerCaja();
  if (!caja) return { caja: null, sesiones: [], error: "No hay una caja activa configurada" };
  const db = await createCajaClient();
  const { data: sesiones, error } = await db
    .from("caja_sesiones")
    .select(COLUMNAS_SESION)
    .eq("caja_id", caja.id)
    .order("abierta_at", { ascending: false })
    .limit(limite);
  if (error) return { caja, sesiones: [], error: mensajeError(error) };
  const lista = sesiones ?? [];
  const ids = lista.map((s) => s.id);
  const { data: movs } = ids.length
    ? await db
        .from("caja_movimientos")
        .select(COLUMNAS_MOVIMIENTO)
        .in("sesion_id", ids)
        .order("id", { ascending: false })
    : { data: [] as MovimientoRow[] };
  const nombres = await nombresPerfiles([
    ...lista.flatMap((s) => [s.abierta_por, s.cerrada_por]),
    ...(movs ?? []).map((m) => m.creado_por),
  ]);
  const detalle = await Promise.all(
    lista.map(async (s) => {
      const [resumen, asientos] = await Promise.all([
        resumenSesion(s.id),
        asientosDeSesion(caja.cuenta_id, s),
      ]);
      return {
        ...normalizarSesion(s, nombres),
        resumen,
        asientos,
        movimientos: (movs ?? [])
          .filter((m) => m.sesion_id === s.id)
          .map((m) => normalizarMovimiento(m, nombres)),
      };
    })
  );
  return { caja, sesiones: detalle, error: null };
}
