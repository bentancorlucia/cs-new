import { z } from "zod";
import type { SociosClient } from "./server";
import type { ResumenLiquidacion } from "./liquidacion-mail";
import type { TipoMovimiento } from "./disciplinas";
import { NOMBRE_TIPO_MOVIMIENTO } from "./disciplinas";

/**
 * Panel de la disciplina (representantes/delegados): tipos de lo que
 * devuelven las funciones `socios.disc_*` (jsonb), lecturas y esquemas de
 * los formularios. Las funciones de la base controlan el permiso: el
 * representante solo ve y cambia su disciplina; el club (super_admin,
 * secretaría, tesorería) también; la Comisión Fiscal solo lee.
 *
 * Este archivo lo usan también los componentes de cliente: las lecturas
 * reciben el cliente ya creado.
 */

// ------------------------------------------------------------
// Tipos
// ------------------------------------------------------------

export interface MiDisciplina {
  disciplina_id: number;
  nombre: string;
  slug: string;
  representante: boolean;
}

export interface RepresentanteDisciplina {
  id: number;
  nombre: string;
  email: string | null;
  cargo: string | null;
  recibe_liquidacion: boolean;
  acceso_panel: boolean;
  con_cuenta: boolean;
}

export interface SaldosDisciplina {
  disciplina_id: number;
  debe_al_club: number;
  club_le_debe: number;
  /** + la disciplina le debe al club, − el club le debe a la disciplina. */
  saldo: number;
  ultimo_movimiento: string | null;
}

export type LiquidacionLista = Omit<ResumenLiquidacion, "detalle">;

export interface ResumenDisciplina {
  disciplina: { id: number; nombre: string; slug: string; activa: boolean };
  socios: number;
  altas_mes: number;
  bajas_mes: number;
  con_debito: number;
  morosos: number;
  deuda_socios: number;
  cuenta: SaldosDisciplina | null;
  ultima_liquidacion: LiquidacionLista | null;
  cambios_pendientes: number;
  representantes: RepresentanteDisciplina[];
}

export interface InscripcionSocio {
  suscripcion_id: number;
  plan_id: number;
  plan: string;
  periodicidad: string;
  desde: string;
  hasta: string | null;
  motivo_fin: string | null;
  vigente: boolean;
}

export type MedioCobroDisc = "debito_visa" | "transferencia_club" | "transferencia_disciplina" | "efectivo";

export interface MedioSocio {
  medio: MedioCobroDisc;
  tarjeta: string | null;
  vencimiento: string | null;
  emisor: string | null;
  titular: string | null;
  titular_documento: string | null;
  disciplina_id: number | null;
  desde: string;
}

export interface SocioDisciplina {
  persona_id: number;
  numero_socio: number | null;
  nombre: string;
  apellido: string;
  cedula: string;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  fecha_nacimiento: string | null;
  vigente: boolean;
  desde: string;
  hasta: string | null;
  /** Socio del club hoy. */
  socio: boolean;
  otras_disciplinas: string[];
  /** Disciplina que cubre su cuota social (se cobra una sola vez: la de su inscripción más antigua). */
  social_cubre: string | null;
  social_anual: boolean;
  inscripciones: InscripcionSocio[];
  /** Lo que se le cobra por mes: cuota social + planes. */
  cuota_mensual: number;
  medio: MedioSocio | null;
  tarjeta_vencida: boolean;
  cuotas_vencidas: number;
  deuda_vencida: number;
  deuda_total: number;
  al_dia: boolean;
  deuda_disciplina: number;
  vencido_disciplina: number;
  /** Cambios que tesorería todavía no cargó en el débito. */
  cambios_pendientes: number;
}

export interface PrecioPlanDisc {
  vigente_desde: string;
  importe_mensual: number;
  importe_anual: number | null;
}

export interface PlanDisciplina {
  plan_id: number;
  nombre: string;
  activo: boolean;
  permite_anual: boolean;
  precio_vigente: number | null;
  precios: PrecioPlanDisc[];
  inscriptos: number;
  con_debito: number;
}

export interface PlanesDisciplina {
  cuota_social: number;
  planes: PlanDisciplina[];
}

