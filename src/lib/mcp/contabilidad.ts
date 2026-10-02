import { createClient } from "@supabase/supabase-js";
import type { Database as DbContabilidad } from "@/types/contabilidad";
import type { Database as DbComercial } from "@/types/comercial";
import type { Database as DbPublic } from "@/types/database";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import {
  COLUMNAS_CUENTA_PLAN,
  ejercicioActual,
  estadoResultados,
  estadoSituacion,
  finDeMes,
  inicioDeMes,
  leerPaginado,
  resolverPeriodo,
  resultadoDelMes,
  totalDisponibilidades,
  type CuentaPlan,
  type EjercicioResumen,
  type FilaSaldo,
  type MovimientoMayor,
  type NodoSaldo,
} from "@/lib/contabilidad/reportes";

/**
 * Consultas contables para el MCP. Usan el token del usuario: la base
 * aplica sus permisos (tesorero, super_admin, comision_fiscal) y los
 * números salen de las mismas funciones que las pantallas de /contabilidad.
 */
function clientes(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const opciones = {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  };
  return {
    conta: createClient<DbContabilidad, "contabilidad">(url, anon, { ...opciones, db: { schema: "contabilidad" } }),
    comercial: createClient<DbComercial, "comercial">(url, anon, { ...opciones, db: { schema: "comercial" } }),
    publico: createClient<DbPublic>(url, anon, opciones),
  };
}

type Conta = ReturnType<typeof clientes>["conta"];

async function base(conta: Conta) {
  const [{ data: ejercicios, error: e1 }, { data: cuentas, error: e2 }, { data: sistema }] = await Promise.all([
    conta.from("ejercicios").select("id, nombre, fecha_inicio, fecha_fin, estado").order("fecha_inicio"),
    conta.from("cuentas").select(COLUMNAS_CUENTA_PLAN).order("codigo"),
    conta.from("cuentas_sistema").select("rol, cuenta_id"),
  ]);
  if (e1 || e2) throw new Error((e1 ?? e2)!.message);
  return {
    ejercicios: (ejercicios ?? []) as EjercicioResumen[],
    cuentas: (cuentas ?? []) as CuentaPlan[],
    cuentaResultadoId: sistema?.find((s) => s.rol === "resultado_ejercicio")?.cuenta_id ?? null,
  };
}

async function saldos(conta: Conta, desde: string, hasta: string): Promise<FilaSaldo[]> {
  const { filas, error } = await leerPaginado<FilaSaldo>((a, b) =>
    conta
      .rpc("saldos", { p_desde: desde, p_hasta: hasta, p_excluir_cierre: true })
      .order("cuenta_id")
      .range(a, b)
  );
  if (error) throw new Error(error);
  return filas;
}

/** Árbol de reporte → lista plana de rubros hasta `nivelMax`, sin ceros. */
function aplanar(nodos: NodoSaldo[], nivelMax: number, campo: "saldoFinal" | "movimiento" = "saldoFinal") {
  const out: { codigo: string; nombre: string; nivel: number; importe: number; moneda_extranjera?: number | null }[] = [];
  const visitar = (n: NodoSaldo) => {
    if (n.nivel > nivelMax) return;
    const importe = n[campo];
    if (importe === 0 && !n.conMovimiento) return;
    out.push({
      codigo: n.codigo,
      nombre: n.nombre,
      nivel: n.nivel,
      importe,
      ...(n.saldoFinalOrigen != null ? { moneda_extranjera: n.saldoFinalOrigen } : {}),
    });
    n.hijos.forEach(visitar);
  };
  nodos.forEach(visitar);
  return out;
}

