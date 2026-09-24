import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/types/database";
import { computarHash } from "@/lib/tesoreria/parsear-itau";

/**
 * Conciliación de estados de cuenta cargados por Claude (vía MCP).
 *
 * Claude lee el extracto (PDF, CSV o foto de cualquier banco) y manda las
 * líneas ya estructuradas. Acá se comparan contra el sistema y se aplican
 * las correcciones en una sola transacción (RPC aplicar_cambios_tesoreria).
 *
 * Regla: un movimiento está conciliado cuando tiene extracto_id, o sea,
 * cuando aparece en el estado de cuenta del banco.
 */

type Db = SupabaseClient<Database>;
type Tipo = "ingreso" | "egreso";

const VENTANA_MATCH_DIAS = 3;
const VENTANA_OLLA_DIAS = 5;
// Rango de movimientos del sistema que se miran alrededor del período
// (para detectar fechas mal cargadas o partidas en tránsito).
const MARGEN_ANTES_DIAS = 90;
const MARGEN_DESPUES_DIAS = 30;
const ORIGENES_PROTEGIDOS = new Set(["pedido", "transferencia", "pago_proveedor"]);

export class ErrorConciliacion extends Error {}

// =====================
// Schemas de entrada
// =====================

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD");
const motivo = z.string().trim().min(3).max(500);

export const lineaExtractoSchema = z.object({
  fecha: fecha.describe("Fecha de la operación en el banco"),
  descripcion: z.string().trim().min(1).max(500).describe("Concepto tal como figura en el extracto"),
  referencia: z.string().trim().max(100).optional().describe("Nº de referencia/comprobante si figura"),
  monto: z.number().positive().describe("Siempre positivo; el signo lo da 'tipo'"),
  tipo: z.enum(["ingreso", "egreso"]).describe("ingreso = crédito/haber, egreso = débito/debe"),
  saldo: z.number().optional().describe("Saldo después de la línea, si el extracto lo muestra (permite ubicar errores de lectura)"),
});

export const extractoSchema = z.object({
  cuenta_id: z.number().int().positive().describe("Cuenta de tesorería (tabla cuentas_financieras)"),
  archivo_nombre: z.string().trim().min(1).max(255).describe("Nombre del archivo o descripción, ej. 'Itaú UYU agosto 2026.pdf'"),
  periodo_desde: fecha.optional().describe("Inicio del período del extracto. Por defecto la primera fecha de las líneas."),
  periodo_hasta: fecha.optional().describe("Fin del período del extracto. Por defecto la última fecha de las líneas."),
  saldo_inicial: z.number().describe("Saldo inicial / anterior según el banco"),
  saldo_final: z.number().describe("Saldo final según el banco"),
  lineas: z.array(lineaExtractoSchema).min(1).max(1500).describe("Todas las líneas del extracto en el orden del banco (sin las filas de saldo)"),
});

const cambiosSchema = z
  .object({
    monto: z.number().positive().optional(),
    tipo: z.enum(["ingreso", "egreso"]).optional(),
    fecha: fecha.optional(),
    descripcion: z.string().trim().min(1).max(500).optional(),
    nombre: z.string().trim().max(200).nullable().optional(),
    notas: z.string().trim().max(2000).nullable().optional(),
    categoria_id: z.number().int().positive().nullable().optional(),
    subcategoria_id: z.number().int().positive().nullable().optional(),
  })
  .refine((c) => Object.keys(c).length > 0, "Indicá al menos un cambio");

export const correccionSchema = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("editar"),
    movimiento_id: z.number().int().positive(),
    cambios: cambiosSchema,
    motivo: motivo.describe("Por qué se corrige (queda en el historial)"),
  }),
  z.object({
    accion: z.literal("eliminar"),
    movimiento_id: z.number().int().positive(),
    motivo: motivo.describe("Por qué se elimina, ej. 'duplicado del #123' (queda en el historial)"),
  }),
]);

export const decisionSchema = z.object({
  linea: z.number().int().min(1).describe("Número de línea (1 = primera) tal como lo devolvió previsualizar_extracto"),
  accion: z
    .enum(["conciliar", "crear", "donacion_olla", "omitir"])
    .describe(
      "conciliar = es un movimiento que ya está en el sistema (movimiento_id); crear = registrar como nuevo; " +
        "donacion_olla = transferencia de donaciones a la Olla del Hogar (no es gasto del club); omitir = no registrar"
    ),
  movimiento_id: z.number().int().positive().optional().describe("Para conciliar: el movimiento del sistema"),
  corregir_fecha: z.boolean().optional().describe("Al conciliar, pasar la fecha del movimiento a la del banco"),
  categoria_id: z.number().int().positive().optional().describe("Categoría a asignar (categorias_financieras)"),
  nombre: z.string().trim().max(200).optional().describe("Nombre corto legible, ej. 'UTE agosto'"),
  notas: z.string().trim().max(2000).optional(),
  motivo: z.string().trim().max(500).optional().describe("Motivo si se corrige un movimiento al conciliarlo"),
});