export interface MovimientoDisc {
  clave: string;
  fecha: string;
  asiento_id: string;
  numero: number | null;
  tipo: TipoMovimiento;
  descripcion: string;
  cuenta: "disciplina_debe" | "club_debe";
  debe: number;
  haber: number;
  saldo: number;
  origen_tipo: string | null;
  origen_id: string | null;
  pedido_id: number | null;
}

export interface CuotaPlanPagoDisc {
  id: number;
  plan_id: number;
  numero: number;
  vencimiento: string;
  importe: number;
  pagado: number;
  saldo: number;
  situacion: string;
}

export interface PlanPagoDisc {
  id: number;
  descripcion: string;
  importe_total: number;
  estado: string;
  situacion: string;
  pagado: number;
  saldo: number;
  saldo_vencido: number;
  cuotas_total: number;
  cuotas_pagadas: number;
  cuotas_vencidas: number;
  proximo_vencimiento: string | null;
  created_at: string | null;
  notas: string | null;
  cuotas: CuotaPlanPagoDisc[];
}

export interface LiquidacionPendiente {
  id: number;
  periodo: string;
  importe: number;
  saldo: number;
}

export interface CuentaDisciplina {
  saldos: SaldosDisciplina | null;
  movimientos: MovimientoDisc[];
  planes_pago: PlanPagoDisc[];
  liquidaciones_pendientes: LiquidacionPendiente[];
}

export const TIPOS_CAMBIO = [
  "alta",
  "reingreso",
  "baja_club",
  "baja_anulada",
  "inscripcion",
  "fin_inscripcion",
  "medio_cobro",
  "tarjeta",
  "datos",
  "plan_nuevo",
  "precio",
  "cobro",
  "representante",
] as const;
export type TipoCambio = (typeof TIPOS_CAMBIO)[number];

export type EstadoDebito = "no_aplica" | "pendiente" | "aplicado" | "descartado";

export interface CambioDisciplina {
  id: number;
  disciplina_id: number | null;
  persona_id: number | null;
  tipo: TipoCambio;
  descripcion: string;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  vigencia: string | null;
  afecta_debito: boolean;
  estado_debito: EstadoDebito;
  aplicado_at: string | null;
  notas_aplicacion: string | null;
  tarjeta_pendiente: boolean;
  hecho_por_nombre: string | null;
  origen: "representante" | "club";
  created_at: string;
}

export const PESTANAS_PANEL = ["resumen", "socios", "planes", "liquidaciones", "morosos", "cuenta", "cambios"] as const;
export type PestanaPanel = (typeof PESTANAS_PANEL)[number];

export interface DatosPanel {
  resumen: ResumenDisciplina;
  socios: SocioDisciplina[];
  planes: PlanesDisciplina;
  liquidaciones: LiquidacionLista[];
  cuenta: CuentaDisciplina | null;
  cambios: CambioDisciplina[];
  /** Errores de las lecturas que no son el resumen (la página igual se muestra). */
  errores: Partial<Record<"socios" | "planes" | "liquidaciones" | "cuenta" | "cambios", string>>;
}

// ------------------------------------------------------------
// Textos
// ------------------------------------------------------------

export const NOMBRE_TIPO_CAMBIO: Record<TipoCambio, string> = {
  alta: "Alta en el club",
  reingreso: "Reingreso",
  baja_club: "Baja del club",
  baja_anulada: "Baja anulada",
  inscripcion: "Alta en la disciplina",
  fin_inscripcion: "Baja de la disciplina",
  medio_cobro: "Medio de cobro",
  tarjeta: "Tarjeta",
  datos: "Datos de contacto",
  plan_nuevo: "Plan nuevo",
  precio: "Precio",
  cobro: "Cobro",
  representante: "Representante",
};

export const NOMBRE_MEDIO_DISC: Record<MedioCobroDisc, string> = {
  debito_visa: "Débito Visa",
  transferencia_club: "Transferencia al club",
  transferencia_disciplina: "Cuenta de la disciplina",
  efectivo: "Efectivo",
};