export async function panoramaContable(token: string) {
  const { conta, comercial, publico } = clientes(token);
  const { ejercicios, cuentas, cuentaResultadoId } = await base(conta);
  const hoy = hoyUruguay();
  const ejercicio = ejercicioActual(ejercicios, hoy);
  if (!ejercicio) {
    return { aviso: "Todavía no hay ejercicios contables creados." };
  }
  const hasta = hoy < ejercicio.fecha_fin ? (hoy < ejercicio.fecha_inicio ? ejercicio.fecha_inicio : hoy) : ejercicio.fecha_fin;
  const filas = await saldos(conta, ejercicio.fecha_inicio, hasta);
  const esp = estadoSituacion(cuentas, filas, { cuentaResultadoId });

  const porCuenta = new Map(filas.map((f) => [f.cuenta_id, f]));
  const disponibilidades = cuentas
    .filter((c) => c.es_disponibilidad && c.imputable)
    .map((c) => {
      const f = porCuenta.get(c.id);
      const pesos = f ? Number(f.debe_anterior ?? 0) + Number(f.debe ?? 0) - Number(f.haber_anterior ?? 0) - Number(f.haber ?? 0) : 0;
      const origen = f && c.moneda ? Number(f.origen_anterior ?? 0) + Number(f.origen_periodo ?? 0) : null;
      return { codigo: c.codigo, nombre: c.nombre, moneda: c.moneda ?? "UYU", saldo_pesos: pesos, saldo_en_moneda: origen };
    })
    .filter((d) => d.saldo_pesos !== 0 || (d.saldo_en_moneda ?? 0) !== 0);

  // Ingresos y egresos por mes del ejercicio hasta hoy
  const meses: ReturnType<typeof resultadoDelMes>[] = [];
  for (let m = inicioDeMes(ejercicio.fecha_inicio); m <= hasta; m = inicioDeMes(addDays(finDeMes(m), 1))) {
    const fin = finDeMes(m) < hasta ? finDeMes(m) : hasta;
    meses.push(resultadoDelMes(m.slice(0, 7), cuentas, await saldos(conta, m, fin)));
  }

  // Proveedores: deuda según documentos y control contra el mayor
  const { data: control } = await comercial.rpc("control_proveedores");
  const deudaProveedores: Record<string, number> = {};
  for (const c of control ?? []) {
    deudaProveedores[c.moneda] = (deudaProveedores[c.moneda] ?? 0) + Number(c.saldo_documentos);
  }

  // Fondos en poder de cada disciplina
  const { data: param } = await conta
    .from("parametros_cuentas")
    .select("cuenta_id")
    .eq("proceso", "tienda")
    .eq("rol", "disciplinas")
    .maybeSingle();
  const porDisciplina = new Map<number, number>();
  if (param) {
    const { filas: lineas } = await leerPaginado<{ disciplina_id: number | null; debe: number; haber: number }>((a, b) =>
      conta
        .from("lineas")
        .select("disciplina_id, debe, haber, asientos!inner(estado, ejercicio_id)")
        .eq("cuenta_id", param.cuenta_id)
        .eq("asientos.estado", "confirmado")
        .eq("asientos.ejercicio_id", ejercicio.id)
        .order("id")
        .range(a, b)
    );
    for (const l of lineas) {
      if (l.disciplina_id == null) continue;
      porDisciplina.set(l.disciplina_id, (porDisciplina.get(l.disciplina_id) ?? 0) + Number(l.debe) - Number(l.haber));
    }
  }
  const { data: disciplinas } = porDisciplina.size
    ? await publico.from("disciplinas").select("id, nombre").in("id", [...porDisciplina.keys()])
    : { data: [] as { id: number; nombre: string }[] };

  const { data: cotizacion } = await conta
    .from("cotizaciones")
    .select("fecha, tasa, fuente")
    .eq("moneda", "USD")
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    ejercicio: { nombre: ejercicio.nombre, desde: ejercicio.fecha_inicio, al: hasta, estado: ejercicio.estado },
    disponibilidades,
    total_disponibilidades_pesos: totalDisponibilidades(cuentas, filas),
    situacion: {
      activo: esp.activo.total,
      pasivo: esp.pasivo.total,
      patrimonio: esp.patrimonio.total,
      superavit_deficit_del_ejercicio: esp.resultadoEjercicio,
      cuadra: esp.cuadra,
    },
    ingresos_y_egresos_por_mes: meses,
    deuda_con_proveedores_segun_documentos: deudaProveedores,
    proveedores_con_diferencia_contra_el_mayor: (control ?? []).filter((c) => Number(c.diferencia) !== 0).length,
    fondos_en_poder_de_disciplinas: [...porDisciplina.entries()].map(([id, saldo]) => ({
      disciplina: disciplinas?.find((d) => d.id === id)?.nombre ?? `Disciplina ${id}`,
      saldo,
    })),
    ultima_cotizacion_usd: cotizacion ?? null,
    nota: "Importes en pesos uruguayos salvo saldo_en_moneda. El superávit (déficit) es ingresos − egresos del ejercicio hasta la fecha, sin asientos de cierre.",
  };
}

