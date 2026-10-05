import { createClient } from "@supabase/supabase-js";
import type { Database as DbSocios } from "@/types/socios";
import type { Database as DbPublic } from "@/types/database";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { buscarPersonas, morosidad, nombrePersona, resumenCuotas } from "@/lib/socios/cuotas";

/**
 * Consultas de cuotas de socios para el MCP. Usan el token del usuario: la
 * base aplica sus permisos y los números salen de las mismas funciones que
 * las pantallas de /cuotas.
 */
function clientes(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const opciones = {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  };
  return {
    socios: createClient<DbSocios, "socios">(url, anon, { ...opciones, db: { schema: "socios" } }),
    padron: createClient<DbPublic>(url, anon, opciones),
  };
}

const MEDIOS: Record<string, string> = {
  debito_visa: "Débito Visa",
  transferencia_club: "Transferencia al club",
  transferencia_disciplina: "Pago en la cuenta de la disciplina",
  efectivo: "Efectivo",
  liquidacion_disciplina: "Cuota social a cargo de la disciplina",
};

export async function cobranzaSocios(token: string, conControl: boolean) {
  const { socios } = clientes(token);
  const r = await resumenCuotas(socios, hoyUruguay(), conControl);
  return {
    fecha: r.fecha,
    socios_vigentes: r.socios,
    al_dia: r.alDia,
    fuera_de_tolerancia: r.noAlDia,
    con_deuda: r.conDeuda,
    deuda_total: r.deudaTotal,
    deuda_vencida: r.deudaVencida,
    saldo_a_favor: { total: r.saldoAFavor, personas: r.personasConSaldoAFavor },
    cobrado_en_el_mes: {
      total: r.totalCobradoMes,
      por_medio: r.cobradoMes.map((c) => ({ medio: MEDIOS[c.medio] ?? c.medio, cantidad: c.cantidad, importe: c.importe })),
    },
    ultimo_lote: r.ultimoLote
      ? {
          periodo: r.ultimoLote.periodo.slice(0, 7),
          cuotas: r.ultimoLote.cantidad,
          emitido: r.ultimoLote.importe_total,
          cobrado: r.ultimoLote.cobrado,
          pendiente: r.ultimoLote.pendiente,
        }
      : null,
    ...(r.control
      ? {
          control_contable: r.control,
          nota_control: "Si alguna diferencia no es 0, las cuotas no coinciden con la contabilidad: avisale al tesorero.",
        }
      : {}),
  };
}

export async function deudoresSocios(token: string, limite = 50) {
  const { socios, padron } = clientes(token);
  const filas = await morosidad(socios, padron, hoyUruguay());
  const deudores = filas
    .filter((f) => f.deuda_vencida > 0)
    .sort((a, b) => b.deuda_vencida - a.deuda_vencida);
  return {
    total_con_deuda_vencida: deudores.length,
    fuera_de_tolerancia: deudores.filter((d) => !d.al_dia).length,
    nota: "Al día = cuotas vencidas impagas dentro de la tolerancia configurada (mayor para el débito automático).",
    deudores: deudores.slice(0, limite).map((d) => ({
      persona: d.persona,
      numero_socio: d.numero_socio,
      es_socio: d.es_socio,
      medio: d.medio ? MEDIOS[d.medio] ?? d.medio : null,
      cuotas_vencidas: d.cuotas_vencidas,
      deuda_vencida: d.deuda_vencida,
      deuda_total: d.deuda_total,
      al_dia: d.al_dia,
    })),
  };
}

export async function estadoCuentaSocio(token: string, buscar: string) {
  const { socios, padron } = clientes(token);
  const encontrados = await buscarPersonas(padron, buscar, 8);
  if (encontrados.length === 0) return { mensaje: `No encontré a nadie con "${buscar}".` };
  if (encontrados.length > 1) {
    return {
      mensaje: "Hay varias personas: repetí la consulta con la cédula o el número de socio.",
      candidatos: encontrados.map((p) => ({ persona: nombrePersona(p), numero_socio: p.numero_socio, socio: p.activo })),
    };
  }
  const p = encontrados[0];
  const [{ data: movimientos, error }, { data: situacion }] = await Promise.all([
    socios.rpc("estado_cuenta", { p_persona: p.id }),
    socios.rpc("situacion", {}).eq("persona_id", p.id).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  const lista = movimientos ?? [];
  return {
    persona: nombrePersona(p),
    numero_socio: p.numero_socio,
    socio_vigente: p.activo,
    situacion: situacion
      ? {
          cuotas_vencidas: situacion.cuotas_vencidas,
          deuda_vencida: situacion.deuda_vencida,
          deuda_total: situacion.deuda_total,
          saldo_a_favor: situacion.saldo_a_favor,
          al_dia: situacion.al_dia,
          medio: situacion.medio ? MEDIOS[situacion.medio] ?? situacion.medio : null,
        }
      : null,
    nota: "Saldo positivo = lo que debe la persona; negativo = saldo a favor.",
    movimientos: lista.slice(-60).map((m) => ({
      fecha: m.fecha,
      concepto: m.concepto,
      cargo: m.cargo,
      abono: m.abono,
      saldo: m.saldo,
    })),
    ...(lista.length > 60 ? { aviso: `Se muestran los últimos 60 de ${lista.length} movimientos.` } : {}),
  };
}