export const EMISORES_TARJETA = ["ITAU", "BROU", "SCOTIA", "SANTANDER", "BBVA", "HSBC", "OCA", "HERITAGE", "BANDES", "OTRO"] as const;

const n = (v: unknown) => Number(v ?? 0);

/** "Pérez, Juan" */
export const nombreSocio = (s: Pick<SocioDisciplina, "nombre" | "apellido">) =>
  [s.apellido, s.nombre].filter(Boolean).join(", ");

/** "AAAA-MM-01" → "02/29". */
export function vencimientoCorto(iso: string | null | undefined): string {
  if (!iso) return "";
  return `${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
}

/** "Visa ****1234 · ITAU · vence 02/29" o el nombre del medio. */
export function textoMedio(m: MedioSocio | null | undefined): string {
  if (!m) return "Sin medio de cobro";
  if (m.medio !== "debito_visa") return NOMBRE_MEDIO_DISC[m.medio] ?? m.medio;
  return [
    `Visa ${m.tarjeta ? `****${m.tarjeta}` : ""}`.trim(),
    m.emisor,
    m.vencimiento ? `vence ${vencimientoCorto(m.vencimiento)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Los planes vigentes del socio en la disciplina. */
export const planesVigentes = (s: SocioDisciplina) => s.inscripciones.filter((i) => i.vigente);

/** Número de tarjeta: dígito verificador (Luhn), 13 a 19 dígitos. */
export function luhnValido(numero: string): boolean {
  const v = numero.replace(/\D/g, "");
  if (v.length < 13 || v.length > 19) return false;
  let suma = 0;
  for (let i = 0; i < v.length; i++) {
    let d = Number(v[v.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
  }
  return suma % 10 === 0;
}

/** "4111111111111111" → "4111 1111 1111 1111" (hasta 19 dígitos). */
export function mascaraTarjeta(v: string): string {
  return v
    .replace(/\D/g, "")
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** "0229" → "02/29" mientras se escribe. */
export function mascaraVencimientoCorto(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`;
}

/** "MM/AA" o "MM/AAAA" → "AAAA-MM-01". */
export function vencimientoAIso(v: string): string | null {
  const m = v.trim().match(/^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/);
  if (!m) return null;
  const mes = Number(m[1]);
  const anio = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  if (mes < 1 || mes > 12 || anio < 2000 || anio > 2100) return null;
  return `${anio}-${String(mes).padStart(2, "0")}-01`;
}

// ------------------------------------------------------------
// Esquemas (formularios y Server Actions)
// ------------------------------------------------------------

const esFecha = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
const fecha = z.string().refine(esFecha, "Fecha inválida");
const id = z.number().int().positive();
const textoOpc = (max: number) =>
  z
    .string()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null));

export const medioDiscSchema = z
  .object({
    medio: z.enum(["debito_visa", "transferencia_club", "transferencia_disciplina", "efectivo"], { message: "Elegí el medio de cobro" }),
    disciplina_id: id.nullish(),
    /** Número completo (tarjeta nueva). Vacío: se mantiene la tarjeta actual (tarjeta_ultimos4). */
    tarjeta_numero: z.string().nullish(),
    tarjeta_ultimos4: z.string().nullish(),
    /** "MM/AA" */
    tarjeta_vencimiento: z.string().nullish(),
    tarjeta_emisor: textoOpc(20),
    titular_nombre: textoOpc(120),
    titular_documento: textoOpc(20),
  })
  .superRefine((m, ctx) => {
    if (m.medio !== "debito_visa") return;
    const numero = (m.tarjeta_numero ?? "").replace(/\D/g, "");
    if (numero) {
      if (!luhnValido(numero)) ctx.addIssue({ code: "custom", path: ["tarjeta_numero"], message: "El número de tarjeta no es válido: revisalo" });
    } else if (!/^\d{4}$/.test(m.tarjeta_ultimos4 ?? "")) {
      ctx.addIssue({ code: "custom", path: ["tarjeta_numero"], message: "Ingresá el número de la tarjeta" });
    }
    const venc = vencimientoAIso(m.tarjeta_vencimiento ?? "");
    if (!venc) ctx.addIssue({ code: "custom", path: ["tarjeta_vencimiento"], message: "Vencimiento como MM/AA" });
    if (!m.tarjeta_emisor) ctx.addIssue({ code: "custom", path: ["tarjeta_emisor"], message: "Elegí el emisor" });
  })
  .transform((m) => {
    const visa = m.medio === "debito_visa";
    const numero = (m.tarjeta_numero ?? "").replace(/\D/g, "");
    return {
      medio: m.medio,
      disciplina_id: m.medio === "transferencia_disciplina" ? (m.disciplina_id ?? null) : null,
      ...(visa
        ? {
            ...(numero ? { tarjeta_numero: numero } : { tarjeta_ultimos4: m.tarjeta_ultimos4 }),
            tarjeta_vencimiento: vencimientoAIso(m.tarjeta_vencimiento ?? ""),
            tarjeta_emisor: m.tarjeta_emisor?.toUpperCase() ?? null,
            titular_nombre: m.titular_nombre,
            titular_documento: m.titular_documento ? m.titular_documento.replace(/\D/g, "") || m.titular_documento : null,
          }
        : {}),
    };
  });
export type MedioDiscInput = z.input<typeof medioDiscSchema>;

export const personaDiscSchema = z.object({
  cedula: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 6 && v.length <= 9, "Cédula inválida"),
  nombre: z.string().trim().min(1, "Falta el nombre").max(100),
  apellido: z.string().trim().min(1, "Falta el apellido").max(100),
  email: z
    .string()
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim().toLowerCase() : null))
    .refine((v) => v === null || z.email().safeParse(v).success, "Email inválido"),
  telefono: textoOpc(30),
  fecha_nacimiento: z
    .string()
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || esFecha(v), "Fecha inválida"),
  direccion: textoOpc(200),
});

export const altaDiscSchema = z.object({
  disciplina: id,
  persona: personaDiscSchema,
  desde: fecha,
  plan: id.or(z.literal(0)).refine((v) => v > 0, "Elegí el plan"),
  medio: medioDiscSchema.nullable(),
});
export type AltaDiscInput = z.input<typeof altaDiscSchema>;

export const bajaDiscSchema = z.object({
  disciplina: id,
  persona: id,
  hasta: fecha,
  baja_club: z.boolean(),
  motivo: textoOpc(300),
});

export const cambiarPlanDiscSchema = z.object({
  disciplina: id,
  suscripcion: id,
  plan: z.number().int().refine((v) => v > 0, "Elegí el plan nuevo"),
  desde: fecha,
});

export const cambiarMedioDiscSchema = z.object({
  disciplina: id,
  persona: id,
  desde: fecha,
  medio: medioDiscSchema,
});

export const datosDiscSchema = z.object({
  disciplina: id,
  persona: id,
  datos: personaDiscSchema.pick({ email: true, telefono: true, direccion: true, fecha_nacimiento: true }),
});

export const crearPlanDiscSchema = z.object({
  disciplina: id,
  nombre: z.string().trim().min(2, "Poné un nombre al plan").max(120),
  importe: z.number({ message: "Importe inválido" }).positive("La cuota tiene que ser mayor que cero"),
  desde: fecha,
});

export const nuevoPrecioDiscSchema = z.object({
  disciplina: id,
  plan: id,
  importe: z.number({ message: "Importe inválido" }).positive("La cuota tiene que ser mayor que cero"),
  desde: fecha,
});

export const cobroDiscSchema = z.object({
  disciplina: id,
  persona: id,
  fecha,
  importe: z.number({ message: "Importe inválido" }).positive("El importe tiene que ser mayor que cero"),
  referencia: textoOpc(200),
});

// ------------------------------------------------------------
// Lecturas
// ------------------------------------------------------------

type Rpc = { data: unknown; error: { message: string; code?: string } | null };

function exigir<T>(r: Rpc): T {
  if (r.error) throw new Error(r.error.code === "42501" ? "No tenés permiso para ver esta disciplina" : r.error.message);
  return r.data as T;
}

const normLiq = (l: LiquidacionLista): LiquidacionLista => ({
  ...l,
  a_pagar: n(l.a_pagar),
  a_depositar: n(l.a_depositar),
  pagado: n(l.pagado),
  saldo: n(l.saldo),
  cobrado: n(l.cobrado),
  socios: n(l.socios),
});

const normSaldos = (s: SaldosDisciplina | null): SaldosDisciplina | null =>
  s ? { ...s, debe_al_club: n(s.debe_al_club), club_le_debe: n(s.club_le_debe), saldo: n(s.saldo) } : null;

export async function misDisciplinas(db: SociosClient): Promise<MiDisciplina[]> {
  return exigir<MiDisciplina[]>(await db.rpc("mis_disciplinas")) ?? [];
}

export async function leerResumen(db: SociosClient, disciplina: number): Promise<ResumenDisciplina> {
  const r = exigir<ResumenDisciplina>(await db.rpc("disc_resumen", { p_disciplina: disciplina }));
  return {
    ...r,
    socios: n(r.socios),
    altas_mes: n(r.altas_mes),
    bajas_mes: n(r.bajas_mes),
    con_debito: n(r.con_debito),
    morosos: n(r.morosos),
    deuda_socios: n(r.deuda_socios),
    cambios_pendientes: n(r.cambios_pendientes),
    cuenta: normSaldos(r.cuenta),
    ultima_liquidacion: r.ultima_liquidacion ? normLiq(r.ultima_liquidacion) : null,
    representantes: r.representantes ?? [],
  };
}

export async function leerSocios(db: SociosClient, disciplina: number, historico = true): Promise<SocioDisciplina[]> {
  const filas = exigir<SocioDisciplina[]>(await db.rpc("disc_socios", { p_disciplina: disciplina, p_historico: historico })) ?? [];
  return filas.map((s) => ({
    ...s,
    otras_disciplinas: s.otras_disciplinas ?? [],
    social_cubre: s.social_cubre ?? null,
    social_anual: !!s.social_anual,
    inscripciones: s.inscripciones ?? [],
    cuota_mensual: n(s.cuota_mensual),
    cuotas_vencidas: n(s.cuotas_vencidas),
    deuda_vencida: n(s.deuda_vencida),
    deuda_total: n(s.deuda_total),
    deuda_disciplina: n(s.deuda_disciplina),
    vencido_disciplina: n(s.vencido_disciplina),
    cambios_pendientes: n(s.cambios_pendientes),
  }));
}

export async function leerPlanes(db: SociosClient, disciplina: number): Promise<PlanesDisciplina> {
  const r = exigir<PlanesDisciplina>(await db.rpc("disc_planes", { p_disciplina: disciplina }));
  return {
    cuota_social: n(r?.cuota_social),
    planes: (r?.planes ?? []).map((p) => ({
      ...p,
      precio_vigente: p.precio_vigente == null ? null : n(p.precio_vigente),
      precios: (p.precios ?? []).map((x) => ({ ...x, importe_mensual: n(x.importe_mensual) })),
      inscriptos: n(p.inscriptos),
      con_debito: n(p.con_debito),
    })),
  };
}

export async function leerLiquidaciones(db: SociosClient, disciplina: number): Promise<LiquidacionLista[]> {
  return (exigir<LiquidacionLista[]>(await db.rpc("disc_liquidaciones", { p_disciplina: disciplina })) ?? []).map(normLiq);
}

export async function leerLiquidacion(db: SociosClient, liquidacion: number): Promise<ResumenLiquidacion | null> {
  return exigir<ResumenLiquidacion | null>(await db.rpc("resumen_liquidacion", { p_liquidacion: liquidacion }));
}

interface CuentaCruda {
  saldos: SaldosDisciplina | null;
  movimientos: Omit<MovimientoDisc, "clave">[] | null;
  planes_pago: (Record<string, unknown> & { cuotas: CuotaPlanPagoDisc[] | null })[] | null;
  liquidaciones_pendientes: LiquidacionPendiente[] | null;
}

export async function leerCuenta(db: SociosClient, disciplina: number): Promise<CuentaDisciplina> {
  const r = exigir<CuentaCruda>(await db.rpc("disc_cuenta", { p_disciplina: disciplina }));
  return {
    saldos: normSaldos(r?.saldos ?? null),
    movimientos: (r?.movimientos ?? []).map((m, i) => ({
      clave: `${m.asiento_id}-${i}`,
      fecha: m.fecha,
      asiento_id: m.asiento_id,
      numero: m.numero ?? null,
      tipo: (m.tipo in NOMBRE_TIPO_MOVIMIENTO ? m.tipo : "otro") as TipoMovimiento,
      descripcion: m.descripcion ?? "",
      cuenta: m.cuenta === "club_debe" ? "club_debe" : "disciplina_debe",
      debe: n(m.debe),
      haber: n(m.haber),
      saldo: n(m.saldo),
      origen_tipo: m.origen_tipo ?? null,
      origen_id: m.origen_id ?? null,
      pedido_id: m.pedido_id ?? null,
    })),
    planes_pago: (r?.planes_pago ?? []).map((p) => ({
      id: n(p.id),
      descripcion: String(p.descripcion ?? ""),
      importe_total: n(p.importe_total),
      estado: String(p.estado ?? "vigente"),
      situacion: String(p.situacion ?? "al_dia"),
      pagado: n(p.pagado),
      saldo: n(p.saldo),
      saldo_vencido: n(p.saldo_vencido),
      cuotas_total: n(p.cuotas),
      cuotas_pagadas: n(p.cuotas_pagadas),
      cuotas_vencidas: n(p.cuotas_vencidas),
      proximo_vencimiento: (p.proximo_vencimiento as string | null) ?? null,
      created_at: (p.created_at as string | null) ?? null,
      notas: (p.notas as string | null) ?? null,
      cuotas: (p.cuotas ?? []).map((c) => ({
        ...c,
        numero: n(c.numero),
        importe: n(c.importe),
        pagado: n(c.pagado),
        saldo: n(c.saldo),
        situacion: c.situacion ?? "pendiente",
      })),
    })),
    liquidaciones_pendientes: (r?.liquidaciones_pendientes ?? []).map((l) => ({ ...l, importe: n(l.importe), saldo: n(l.saldo) })),
  };
}

export async function leerCambios(db: SociosClient, disciplina: number, limite = 500): Promise<CambioDisciplina[]> {
  return exigir<CambioDisciplina[]>(await db.rpc("disc_cambios", { p_disciplina: disciplina, p_limite: limite })) ?? [];
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : "Error inesperado");

/**
 * Todo el panel en paralelo. El resumen es obligatorio (si falla, falla la
 * página: típicamente falta de permiso); el resto se muestra con su error.
 */
export async function leerPanel(db: SociosClient, disciplina: number): Promise<DatosPanel> {
  const [resumen, socios, planes, liquidaciones, cuenta, cambios] = await Promise.allSettled([
    leerResumen(db, disciplina),
    leerSocios(db, disciplina, true),
    leerPlanes(db, disciplina),
    leerLiquidaciones(db, disciplina),
    leerCuenta(db, disciplina),
    leerCambios(db, disciplina),
  ]);
  if (resumen.status === "rejected") throw resumen.reason;
  const errores: DatosPanel["errores"] = {};
  if (socios.status === "rejected") errores.socios = mensaje(socios.reason);
  if (planes.status === "rejected") errores.planes = mensaje(planes.reason);
  if (liquidaciones.status === "rejected") errores.liquidaciones = mensaje(liquidaciones.reason);
  if (cuenta.status === "rejected") errores.cuenta = mensaje(cuenta.reason);
  if (cambios.status === "rejected") errores.cambios = mensaje(cambios.reason);
  return {
    resumen: resumen.value,
    socios: socios.status === "fulfilled" ? socios.value : [],
    planes: planes.status === "fulfilled" ? planes.value : { cuota_social: 0, planes: [] },
    liquidaciones: liquidaciones.status === "fulfilled" ? liquidaciones.value : [],
    cuenta: cuenta.status === "fulfilled" ? cuenta.value : null,
    cambios: cambios.status === "fulfilled" ? cambios.value : [],
    errores,
  };
}
