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
import {
  informeEjecucion,
  nombreRangoMeses,
  porcentajeEjecucion,
  type NodoEjecucion,
} from "@/lib/contabilidad/presupuesto";
import { flujoReal, proyeccionFlujo, type SeccionFlujo } from "@/lib/contabilidad/flujo";
import { listarCuentasConciliables } from "@/lib/contabilidad/conciliacion";
import { verificarCuadre } from "@/lib/contabilidad/parsear-itau";

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

// ------------------------------------------------------------
// Presupuesto, flujo de caja y conciliación
// ------------------------------------------------------------

function nodosPlanos(nodos: NodoEjecucion[], nivelMax: number) {
  const out: { codigo: string; nombre: string; presupuestado: number; ejecutado: number; desvio: number; ejecucion_pct: number | null }[] = [];
  const visitar = (n: NodoEjecucion) => {
    if (n.cuenta.nivel > nivelMax) return;
    if (n.presupuestado === 0 && n.ejecutado === 0) return;
    out.push({
      codigo: n.cuenta.codigo,
      nombre: n.cuenta.nombre,
      presupuestado: n.presupuestado,
      ejecutado: n.ejecutado,
      desvio: n.desvio,
      ejecucion_pct: porcentajeEjecucion(n),
    });
    n.hijos.forEach(visitar);
  };
  nodos.forEach(visitar);
  return out;
}

export async function ejecucionDelPresupuesto(
  token: string,
  anio?: number,
  mesDesde?: number,
  mesHasta?: number,
  nivel = 3
) {
  const { conta } = clientes(token);
  const hoy = hoyUruguay();
  const { ejercicios } = await base(conta);
  const ejercicio = anio
    ? ejercicios.find((e) => e.fecha_inicio.startsWith(String(anio))) ?? null
    : ejercicioActual(ejercicios, hoy);
  if (!ejercicio) return { mensaje: "No hay ejercicio para ese año." };
  const informe = await informeEjecucion(conta, { ejercicio, mesDesde, mesHasta, hoy });
  if (!informe) return { mensaje: `El ejercicio ${ejercicio.nombre} no tiene presupuesto cargado.` };
  const e = informe.ejecucion;
  return {
    ejercicio: ejercicio.nombre,
    presupuesto: {
      nombre: informe.presupuesto.nombre,
      version: informe.presupuesto.version,
      estado: informe.presupuesto.estado,
    },
    meses: nombreRangoMeses(informe.mesDesde, informe.mesHasta),
    nota: "Desvío = ejecutado − presupuestado. En ingresos un desvío positivo es favorable; en egresos, uno negativo.",
    totales: { ingresos: e.totalIngresos, egresos: e.totalEgresos, resultado: e.resultado },
    ingresos: nodosPlanos(e.ingresos, nivel),
    egresos: nodosPlanos(e.egresos, nivel),
  };
}

function seccionPlana(s: SeccionFlujo) {
  return s.grupos.map((g) => ({
    rubro: g.codigo ? `${g.codigo} ${g.nombre}` : g.nombre,
    total: g.total,
    cuentas: g.hijos.filter((h) => h.total !== 0).map((h) => ({ cuenta: h.codigo ? `${h.codigo} ${h.nombre}` : h.nombre, total: h.total })),
  }));
}

export async function flujoDeCaja(token: string, desde?: string, hasta?: string) {
  const { conta } = clientes(token);
  const hoy = hoyUruguay();
  const { ejercicios } = await base(conta);
  const ejercicio = ejercicioActual(ejercicios, hoy);
  if (!ejercicio) return { mensaje: "Todavía no hay ejercicios contables." };
  const d = desde ?? ejercicio.fecha_inicio;
  const h = hasta ?? hoy;
  const estado = await flujoReal(conta, { desde: d, hasta: h });
  return {
    desde: estado.desde,
    hasta: estado.hasta,
    nota: "Método directo: ingresos y egresos de cajas y bancos por contrapartida. Egresos en positivo.",
    saldo_inicial: estado.saldoInicial,
    ingresos: { total: estado.ingresos.total, rubros: seccionPlana(estado.ingresos) },
    egresos: { total: estado.egresos.total, rubros: seccionPlana(estado.egresos) },
    saldo_final: estado.saldoFinal,
    por_mes: estado.meses.map((m, i) => ({
      mes: m.clave,
      ingresos: estado.ingresos.porMes[i],
      egresos: estado.egresos.porMes[i],
      saldo_final: estado.saldoFinalMes[i],
    })),
    control: estado.control,
  };
}

export async function proyeccionDeCaja(token: string, horizonte: "ejercicio" | "12" = "ejercicio") {
  const { conta, comercial } = clientes(token);
  const p = await proyeccionFlujo(conta, comercial, { hoy: hoyUruguay(), horizonte });
  return {
    hoy: p.hoy,
    saldo_actual: p.saldoInicial,
    base: p.presupuestos.length
      ? `Presupuesto aprobado: ${p.presupuestos.map((x) => `${x.nombre} (v${x.version})`).join(", ")}`
      : "Promedio real de los últimos meses (no hay presupuesto aprobado)",
    promedio: p.promedio,
    meses: p.meses.map((m) => ({
      mes: m.clave,
      parcial: m.parcial,
      base: m.fuente,
      ingresos: m.ingresos,
      egresos: m.egresos,
      saldo_final: m.saldoFinal,
      vencimientos_proveedores: m.vencimientos,
    })),
    vencimientos_proveedores: p.vencimientos,
    nota: "Los vencimientos de proveedores son informativos: no se restan del saldo para no duplicar con el presupuesto.",
    saldo_minimo: p.minimo,
    primer_mes_negativo: p.primerNegativo,
  };
}

