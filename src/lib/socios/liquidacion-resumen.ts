/**
 * Resumen de la liquidación mensual a una disciplina: tipos y formato.
 * Sin dependencias de servidor: lo usan las pantallas y el mail.
 */
/**
 * Resumen de una liquidación mensual a una disciplina, como lo devuelve
 * socios.resumen_liquidacion (mismo formato que la planilla de tesorería).
 */
export interface DetalleLiquidacion {
  persona_id: number;
  nombre: string;
  cedula: string;
  numero_socio: number | null;
  planes: string;
  medio: string | null;
  tarjeta: string | null;
  visa_debitado: number;
  visa_rechazado: number;
  motivo_rechazo: string | null;
  visa_disciplina: number;
  visa_social: number;
  otros_medios: number;
  social_a_cargo: number;
}

export interface ResumenLiquidacion {
  id: number;
  disciplina_id: number;
  disciplina: string;
  periodo: string;
  fecha: string;
  estado: string;
  socios: number;
  cuota_social: number;
  visa_cobrado: number;
  visa_social: number;
  otros_cobrado: number;
  gastos_comision: number;
  gastos_iva: number;
  social_a_cargo: number;
  cobrado: number;
  comision: number;
  a_pagar: number;
  a_depositar: number;
  pagado: number;
  saldo: number;
  visa_fecha: string | null;
  notas: string | null;
  detalle: DetalleLiquidacion[];
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
  "noviembre", "diciembre"];

const n = (v: unknown) => Number(v ?? 0);

/** $ 5.669,50 */
export const montoLiquidacion = (v: number) =>
  `$ ${n(v).toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const mesLiquidacion = (periodo: string) => {
  const [a, m] = periodo.split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
};

/** Resultado en palabras: lo que el club le paga o lo que la disciplina deposita. */
export function resultadoLiquidacion(r: Pick<ResumenLiquidacion, "a_pagar" | "a_depositar">) {
  if (n(r.a_pagar) > 0) return { texto: "A pagar a la disciplina", importe: n(r.a_pagar), signo: 1 as const };
  if (n(r.a_depositar) > 0) return { texto: "A depositar al club", importe: n(r.a_depositar), signo: -1 as const };
  return { texto: "Sin saldo", importe: 0, signo: 0 as const };
}

/** Débito agrupado por importe de cuota, como la planilla (tarjetas, rechazos, cobradas). */
export function debitoPorCuota(detalle: DetalleLiquidacion[]) {
  const grupos = new Map<number, { cuota: number; tarjetas: number; rechazos: number; cobradas: number; importe: number }>();
  for (const d of detalle) {
    const cuota = n(d.visa_debitado) || n(d.visa_rechazado);
    if (!cuota) continue;
    const g = grupos.get(cuota) ?? { cuota, tarjetas: 0, rechazos: 0, cobradas: 0, importe: 0 };
    g.tarjetas += 1;
    if (n(d.visa_rechazado) > 0) g.rechazos += 1;
    if (n(d.visa_debitado) > 0) {
      g.cobradas += 1;
      g.importe += n(d.visa_disciplina);
    }
    grupos.set(cuota, g);
  }
  return [...grupos.values()].sort((a, b) => b.cuota - a.cuota);
}

/** Variables de la plantilla "liquidacion_disciplina". */
export function variablesLiquidacion(r: ResumenLiquidacion, nombre: string, panelUrl: string | null) {
  const res = resultadoLiquidacion(r);
  const detalle = r.detalle ?? [];
  const cobrados = detalle
    .filter((d) => n(d.visa_disciplina) + n(d.otros_medios) > 0)
    .map((d) => ({
      nombre: d.nombre,
      medio: n(d.visa_disciplina) > 0
        ? `Débito Visa${d.tarjeta ? ` ****${d.tarjeta}` : ""}${n(d.otros_medios) > 0 ? " y otros medios" : ""}`
        : "Otros medios",
      importe: montoLiquidacion(n(d.visa_disciplina) + n(d.otros_medios)),
    }));
  const rebotes = detalle
    .filter((d) => n(d.visa_rechazado) > 0)
    .map((d) => ({ nombre: d.nombre, motivo: d.motivo_rechazo ?? "Rechazado", importe: montoLiquidacion(d.visa_rechazado) }));
  const sinPagar = detalle
    .filter((d) => n(d.social_a_cargo) > 0)
    .map((d) => ({ nombre: d.nombre, importe: montoLiquidacion(d.social_a_cargo) }));
  return {
    nombre,
    disciplina: r.disciplina,
    periodo: mesLiquidacion(r.periodo),
    socios: r.socios,
    cuota_social: montoLiquidacion(r.cuota_social),
    tarjetas_cobradas: detalle.filter((d) => n(d.visa_debitado) > 0).length,
    visa_cobrado: montoLiquidacion(r.visa_cobrado),
    visa_social: montoLiquidacion(r.visa_social),
    social_a_cargo: montoLiquidacion(r.social_a_cargo),
    social_total: montoLiquidacion(n(r.visa_social) + n(r.social_a_cargo)),
    gastos_comision: montoLiquidacion(r.gastos_comision),
    gastos_iva: montoLiquidacion(r.gastos_iva),
    otros_cobrado: montoLiquidacion(r.otros_cobrado),
    hay_otros: n(r.otros_cobrado) > 0,
    resultado_texto: res.texto,
    resultado: montoLiquidacion(res.importe),
    por_cuota: debitoPorCuota(detalle).map((g) => ({
      cuota: montoLiquidacion(g.cuota),
      tarjetas: g.tarjetas,
      rechazos: g.rechazos,
      cobradas: g.cobradas,
      importe: montoLiquidacion(g.importe),
    })),
    cobrados,
    rebotes,
    hay_rebotes: rebotes.length > 0,
    sin_pagar: sinPagar,
    hay_sin_pagar: sinPagar.length > 0,
    panel_url: panelUrl ?? "",
  };
}


export interface AvisoLiquidaciones {
  enviados: number;
  /** Disciplinas sin nadie en la lista de correos. */
  sinDestinatarios: string[];
}