export async function estadosContables(token: string, desde?: string, hasta?: string, nivel = 3) {
  const { conta } = clientes(token);
  const { ejercicios, cuentas, cuentaResultadoId } = await base(conta);
  const periodo = resolverPeriodo(ejercicios, { desde, hasta }, hoyUruguay());
  if (!periodo) return { aviso: "Todavía no hay ejercicios contables creados." };

  const [filasEjercicio, filasRango] = await Promise.all([
    saldos(conta, periodo.ejercicio.fecha_inicio, periodo.hasta),
    saldos(conta, periodo.desde, periodo.hasta),
  ]);
  const esp = estadoSituacion(cuentas, filasEjercicio, { cuentaResultadoId });
  const er = estadoResultados(cuentas, filasRango);

  return {
    ejercicio: periodo.ejercicio.nombre,
    estado_de_situacion: {
      al: periodo.hasta,
      activo: { total: esp.activo.total, rubros: esp.activo.secciones.flatMap((s) => aplanar(s.nodos, nivel)) },
      pasivo: { total: esp.pasivo.total, rubros: esp.pasivo.secciones.flatMap((s) => aplanar(s.nodos, nivel)) },
      patrimonio: { total: esp.patrimonio.total, rubros: esp.patrimonio.secciones.flatMap((s) => aplanar(s.nodos, nivel)) },
      superavit_deficit_del_ejercicio: esp.resultadoEjercicio,
      control_activo_igual_pasivo_mas_patrimonio: esp.cuadra,
    },
    estado_de_resultados: {
      desde: periodo.desde,
      hasta: periodo.hasta,
      ingresos: { total: er.totalIngresos, rubros: er.ingresos ? aplanar([er.ingresos], nivel, "movimiento") : [] },
      egresos: { total: er.totalEgresos, rubros: er.egresos ? aplanar([er.egresos], nivel, "movimiento") : [] },
      superavit_deficit: er.resultado,
    },
    nota: "Importes en pesos uruguayos, con el signo de presentación (las regularizadoras restan). Sin asientos de cierre.",
  };
}

const MAX_MOVIMIENTOS = 300;

export async function mayorDeCuenta(token: string, codigo: string, desde?: string, hasta?: string) {
  const { conta } = clientes(token);
  const { ejercicios, cuentas } = await base(conta);
  const cuenta = cuentas.find((c) => c.codigo === codigo);
  if (!cuenta) return { aviso: `No existe la cuenta ${codigo}.` };
  if (!cuenta.imputable) return { aviso: `La cuenta ${codigo} es agrupadora: pedí el mayor de una subcuenta.` };
  const periodo = resolverPeriodo(ejercicios, { desde, hasta }, hoyUruguay());
  if (!periodo) return { aviso: "Todavía no hay ejercicios contables creados." };

  const { filas, error } = await leerPaginado<MovimientoMayor>((a, b) =>
    conta.rpc("libro_mayor", { p_cuenta: cuenta.id, p_desde: periodo.desde, p_hasta: periodo.hasta }).range(a, b)
  );
  if (error) throw new Error(error);
  const ultimos = filas.slice(-MAX_MOVIMIENTOS);
  return {
    cuenta: { codigo: cuenta.codigo, nombre: cuenta.nombre, moneda: cuenta.moneda ?? "UYU" },
    desde: periodo.desde,
    hasta: periodo.hasta,
    movimientos_totales: filas.length,
    ...(filas.length > MAX_MOVIMIENTOS ? { aviso: `Se muestran los últimos ${MAX_MOVIMIENTOS} movimientos.` } : {}),
    saldo_final: filas.length ? filas[filas.length - 1].saldo : null,
    movimientos: ultimos.map((m) => ({
      fecha: m.fecha,
      asiento: m.numero,
      descripcion: m.linea_descripcion ?? m.asiento_descripcion,
      debe: m.debe,
      haber: m.haber,
      saldo: m.saldo,
      ...(cuenta.moneda ? { importe_en_moneda: m.importe_origen, tc: m.tc, saldo_en_moneda: m.saldo_origen } : {}),
    })),
  };
}

function addDays(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + dias));
  return f.toISOString().slice(0, 10);
}