export async function estadoConciliaciones(token: string) {
  const { conta } = clientes(token);
  const { cuentas, error } = await listarCuentasConciliables(conta);
  if (error) throw new Error(error);
  return cuentas
    .filter((c) => c.activa || c.extractos.length)
    .map((c) => ({
      cuenta: `${c.codigo} ${c.nombre}`,
      moneda: c.moneda ?? "UYU",
      conciliado_hasta: c.conciliadoHasta,
      proximo_extracto_desde: c.proximoDesde,
      ultimo_extracto: c.ultimo
        ? {
            periodo: `${c.ultimo.fechaDesde} a ${c.ultimo.fechaHasta}`,
            estado: c.ultimo.estado,
            saldo_final_banco: c.ultimo.saldoFinal,
            movimientos: c.ultimo.movimientos,
            conciliados: c.ultimo.conciliados,
          }
        : null,
    }));
}

export type ExtractoMcp = {
  cuenta: string;
  desde: string;
  hasta: string;
  saldo_inicial: number;
  saldo_final: number;
  movimientos: { fecha: string; concepto: string; referencia?: string; importe: number; saldo?: number }[];
};

async function cuentaPorCodigo(conta: Conta, codigo: string) {
  const { data, error } = await conta
    .from("cuentas")
    .select("id, codigo, nombre, moneda, es_disponibilidad, imputable")
    .eq("codigo", codigo)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !data.es_disponibilidad || !data.imputable) {
    throw new Error(`La cuenta ${codigo} no es una caja o banco imputable. Usá estado_conciliacion para ver las cuentas.`);
  }
  return data;
}

/** Verifica un extracto transcripto sin guardar nada. */
export async function previsualizarExtracto(token: string, e: ExtractoMcp) {
  const { conta } = clientes(token);
  const cuenta = await cuentaPorCodigo(conta, e.cuenta);
  const { data: ultimo } = await conta
    .from("extractos")
    .select("fecha_hasta, saldo_final")
    .eq("cuenta_id", cuenta.id)
    .order("fecha_hasta", { ascending: false })
    .limit(1)
    .maybeSingle();
  const cuadre = verificarCuadre({
    desde: e.desde,
    hasta: e.hasta,
    saldoInicial: e.saldo_inicial,
    saldoFinal: e.saldo_final,
    movimientos: e.movimientos.map((m) => ({ fecha: m.fecha, concepto: m.concepto, importe: m.importe, saldo: m.saldo ?? null })),
  });
  const problemas = cuadre.problemas.map((p) =>
    p.fila === null ? p.mensaje : `${p.mensaje} (${e.movimientos[p.fila]?.fecha} ${e.movimientos[p.fila]?.concepto})`
  );
  if (ultimo) {
    const [y, mo, d] = ultimo.fecha_hasta.split("-").map(Number);
    const siguiente = new Date(Date.UTC(y, mo - 1, d + 1)).toISOString().slice(0, 10);
    if (e.desde !== siguiente) problemas.push(`Los extractos van seguidos: este tiene que empezar el ${siguiente}.`);
    if (Math.round(e.saldo_inicial * 100) !== Math.round(Number(ultimo.saldo_final) * 100)) {
      problemas.push(`El saldo inicial tiene que ser ${ultimo.saldo_final} (saldo final del extracto anterior).`);
    }
  }
  return {
    cuenta: `${cuenta.codigo} ${cuenta.nombre}`,
    moneda: cuenta.moneda ?? "UYU",
    movimientos: e.movimientos.length,
    entradas: cuadre.entradas,
    salidas: cuadre.salidas,
    saldo_calculado: cuadre.saldoCalculado,
    diferencia_con_saldo_final: cuadre.diferenciaFinal,
    listo_para_importar: problemas.length === 0,
    problemas,
    indicacion:
      problemas.length === 0
        ? "Mostrale el resumen al usuario y, con su OK, llamá a importar_extracto con los mismos datos."
        : "Si no cierra, el error suele estar en la transcripción: releé las filas indicadas antes de pedir cambios al usuario.",
  };
}

/** Importa el extracto (todo o nada); la conciliación se hace en el panel. */
export async function importarExtracto(token: string, e: ExtractoMcp) {
  const { conta } = clientes(token);
  const cuenta = await cuentaPorCodigo(conta, e.cuenta);
  const { data, error } = await conta.rpc("importar_extracto", {
    p_cuenta: cuenta.id,
    p_desde: e.desde,
    p_hasta: e.hasta,
    p_saldo_inicial: e.saldo_inicial,
    p_saldo_final: e.saldo_final,
    p_movimientos: e.movimientos,
    p_archivo: "Cargado desde el asistente",
  });
  if (error) throw new Error(error.message);
  const { data: sugerencias } = await conta.rpc("sugerir_conciliacion", { p_extracto: data as string });
  return {
    extracto_id: data,
    cuenta: `${cuenta.codigo} ${cuenta.nombre}`,
    coincidencias_sugeridas: (sugerencias ?? []).length,
    siguiente_paso: `Conciliar en /contabilidad/conciliacion/${data} (hay ${(sugerencias ?? []).length} coincidencias por importe y fecha para aplicar).`,
  };
}