export const aplicarExtractoSchema = extractoSchema.extend({
  preview_id: z.string().min(8).describe("preview_id devuelto por previsualizar_extracto con estas mismas líneas"),
  decisiones: z
    .array(decisionSchema)
    .max(1500)
    .optional()
    .describe("Solo las líneas donde cambia la propuesta o se agrega categoría/nombre. El resto usa la propuesta de la previsualización."),
  correcciones: z
    .array(correccionSchema)
    .max(500)
    .optional()
    .describe("Ediciones o borrados de movimientos del sistema (duplicados, montos o fechas mal cargadas)"),
  ajustar_saldo_inicial: z
    .boolean()
    .optional()
    .describe(
      "Solo con el extracto más antiguo de la cuenta (backfill): fija el saldo inicial de la cuenta para que la apertura coincida con la del banco. " +
        "Se calcula al aplicar, contemplando las correcciones del mismo paso."
    ),
  motivo_saldo_inicial: z.string().trim().max(500).optional(),
  ajuste: z
    .object({
      monto: z.number().refine((v) => v !== 0, "El ajuste no puede ser 0").describe("Positivo = ingreso, negativo = egreso"),
      motivo: z.string().trim().min(5).max(500),
    })
    .optional()
    .describe("SOLO si el usuario lo pide explícitamente: ajuste por una diferencia que no se pudo explicar. Queda visible en los reportes."),
});

export const editarMovimientosSchema = z.object({
  cuenta_id: z.number().int().positive(),
  correcciones: z.array(correccionSchema).min(1).max(500),
});

export type ExtractoInput = z.infer<typeof extractoSchema>;
export type AplicarExtractoInput = z.infer<typeof aplicarExtractoSchema>;
export type EditarMovimientosInput = z.infer<typeof editarMovimientosSchema>;

// =====================
// Tipos internos
// =====================

type Movimiento = {
  id: number;
  cuenta_id: number;
  fecha: string;
  descripcion: string;
  nombre: string | null;
  monto: number;
  tipo: Tipo;
  referencia: string | null;
  origen_tipo: string | null;
  origen_id: number | null;
  transferencia_id: number | null;
  extracto_id: number | null;
  categoria: string | null;
};

type MovimientoBreve = {
  id: number;
  fecha: string;
  tipo: Tipo;
  monto: number;
  descripcion: string;
  categoria: string | null;
  origen: string | null;
  protegido: boolean;
};

type PosibleError = {
  problema: "fecha_distinta" | "tipo_invertido" | "monto_distinto";
  movimiento: MovimientoBreve;
  detalle: string;
};

type LineaAnalizada = {
  linea: number;
  fecha: string;
  tipo: Tipo;
  monto: number;
  descripcion: string;
  referencia: string | null;
  hash_dedupe: string;
  propuesta: "conciliar" | "crear" | "donacion_olla" | "omitir";
  motivo_propuesta?: string;
  movimiento?: MovimientoBreve;
  donacion?: number;
  alternativas?: MovimientoBreve[];
  posibles_errores?: PosibleError[];
};

export type EstadoExtracto = {
  extracto_id: number;
  archivo: string;
  desde: string | null;
  hasta: string | null;
  saldo_inicial_banco: number | null;
  saldo_final_banco: number | null;
  apertura_esperada: number;
  diferencia_apertura: number | null;
  continuidad_ok: boolean;
  movimientos_conciliados: number;
  ajuste_donaciones: number;
  cierre_esperado: number;
  diferencia: number | null;
  cierra: boolean;
};

export type EstadoConciliacion = {
  cuenta_id: number;
  cuenta: string;
  moneda: "UYU" | "USD";
  saldo_inicial: number;
  saldo_actual: number;
  conciliada_desde: string | null;
  conciliada_hasta: string | null;
  base_apertura: number;
  extractos: EstadoExtracto[];
  pendientes_sin_conciliar: { cantidad: number; efecto_neto: number };
};

// =====================
// Helpers
// =====================

const cents = (n: number) => Math.round(n * 100);
const redondear = (n: number) => cents(n) / 100;
const conSigno = (tipo: Tipo, monto: number) => (tipo === "ingreso" ? monto : -monto);

function diffDias(a: string, b: string): number {
  const ms = new Date(a + "T00:00:00Z").getTime() - new Date(b + "T00:00:00Z").getTime();
  return Math.round(Math.abs(ms) / 86_400_000);
}

function sumarDias(f: string, dias: number): string {
  const d = new Date(f + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const esProtegido = (m: Movimiento) =>
  m.transferencia_id != null || (m.origen_tipo != null && ORIGENES_PROTEGIDOS.has(m.origen_tipo));

function breve(m: Movimiento): MovimientoBreve {
  return {
    id: m.id,
    fecha: m.fecha,
    tipo: m.tipo,
    monto: m.monto,
    descripcion: m.nombre ? `${m.nombre} — ${m.descripcion}` : m.descripcion,
    categoria: m.categoria,
    origen: m.origen_tipo,
    protegido: esProtegido(m),
  };
}

const SELECT_MOV =
  "id, cuenta_id, fecha, descripcion, nombre, monto, tipo, referencia, origen_tipo, origen_id, transferencia_id, extracto_id, categorias_financieras!movimientos_financieros_categoria_id_fkey(nombre)";

type FilaMov = Omit<Movimiento, "monto" | "categoria"> & {
  monto: number | string;
  categorias_financieras: { nombre: string } | null;
};

function aMovimiento(f: FilaMov): Movimiento {
  const { categorias_financieras, ...resto } = f;
  return { ...resto, tipo: f.tipo as Tipo, monto: Number(f.monto), categoria: categorias_financieras?.nombre ?? null };
}

async function movimientosEnRango(db: Db, cuentaId: number, desde: string, hasta: string) {
  const out: Movimiento[] = [];
  const PAGINA = 1000;
  for (let desdeFila = 0; ; desdeFila += PAGINA) {
    const { data, error } = await db
      .from("movimientos_financieros")
      .select(SELECT_MOV)
      .eq("cuenta_id", cuentaId)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("id")
      .range(desdeFila, desdeFila + PAGINA - 1);
    if (error) throw error;
    const filas = (data ?? []) as unknown as FilaMov[];
    out.push(...filas.map(aMovimiento));
    if (filas.length < PAGINA) break;
  }
  return out;
}

async function movimientosPorId(db: Db, ids: number[]) {
  if (ids.length === 0) return [];
  const { data, error } = await db.from("movimientos_financieros").select(SELECT_MOV).in("id", ids);
  if (error) throw error;
  return ((data ?? []) as unknown as FilaMov[]).map(aMovimiento);
}

export async function estadoConciliacion(db: Db, cuentaId: number): Promise<EstadoConciliacion | null> {
  const { data, error } = await db.rpc("estado_conciliacion_cuenta", { p_cuenta_id: cuentaId });
  if (error) throw error;
  return (data as unknown as EstadoConciliacion | null) ?? null;
}

/** Estado de conciliación de todas las cuentas de tesorería (o de una). */
export async function estadoConciliacionCuentas(db: Db, cuentaId?: number) {
  let q = db
    .from("cuentas_financieras")
    .select("id")
    .eq("activa", true)
    .eq("incluir_en_tesoreria", true)
    .order("id");
  if (cuentaId) q = q.eq("id", cuentaId);
  const { data, error } = await q;
  if (error) throw error;
  const estados = await Promise.all((data ?? []).map((c) => estadoConciliacion(db, c.id)));
  return estados.filter((e): e is EstadoConciliacion => !!e).map(resumirEstado);
}

function resumirEstado(e: EstadoConciliacion) {
  const problemas: string[] = [];
  for (const x of e.extractos) {
    if (!x.continuidad_ok) {
      problemas.push(
        `El extracto #${x.extracto_id} (${x.desde} a ${x.hasta}) no arranca con el saldo final del anterior: falta un extracto en el medio o hay un error de lectura.`
      );
    }
    if (!x.cierra && x.diferencia != null) {
      problemas.push(`El extracto #${x.extracto_id} (${x.desde} a ${x.hasta}) no cierra por ${redondear(x.diferencia)} ${e.moneda}.`);
    }
  }
  return { ...e, cierra_todo: e.extractos.length > 0 && e.extractos.every((x) => x.cierra), problemas };
}

// =====================
// Previsualizar
// =====================

export async function analizarExtracto(db: Db, input: ExtractoInput) {
  const { data: cuenta, error: errCuenta } = await db
    .from("cuentas_financieras")
    .select("id, nombre, moneda, saldo_inicial, saldo_actual")
    .eq("id", input.cuenta_id)
    .maybeSingle();
  if (errCuenta) throw errCuenta;
  if (!cuenta) throw new ErrorConciliacion(`La cuenta ${input.cuenta_id} no existe o no tenés acceso.`);
  const saldoInicialCuenta = Number(cuenta.saldo_inicial);

  const fechas = input.lineas.map((l) => l.fecha).sort();
  const desde = input.periodo_desde ?? fechas[0];
  const hasta = input.periodo_hasta ?? fechas[fechas.length - 1];
  if (desde > hasta) throw new ErrorConciliacion("periodo_desde es posterior a periodo_hasta.");

  // Identificador del contenido: mismo extracto → mismo id (también evita importarlo dos veces).
  const previewId = createHash("sha256")
    .update(
      JSON.stringify({
        c: input.cuenta_id,
        d: desde,
        h: hasta,
        si: cents(input.saldo_inicial),
        sf: cents(input.saldo_final),
        l: input.lineas.map((l) => [l.fecha, l.tipo, cents(l.monto), l.descripcion, l.referencia ?? "", l.saldo ?? null]),
      })
    )
    .digest("hex");

  // --- 1. Lectura: ¿las líneas suman el saldo final? ---
  let suma = 0;
  const inconsistentes: Array<{ linea: number; saldo_informado: number; saldo_calculado: number }> = [];
  let corriente = input.saldo_inicial;
  input.lineas.forEach((l, i) => {
    suma += conSigno(l.tipo, l.monto);
    corriente += conSigno(l.tipo, l.monto);
    if (l.saldo !== undefined) {
      if (cents(l.saldo) !== cents(corriente) && inconsistentes.length < 5) {
        inconsistentes.push({ linea: i + 1, saldo_informado: l.saldo, saldo_calculado: redondear(corriente) });
      }
      corriente = l.saldo; // resincronizar para ubicar el próximo error
    }
  });
  const saldoFinalCalculado = input.saldo_inicial + suma;
  const lectura = {
    cierra: cents(saldoFinalCalculado) === cents(input.saldo_final),
    saldo_inicial: input.saldo_inicial,
    suma_movimientos: redondear(suma),
    saldo_final_calculado: redondear(saldoFinalCalculado),
    saldo_final_informado: input.saldo_final,
    diferencia: redondear(input.saldo_final - saldoFinalCalculado),
    lineas_inconsistentes: inconsistentes,
  };

  // --- 2. Extractos existentes de la cuenta ---
  const { data: extractos, error: errExt } = await db
    .from("extractos_importados")
    .select("id, archivo_hash, archivo_nombre, fecha_desde, fecha_hasta")
    .eq("cuenta_id", input.cuenta_id);
  if (errExt) throw errExt;
  const yaImportado = (extractos ?? []).find((e) => e.archivo_hash === previewId) ?? null;
  const superpuestos = (extractos ?? [])
    .filter((e) => e.id !== yaImportado?.id && e.fecha_desde && e.fecha_hasta && e.fecha_desde <= hasta && e.fecha_hasta >= desde)
    .map((e) => ({ extracto_id: e.id, archivo: e.archivo_nombre, desde: e.fecha_desde, hasta: e.fecha_hasta }));

  // --- 3. Apertura esperada según el sistema ---
  const estado = await estadoConciliacion(db, input.cuenta_id);
  const anteriores = (estado?.extractos ?? []).filter((e) => e.hasta != null && e.hasta < desde);
  const anterior = anteriores.length > 0 ? anteriores[anteriores.length - 1] : null;
  const esPrimero = !(estado?.extractos ?? []).some((e) => e.desde != null && e.desde < desde);

  let aperturaEsperada: number;
  if (anterior) {
    aperturaEsperada = anterior.cierre_esperado;
  } else {
    // Primer extracto: saldo inicial de la cuenta + todo lo cargado antes y sin conciliar.
    const previos = await sumaSinConciliarAntesDe(db, input.cuenta_id, desde);
    aperturaEsperada = saldoInicialCuenta + previos;
  }
  const diferenciaApertura = redondear(input.saldo_inicial - aperturaEsperada);

  // --- 4. Movimientos del sistema alrededor del período ---
  const movs = await movimientosEnRango(
    db,
    input.cuenta_id,
    sumarDias(desde, -MARGEN_ANTES_DIAS),
    sumarDias(hasta, MARGEN_DESPUES_DIAS)
  );
  const libres = movs.filter((m) => m.extracto_id == null);

  // Donaciones: el banco ve el bruto (venta + donación) y el sistema el neto.
  const pedidoIds = [...new Set(libres.filter((m) => m.origen_tipo === "pedido" && m.origen_id != null).map((m) => m.origen_id!))];
  const donacionPorPedido = new Map<number, number>();
  if (pedidoIds.length > 0) {
    const { data: dons } = await db
      .from("donaciones")
      .select("pedido_id, monto")
      .in("pedido_id", pedidoIds)
      .in("estado", ["cobrada", "transferida"]);
    for (const d of dons ?? []) donacionPorPedido.set(d.pedido_id, Number(d.monto));
  }
  const donacionDe = (m: Movimiento) =>
    m.origen_tipo === "pedido" && m.origen_id != null ? (donacionPorPedido.get(m.origen_id) ?? 0) : 0;

  const { data: transfOlla } = await db
    .from("donaciones_transferencias")
    .select("id, fecha_transferencia, monto_total")
    .gte("fecha_transferencia", sumarDias(desde, -VENTANA_OLLA_DIAS))
    .lte("fecha_transferencia", sumarDias(hasta, VENTANA_OLLA_DIAS));

  // Hashes (mismo extracto releído o importado antes por CSV)
  const hashes = input.lineas.map((l) =>
    computarHash(input.cuenta_id, l.fecha, l.descripcion, l.monto, l.tipo, l.saldo ?? null)
  );
  const porHash = new Map<string, { id: number; extracto_id: number | null }>();
  for (let i = 0; i < hashes.length; i += 200) {
    const { data } = await db
      .from("movimientos_financieros")
      .select("id, hash_dedupe, extracto_id")
      .eq("cuenta_id", input.cuenta_id)
      .in("hash_dedupe", hashes.slice(i, i + 200));
    for (const r of data ?? []) if (r.hash_dedupe) porHash.set(r.hash_dedupe, { id: r.id, extracto_id: r.extracto_id });
  }

  // --- 5. Emparejar líneas ↔ movimientos (uno a uno) ---
  const usados = new Set<number>();
  const ollaUsadas = new Set<number>();
  const libresPorId = new Map(libres.map((m) => [m.id, m]));

  const lineas: LineaAnalizada[] = input.lineas.map((l, i) => ({
    linea: i + 1,
    fecha: l.fecha,
    tipo: l.tipo,
    monto: l.monto,
    descripcion: l.descripcion,
    referencia: l.referencia ?? null,
    hash_dedupe: hashes[i],
    propuesta: "crear",
  }));

  // 5a. Hash exacto
  for (const la of lineas) {
    const h = porHash.get(la.hash_dedupe);
    if (!h) continue;
    if (h.extracto_id != null) {
      la.propuesta = "omitir";
      la.motivo_propuesta = `Ya está conciliada (movimiento #${h.id}, extracto #${h.extracto_id}).`;
    } else if (libresPorId.has(h.id)) {
      la.propuesta = "conciliar";
      la.movimiento = breve(libresPorId.get(h.id)!);
      usados.add(h.id);
    }
  }

  // 5b. Match exacto por monto/tipo/fecha ±3 días (acepta bruto con donación)
  const coincide = (la: LineaAnalizada, m: Movimiento) =>
    m.tipo === la.tipo &&
    diffDias(m.fecha, la.fecha) <= VENTANA_MATCH_DIAS &&
    (cents(m.monto) === cents(la.monto) || (donacionDe(m) > 0 && cents(m.monto + donacionDe(m)) === cents(la.monto)));

  const pendientes = lineas.filter((la) => la.propuesta === "crear");
  const candidatosDe = new Map(pendientes.map((la) => [la.linea, libres.filter((m) => coincide(la, m))]));
  // Primero las líneas con menos opciones, así las únicas no pierden su pareja.
  const orden = [...pendientes].sort(
    (a, b) => (candidatosDe.get(a.linea)!.length || 99) - (candidatosDe.get(b.linea)!.length || 99)
  );
  for (const la of orden) {
    const disponibles = candidatosDe.get(la.linea)!.filter((m) => !usados.has(m.id));
    if (disponibles.length === 0) continue;
    disponibles.sort((a, b) => {
      const refA = la.referencia && a.referencia?.trim() === la.referencia ? 0 : 1;
      const refB = la.referencia && b.referencia?.trim() === la.referencia ? 0 : 1;
      return refA - refB || diffDias(a.fecha, la.fecha) - diffDias(b.fecha, la.fecha) || a.id - b.id;
    });
    const elegido = disponibles[0];
    usados.add(elegido.id);
    la.propuesta = "conciliar";
    la.movimiento = breve(elegido);
    const don = donacionDe(elegido);
    if (don > 0 && cents(elegido.monto) !== cents(la.monto)) la.donacion = don;
    if (disponibles.length > 1) {
      la.alternativas = disponibles.slice(1, 4).map(breve);
      la.motivo_propuesta = "Hay más de un movimiento posible; se eligió el de fecha más cercana.";
    }
  }

  // 5c. Transferencias a la Olla del Hogar
  for (const la of lineas) {
    if (la.propuesta !== "crear" || la.tipo !== "egreso") continue;
    const t = (transfOlla ?? []).find(
      (x) =>
        !ollaUsadas.has(x.id) &&
        cents(Number(x.monto_total)) === cents(la.monto) &&
        diffDias(x.fecha_transferencia, la.fecha) <= VENTANA_OLLA_DIAS
    );
    if (t) {
      ollaUsadas.add(t.id);
      la.propuesta = "donacion_olla";
      la.motivo_propuesta = `Coincide con la transferencia de donaciones a la Olla del ${t.fecha_transferencia}.`;
    }
  }

  // 5d. Sin match: posibles errores de carga en el sistema
  for (const la of lineas) {
    if (la.propuesta !== "crear") continue;
    const sueltos = libres.filter((m) => !usados.has(m.id));
    const posibles: PosibleError[] = [];
    for (const m of sueltos) {
      const dd = diffDias(m.fecha, la.fecha);
      const mismoMonto = cents(m.monto) === cents(la.monto);
      if (mismoMonto && m.tipo === la.tipo && dd > VENTANA_MATCH_DIAS) {
        posibles.push({ problema: "fecha_distinta", movimiento: breve(m), detalle: `Mismo monto, cargado con ${dd} días de diferencia` });
      } else if (mismoMonto && m.tipo !== la.tipo && dd <= VENTANA_OLLA_DIAS) {
        posibles.push({ problema: "tipo_invertido", movimiento: breve(m), detalle: `Mismo monto pero cargado como ${m.tipo}` });
      } else if (!mismoMonto && m.tipo === la.tipo && dd <= VENTANA_MATCH_DIAS && m.monto / la.monto >= 0.01 && m.monto / la.monto <= 100) {
        posibles.push({ problema: "monto_distinto", movimiento: breve(m), detalle: `Cargado por ${m.monto} (banco: ${la.monto})` });
      }
    }
    if (posibles.length > 0) {
      const peso = { fecha_distinta: 0, tipo_invertido: 1, monto_distinto: 2 };
      posibles.sort((a, b) => peso[a.problema] - peso[b.problema]);
      la.posibles_errores = posibles.slice(0, 4);
      la.motivo_propuesta = "No hay movimiento idéntico en el sistema, pero hay candidatos con posibles errores de carga.";
    }
  }

  // --- 6. Movimientos del sistema que el banco no muestra ---
  const soloEnSistema = libres
    .filter((m) => !usados.has(m.id) && m.fecha >= desde && m.fecha <= hasta)
    .map(breve);

  // --- 7. Proyección del cierre si se aplica la propuesta ---
  const efectoLineas = lineas
    .filter((la) => la.propuesta !== "omitir")
    .reduce((s, la) => s + conSigno(la.tipo, la.monto), 0);
  const cierreProyectado = aperturaEsperada + efectoLineas;
  const saldoInicialSugerido = esPrimero && diferenciaApertura !== 0 ? redondear(saldoInicialCuenta + diferenciaApertura) : null;
  const cierreConSugerencia = cierreProyectado + (saldoInicialSugerido != null ? diferenciaApertura : 0);

  const cuenta_ = (tipo: LineaAnalizada["propuesta"]) => lineas.filter((l) => l.propuesta === tipo).length;
  const resumen = {
    lineas: lineas.length,
    conciliar: cuenta_("conciliar"),
    crear: cuenta_("crear"),
    donacion_olla: cuenta_("donacion_olla"),
    omitir: cuenta_("omitir"),
    con_alternativas: lineas.filter((l) => l.alternativas).length,
    con_posibles_errores: lineas.filter((l) => l.posibles_errores).length,
    solo_en_sistema: soloEnSistema.length,
  };

  const pasos: string[] = [];
  if (yaImportado) pasos.push(`Este extracto ya fue importado (extracto #${yaImportado.id}). No hay nada para aplicar.`);
  if (!lectura.cierra) {
    pasos.push(
      `Las líneas no suman el saldo final (diferencia ${lectura.diferencia}). Es un error de lectura del extracto: ` +
        (inconsistentes.length > 0
          ? `revisá la línea ${inconsistentes.map((x) => x.linea).join(", ")} (el saldo informado no coincide con el calculado). `
          : "revisá montos, tipos y si falta o sobra alguna línea. ") +
        "Corregí las líneas y volvé a previsualizar."
    );
  }
  if (superpuestos.length > 0) {
    pasos.push(
      "El período se superpone con extractos ya importados. Sacá las líneas que ya estaban y usá como saldo_inicial el saldo del banco al comienzo del tramo nuevo."
    );
  }
  if (diferenciaApertura !== 0) {
    pasos.push(
      saldoInicialSugerido != null
        ? `El saldo de apertura del banco (${input.saldo_inicial}) no coincide con el del sistema (${redondear(aperturaEsperada)}). Como es el primer extracto de la cuenta, aplicá con ajustar_saldo_inicial: true (el saldo inicial pasa a ≈ ${saldoInicialSugerido}; el valor exacto se calcula al aplicar).`
        : `La apertura del banco (${input.saldo_inicial}) no coincide con el cierre esperado del extracto anterior #${anterior?.extracto_id ?? "?"} (${redondear(aperturaEsperada)}). Falta un extracto en el medio o el anterior no cierra: revisalo con estado_conciliacion.`
    );
  }
  if (resumen.con_posibles_errores > 0) {
    pasos.push(
      `${resumen.con_posibles_errores} línea(s) no tienen pareja exacta pero hay movimientos parecidos. Si son el mismo, conciliá con movimiento_id (monto y tipo se corrigen al del banco; con corregir_fecha también la fecha). Si no, se crean.`
    );
  }
  if (soloEnSistema.length > 0) {
    pasos.push(
      `${soloEnSistema.length} movimiento(s) del sistema en el período no aparecen en el banco. Si son duplicados o errores, eliminalos en 'correcciones'; si están en tránsito (ej. cheque sin cobrar), dejalos.`
    );
  }
  if (resumen.crear > 0) {
    pasos.push("Las líneas nuevas quedan sin categoría salvo que pases categoria_id en decisiones (ver categorias_financieras).");
  }

  return {
    preview_id: previewId,
    cuenta: { id: cuenta.id, nombre: cuenta.nombre, moneda: cuenta.moneda, saldo_inicial: saldoInicialCuenta },
    periodo: { desde, hasta },
    ya_importado: yaImportado ? { extracto_id: yaImportado.id } : null,
    superpuesto_con: superpuestos,
    lectura,
    apertura: {
      es_primer_extracto: esPrimero,
      extracto_anterior: anterior ? { extracto_id: anterior.extracto_id, hasta: anterior.hasta } : null,
      esperada_segun_sistema: redondear(aperturaEsperada),
      segun_banco: input.saldo_inicial,
      diferencia: diferenciaApertura,
      saldo_inicial_cuenta_sugerido: saldoInicialSugerido,
    },
    cierre_proyectado: {
      segun_sistema: redondear(saldoInicialSugerido != null ? cierreConSugerencia : cierreProyectado),
      segun_banco: input.saldo_final,
      diferencia: redondear(input.saldo_final - (saldoInicialSugerido != null ? cierreConSugerencia : cierreProyectado)),
      nota:
        saldoInicialSugerido != null
          ? "Incluye el ajuste de saldo inicial sugerido."
          : "Aplicando la propuesta tal cual.",
    },
    resumen,
    lineas,
    solo_en_sistema: soloEnSistema,
    proximos_pasos: pasos,
    // Para aplicar internamente, no hace falta mostrarlo.
    _interno: { libresPorId, donacionDe, esPrimero },
  };
}

async function sumaSinConciliarAntesDe(db: Db, cuentaId: number, fecha: string) {
  let total = 0;
  const PAGINA = 1000;
  for (let desdeFila = 0; ; desdeFila += PAGINA) {
    const { data, error } = await db
      .from("movimientos_financieros")
      .select("tipo, monto")
      .eq("cuenta_id", cuentaId)
      .is("extracto_id", null)
      .lt("fecha", fecha)
      .order("id")
      .range(desdeFila, desdeFila + PAGINA - 1);
    if (error) throw error;
    for (const r of data ?? []) total += conSigno(r.tipo as Tipo, Number(r.monto));
    if ((data ?? []).length < PAGINA) break;
  }
  return total;
}

/** Versión para devolver al modelo (sin los datos internos). */
export async function previsualizarExtracto(db: Db, input: ExtractoInput) {
  const { _interno, ...analisis } = await analizarExtracto(db, input);
  void _interno;
  return analisis;
}

// =====================
// Aplicar
// =====================

export async function aplicarExtracto(db: Db, input: AplicarExtractoInput) {
  const analisis = await analizarExtracto(db, input);
  const { libresPorId, donacionDe, esPrimero } = analisis._interno;

  if (analisis.preview_id !== input.preview_id) {
    throw new ErrorConciliacion(
      "Las líneas o los saldos no son los mismos que en la previsualización. Volvé a llamar a previsualizar_extracto con los datos corregidos."
    );
  }
  if (analisis.ya_importado) {
    throw new ErrorConciliacion(`Este extracto ya fue importado (extracto #${analisis.ya_importado.extracto_id}).`);
  }
  if (!analisis.lectura.cierra) {
    throw new ErrorConciliacion(
      `Las líneas no suman el saldo final del banco (diferencia ${analisis.lectura.diferencia}): hay un error de lectura del extracto. ` +
        "Corregí las líneas (no los datos del sistema) y volvé a previsualizar."
    );
  }
  if (analisis.superpuesto_con.length > 0) {
    throw new ErrorConciliacion(
      "El período se superpone con extractos ya importados " +
        analisis.superpuesto_con.map((s) => `#${s.extracto_id} (${s.desde} a ${s.hasta})`).join(", ") +
        ". Sacá las líneas ya importadas, ajustá periodo_desde y saldo_inicial al tramo nuevo, y volvé a previsualizar."
    );
  }
  if (input.ajustar_saldo_inicial && !esPrimero) {
    throw new ErrorConciliacion(
      "El saldo inicial de la cuenta solo se ajusta al cargar el extracto más antiguo; cambiarlo ahora descuadraría los extractos anteriores. " +
        "Si la apertura no coincide, falta un extracto en el medio o el anterior no cierra."
    );
  }

  const decisiones = new Map((input.decisiones ?? []).map((d) => [d.linea, d]));
  for (const n of decisiones.keys()) {
    if (n > analisis.lineas.length) throw new ErrorConciliacion(`La decisión para la línea ${n} no corresponde a ninguna línea.`);
  }

  // Movimientos elegidos por Claude que no estaban en la ventana analizada.
  const idsExtra = [...decisiones.values()]
    .map((d) => d.movimiento_id)
    .filter((id): id is number => id != null && !libresPorId.has(id));
  const extra = new Map((await movimientosPorId(db, idsExtra)).map((m) => [m.id, m]));

  const eliminados = new Set(
    (input.correcciones ?? []).filter((c) => c.accion === "eliminar").map((c) => c.movimiento_id)
  );
  const correcciones: Array<z.infer<typeof correccionSchema>> = [...(input.correcciones ?? [])];
  const conciliar: Array<Record<string, unknown>> = [];
  const crear: Array<Record<string, unknown>> = [];
  const usados = new Set<number>();
  let ajusteDonaciones = 0;
  const avisos: string[] = [];

  for (const la of analisis.lineas) {
    const d = decisiones.get(la.linea);
    const accion = d?.accion ?? la.propuesta;

    if (accion === "omitir") continue;

    if (accion === "donacion_olla") {
      if (la.tipo !== "egreso") throw new ErrorConciliacion(`Línea ${la.linea}: una transferencia a la Olla tiene que ser egreso.`);
      ajusteDonaciones -= la.monto;
      continue;
    }

    if (accion === "crear") {
      crear.push({
        tipo: la.tipo,
        monto: la.monto,
        fecha: la.fecha,
        descripcion: la.descripcion,
        referencia: la.referencia,
        hash_dedupe: la.hash_dedupe,
        categoria_id: d?.categoria_id ?? null,
        nombre: d?.nombre ?? null,
        notas: d?.notas ?? null,
      });
      continue;
    }

    // conciliar
    const movId = d?.movimiento_id ?? la.movimiento?.id;
    if (!movId) throw new ErrorConciliacion(`Línea ${la.linea}: para conciliar indicá movimiento_id.`);
    const mov = libresPorId.get(movId) ?? extra.get(movId);
    if (!mov || mov.cuenta_id !== input.cuenta_id) {
      throw new ErrorConciliacion(`Línea ${la.linea}: el movimiento #${movId} no existe en esta cuenta.`);
    }
    if (mov.extracto_id != null) {
      throw new ErrorConciliacion(`Línea ${la.linea}: el movimiento #${movId} ya está conciliado con el extracto #${mov.extracto_id}.`);
    }
    if (usados.has(movId)) throw new ErrorConciliacion(`El movimiento #${movId} está asignado a más de una línea.`);
    if (eliminados.has(movId)) throw new ErrorConciliacion(`El movimiento #${movId} se concilia y se elimina a la vez.`);
    usados.add(movId);

    if (esProtegido(mov)) {
      const don = donacionDe(mov);
      const bruto = cents(mov.monto + don);
      if (mov.tipo !== la.tipo || (cents(mov.monto) !== cents(la.monto) && !(don > 0 && bruto === cents(la.monto)))) {
        throw new ErrorConciliacion(
          `Línea ${la.linea}: el movimiento #${movId} lo generó ${mov.origen_tipo ?? "una transferencia"} y no se puede cambiar su monto o tipo desde acá. ` +
            "Si el error está ahí, corregilo desde su panel; si no, elegí otro movimiento o creá la línea como nueva."
        );
      }
      if (d?.corregir_fecha) {
        throw new ErrorConciliacion(`Línea ${la.linea}: la fecha del movimiento #${movId} se corrige desde su panel.`);
      }
      if (cents(mov.monto) !== cents(la.monto)) ajusteDonaciones += la.monto - mov.monto;
      conciliar.push({ movimiento_id: movId, referencia: la.referencia, motivo: d?.motivo ?? "Conciliado con extracto" });
    } else {
      const cambios: string[] = [];
      if (cents(mov.monto) !== cents(la.monto)) cambios.push(`monto ${mov.monto} → ${la.monto}`);
      if (mov.tipo !== la.tipo) cambios.push(`tipo ${mov.tipo} → ${la.tipo}`);
      if (d?.corregir_fecha && mov.fecha !== la.fecha) cambios.push(`fecha ${mov.fecha} → ${la.fecha}`);
      if (cambios.length > 0) avisos.push(`Movimiento #${movId} corregido al conciliar: ${cambios.join(", ")}.`);
      conciliar.push({
        movimiento_id: movId,
        monto: la.monto,
        tipo: la.tipo,
        fecha: d?.corregir_fecha ? la.fecha : null,
        referencia: la.referencia,
        motivo: d?.motivo ?? (cambios.length > 0 ? `Conciliado con extracto, corregido: ${cambios.join(", ")}` : "Conciliado con extracto"),
      });
    }

    if (d?.categoria_id || d?.nombre || d?.notas) {
      correcciones.push({
        accion: "editar",
        movimiento_id: movId,
        cambios: {
          ...(d.categoria_id ? { categoria_id: d.categoria_id } : {}),
          ...(d.nombre ? { nombre: d.nombre } : {}),
          ...(d.notas ? { notas: d.notas } : {}),
        },
        motivo: "Clasificado al conciliar",
      });
    }
  }

  if (input.ajuste) {
    const tipo: Tipo = input.ajuste.monto > 0 ? "ingreso" : "egreso";
    const { data: cat } = await db
      .from("categorias_financieras")
      .select("id")
      .eq("slug", `ajuste-conciliacion-${tipo}`)
      .maybeSingle();
    crear.push({
      tipo,
      monto: Math.abs(input.ajuste.monto),
      fecha: analisis.periodo.hasta,
      descripcion: `Ajuste de conciliación — ${input.ajuste.motivo}`,
      nombre: "Ajuste de conciliación",
      notas: input.ajuste.motivo,
      categoria_id: cat?.id ?? null,
      origen_tipo: "ajuste_conciliacion",
    });
    avisos.push(`Se registró un ajuste de conciliación por ${input.ajuste.monto} (visible en reportes).`);
  }

  const payload = {
    cuenta_id: input.cuenta_id,
    origen: "mcp",
    correcciones,
    ajustar_saldo_inicial: input.ajustar_saldo_inicial ?? false,
    motivo_saldo_inicial:
      input.motivo_saldo_inicial ?? `Apertura según extracto ${input.archivo_nombre} (${analisis.periodo.desde})`,
    extracto: {
      archivo_nombre: input.archivo_nombre,
      archivo_hash: analisis.preview_id,
      formato: "mcp",
      fecha_desde: analisis.periodo.desde,
      fecha_hasta: analisis.periodo.hasta,
      saldo_inicial: input.saldo_inicial,
      saldo_final: input.saldo_final,
      total_movimientos: analisis.lineas.length,
      ajuste_donaciones: redondear(ajusteDonaciones),
    },
    conciliar,
    crear,
  };

  const { data, error } = await db.rpc("aplicar_cambios_tesoreria", { p_payload: payload as unknown as Json });
  if (error) throw new ErrorConciliacion(`No se aplicó ningún cambio: ${error.message}`);
  const resultado = data as unknown as {
    extracto_id: number;
    editados: number;
    eliminados: number;
    conciliados: number;
    creados: number;
    saldo_inicial_ajustado_en: number;
  };
  if (resultado.saldo_inicial_ajustado_en) {
    avisos.push(`Saldo inicial de la cuenta ajustado en ${redondear(Number(resultado.saldo_inicial_ajustado_en))}.`);
  }

  const estado = await estadoConciliacion(db, input.cuenta_id);
  const cierre = estado?.extractos.find((e) => e.extracto_id === resultado.extracto_id) ?? null;

  return {
    ...resultado,
    cierra: cierre?.cierra ?? false,
    cierre,
    avisos,
    estado_cuenta: estado ? resumirEstado(estado) : null,
    siguiente:
      cierre && !cierre.cierra
        ? `Quedó una diferencia de ${redondear(cierre.diferencia ?? 0)}. Revisá estado_conciliacion y corregí con editar_movimientos.`
        : "El extracto quedó conciliado.",
  };
}

// =====================
// Editar movimientos (fuera de un extracto)
// =====================

export async function editarMovimientos(db: Db, input: EditarMovimientosInput) {
  const payload = { cuenta_id: input.cuenta_id, origen: "mcp", correcciones: input.correcciones };
  const { data, error } = await db.rpc("aplicar_cambios_tesoreria", { p_payload: payload as unknown as Json });
  if (error) throw new ErrorConciliacion(`No se aplicó ningún cambio: ${error.message}`);
  const estado = await estadoConciliacion(db, input.cuenta_id);
  return { ...(data as Record<string, unknown>), estado_cuenta: estado ? resumirEstado(estado) : null };
}
