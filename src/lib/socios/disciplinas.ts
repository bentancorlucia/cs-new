import type { Database as DbPublico } from "@/types/database";
import { leerTodo, r2, type ClientePadron, type ClienteSocios } from "./cuotas";

/**
 * Lecturas de Disciplinas (secretaría y tesorería): ficha, socios, cuenta
 * corriente con el club, pagos de la disciplina, planes de pago y
 * liquidaciones. Reciben los clientes ya creados y no validan roles: la base
 * aplica RLS y las funciones de cuenta corriente exigen tesorería o Comisión
 * Fiscal (ver supabase/migrations/20261007100000_disciplinas_cuenta_planes.sql).
 *
 * Los pedidos (`public.pedidos`) solo los ve la tienda por RLS: quien llama
 * pasa el cliente de servicio después de validar el permiso.
 *
 * Las utilidades de abajo (generarCuotas, sumarMesesDia, etiquetas) no tocan
 * la base y se usan también desde los componentes de cliente.
 */

const num = (v: unknown) => Number(v ?? 0);

function exigir<T>(r: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (r.error) throw new Error(r.error.code === "42501" ? "No tenés permiso para ver estos datos" : r.error.message);
  return r.data as T;
}

/** Lee en tandas por ids (la URL tiene límite). */
async function porIds<T>(ids: Iterable<number>, pedir: (lote: number[]) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>, tam = 200): Promise<T[]> {
  const unicos = [...new Set(ids)].filter((n) => Number.isFinite(n));
  const out: T[] = [];
  for (let i = 0; i < unicos.length; i += tam) {
    out.push(...exigir(await pedir(unicos.slice(i, i + tam))));
  }
  return out;
}

// ------------------------------------------------------------
// Utilidades (también para el cliente)
// ------------------------------------------------------------

/** Suma meses a una fecha conservando el día (31 → último día del mes si no existe). */
export function sumarMesesDia(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

export interface CuotaBorrador {
  vencimiento: string;
  importe: number;
}

/**
 * Reparte un importe en `cantidad` cuotas iguales, cada `cadaMeses` meses
 * desde el primer vencimiento. La última absorbe el redondeo.
 */
export function generarCuotas(importe: number, cantidad: number, primerVencimiento: string, cadaMeses = 1): CuotaBorrador[] {
  const n = Math.max(1, Math.min(60, Math.floor(cantidad)));
  const centavos = Math.round(importe * 100);
  if (!(centavos > 0) || !primerVencimiento) return [];
  const base = Math.floor(centavos / n);
  return Array.from({ length: n }, (_, i) => ({
    vencimiento: sumarMesesDia(primerVencimiento, i * cadaMeses),
    importe: (i === n - 1 ? centavos - base * (n - 1) : base) / 100,
  }));
}

export type TipoMovimiento =
  | "saldo_inicial"
  | "compra_tienda"
  | "devolucion_tienda"
  | "cuota_cobrada"
  | "liquidacion"
  | "pago"
  | "anulacion"
  | "otro";

export const NOMBRE_TIPO_MOVIMIENTO: Record<TipoMovimiento, string> = {
  saldo_inicial: "Saldo inicial",
  compra_tienda: "Compra en la tienda",
  devolucion_tienda: "Devolución",
  cuota_cobrada: "Cuota cobrada",
  liquidacion: "Liquidación",
  pago: "Pago al club",
  anulacion: "Anulación",
  otro: "Otro",
};

export const AYUDA_TIPO_MOVIMIENTO: Record<TipoMovimiento, string> = {
  saldo_inicial: "Saldo con el que arrancó la cuenta.",
  compra_tienda: "Pedido de la tienda a cuenta corriente: aumenta la deuda.",
  devolucion_tienda: "Devolución o cancelación de un pedido: baja la deuda.",
  cuota_cobrada: "Un socio pagó su cuota en la cuenta de la disciplina: el dinero es del club, aumenta la deuda.",
  liquidacion: "Compensación de la deuda en una liquidación de cuotas.",
  pago: "La disciplina le pagó al club.",
  anulacion: "Contra-asiento de un movimiento anulado.",
  otro: "Asiento manual u otro origen.",
};

export const NOMBRE_SITUACION_PLAN: Record<string, string> = {
  al_dia: "Al día",
  atrasado: "Atrasado",
  cumplido: "Cumplido",
  cancelado: "Cancelado",
};

export const NOMBRE_SITUACION_CUOTA: Record<string, string> = {
  pagada: "Pagada",
  vencida: "Vencida",
  parcial: "Pago parcial",
  pendiente: "Pendiente",
};

export const NOMBRE_ESTADO_PEDIDO: Record<string, string> = {
  pendiente: "Pendiente",
  pendiente_verificacion: "A verificar",
  pagado: "A cuenta corriente",
  preparando: "Preparando",
  listo_retiro: "Listo para retirar",
  retirado: "Retirado",
  cancelado: "Cancelado",
};

// ------------------------------------------------------------
// Ficha y lista
// ------------------------------------------------------------

export type FichaDisciplina = DbPublico["public"]["Tables"]["disciplinas"]["Row"];

export interface DisciplinaLista {
  id: number;
  nombre: string;
  slug: string;
  descripcion: string | null;
  imagen_url: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_email: string | null;
  activa: boolean;
  /** Personas con una inscripción vigente hoy en algún plan de la disciplina. */
  socios: number;
  planesVigentes: number;
  /** Saldo vencido de los planes vigentes. */
  saldoVencidoPlanes: number;
  /** Deuda con el club (+ debe la disciplina). null si quien mira no es tesorería. */
  saldo: number | null;
  ultimoMovimiento: string | null;
}

const vigenteEn = (desde: string, hasta: string | null, dia: string) => desde <= dia && (hasta === null || hasta >= dia);

export async function leerFichaDisciplina(padron: ClientePadron, id: number): Promise<FichaDisciplina | null> {
  const { data, error } = await padron.from("disciplinas").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listarDisciplinasGestion(
  padron: ClientePadron,
  so: ClienteSocios,
  hoy: string,
  conSaldos: boolean
): Promise<DisciplinaLista[]> {
  const [disciplinas, planes, suscripciones, planesPago, saldos] = await Promise.all([
    padron.from("disciplinas").select("*").order("nombre").then(exigir),
    so.from("planes").select("id, disciplina_id").not("disciplina_id", "is", null).then(exigir),
    leerTodo((a, b) =>
      so.from("suscripciones").select("persona_id, plan_id, desde, hasta").lte("desde", hoy).or(`hasta.is.null,hasta.gte.${hoy}`).order("id").range(a, b)
    ),
    leerPlanesPago(so, hoy, { soloVigentes: true }),
    conSaldos ? so.rpc("saldos_disciplinas").then(exigir) : Promise.resolve(null),
  ]);
  const discDePlan = new Map(planes.map((p) => [p.id, p.disciplina_id as number]));
  const personas = new Map<number, Set<number>>();
  for (const s of suscripciones) {
    const d = discDePlan.get(s.plan_id);
    if (d == null || !vigenteEn(s.desde, s.hasta, hoy)) continue;
    const set = personas.get(d) ?? new Set<number>();
    set.add(s.persona_id);
    personas.set(d, set);
  }
  const planesPor = new Map<number, { n: number; vencido: number }>();
  for (const p of planesPago) {
    if (p.disciplina_id == null) continue;
    const a = planesPor.get(p.disciplina_id) ?? { n: 0, vencido: 0 };
    planesPor.set(p.disciplina_id, { n: a.n + 1, vencido: r2(a.vencido + num(p.saldo_vencido)) });
  }
  const saldoPor = new Map((saldos ?? []).map((s) => [s.disciplina_id, s]));
  return disciplinas.map((d) => ({
    id: d.id,
    nombre: d.nombre,
    slug: d.slug,
    descripcion: d.descripcion,
    imagen_url: d.imagen_url,
    contacto_nombre: d.contacto_nombre,
    contacto_telefono: d.contacto_telefono,
    contacto_email: d.contacto_email,
    activa: d.activa ?? true,
    socios: personas.get(d.id)?.size ?? 0,
    planesVigentes: planesPor.get(d.id)?.n ?? 0,
    saldoVencidoPlanes: planesPor.get(d.id)?.vencido ?? 0,
    saldo: conSaldos ? r2(num(saldoPor.get(d.id)?.saldo)) : null,
    ultimoMovimiento: saldoPor.get(d.id)?.ultimo_movimiento ?? null,
  }));
}

// ------------------------------------------------------------
// Cuenta corriente
// ------------------------------------------------------------

export interface MovimientoCuenta {
  /** Clave estable para la lista (la función no devuelve el id de la línea). */
  clave: string;
  fecha: string;
  asiento_id: string;
  numero: number | null;
  tipo: TipoMovimiento;
  descripcion: string;
  debe: number;
  haber: number;
  saldo: number;
  origen_tipo: string | null;
  origen_id: string | null;
  pedido_id: number | null;
}

export async function cuentaCorrienteDisciplina(so: ClienteSocios, disciplina: number): Promise<MovimientoCuenta[]> {
  const filas = exigir(await so.rpc("cuenta_corriente_disciplina", { p_disciplina: disciplina }));
  return filas.map((f, i) => ({
    clave: `${f.asiento_id}-${i}`,
    fecha: f.fecha,
    asiento_id: f.asiento_id,
    numero: f.numero ?? null,
    tipo: (f.tipo in NOMBRE_TIPO_MOVIMIENTO ? f.tipo : "otro") as TipoMovimiento,
    descripcion: f.descripcion ?? "",
    debe: num(f.debe),
    haber: num(f.haber),
    saldo: num(f.saldo),
    origen_tipo: f.origen_tipo ?? null,
    origen_id: f.origen_id ?? null,
    pedido_id: f.pedido_id ?? null,
  }));
}

// ------------------------------------------------------------
// Pagos de la disciplina al club
// ------------------------------------------------------------

export interface ImputacionPlan {
  id: number;
  plan_id: number;
  plan: string;
  cuota: number;
  fecha: string;
  importe: number;
  anulada: boolean;
}

export interface PagoDisciplina {
  id: number;
  fecha: string;
  importe: number;
  cuenta_id: string;
  referencia: string | null;
  notas: string | null;
  estado: string;
  motivo_anulacion: string | null;
  asiento_id: string;
  imputaciones: ImputacionPlan[];
}

export interface ImputacionCuota {
  id: number;
  fecha: string;
  importe: number;
  anulada: boolean;
  cobro_id: number | null;
  liquidacion_id: number | null;
}

export interface CuotaPlan {
  id: number;
  numero: number;
  vencimiento: string;
  importe: number;
  pagado: number;
  saldo: number;
  situacion: string;
  imputaciones: ImputacionCuota[];
}

export interface PedidoDePlan {
  pedido_id: number;
  importe: number;
}

export interface PlanPago {
  id: number;
  disciplina_id: number;
  descripcion: string;
  importe_total: number;
  notas: string | null;
  estado: string;
  motivo_cancelacion: string | null;
  cancelado_at: string | null;
  created_at: string;
  pagado: number;
  saldo: number;
  cuotas: number;
  cuotas_pagadas: number;
  cuotas_vencidas: number;
  saldo_vencido: number;
  proximo_vencimiento: string | null;
  situacion: string;
  pedidos: PedidoDePlan[];
  detalle: CuotaPlan[];
}

/**
 * Planes con cuotas, pedidos e imputaciones, y los saldos calculados.
 *
 * Replica las vistas `socios.plan_pago_cuotas_saldo` y
 * `socios.planes_pago_resumen` en vez de leerlas: las vistas son
 * security_invoker y llaman a `contabilidad._hoy()`, que solo puede ejecutar
 * postgres, así que con cuotas cargadas fallan con 42501 para cualquier
 * usuario (y para service_role). Misma regla: pagada si no tiene saldo,
 * vencida si venció antes de hoy, parcial si tiene algo pagado.
 */
export async function leerPlanesPago(
  so: ClienteSocios,
  hoy: string,
  filtro: { disciplina?: number; soloVigentes?: boolean } = {}
): Promise<PlanPago[]> {
  let q = so.from("planes_pago").select("*");
  if (filtro.disciplina) q = q.eq("disciplina_id", filtro.disciplina);
  if (filtro.soloVigentes) q = q.eq("estado", "vigente");
  const planes = exigir(await q.order("created_at", { ascending: false }).order("id", { ascending: false }));
  const ids = planes.map((p) => p.id);
  if (ids.length === 0) return [];
  const [cuotas, pedidos] = await Promise.all([
    porIds(ids, (lote) => so.from("plan_pago_cuotas").select("*").in("plan_id", lote)),
    porIds(ids, (lote) => so.from("plan_pago_pedidos").select("*").in("plan_id", lote)),
  ]);
  const aplicaciones = await porIds(
    cuotas.map((c) => c.id),
    (lote) => so.from("plan_pago_aplicaciones").select("*").in("cuota_id", lote)
  );
  const apPorCuota = new Map<number, ImputacionCuota[]>();
  for (const a of aplicaciones.sort((x, y) => x.fecha.localeCompare(y.fecha) || x.id - y.id)) {
    const l = apPorCuota.get(a.cuota_id) ?? [];
    l.push({ id: a.id, fecha: a.fecha, importe: num(a.importe), anulada: a.anulada, cobro_id: a.cobro_id, liquidacion_id: a.liquidacion_id });
    apPorCuota.set(a.cuota_id, l);
  }
  const cuotasPor = new Map<number, CuotaPlan[]>();
  for (const c of cuotas) {
    const imputaciones = apPorCuota.get(c.id) ?? [];
    const pagado = r2(imputaciones.filter((a) => !a.anulada).reduce((s, a) => s + a.importe, 0));
    const saldo = r2(num(c.importe) - pagado);
    const l = cuotasPor.get(c.plan_id) ?? [];
    l.push({
      id: c.id,
      numero: c.numero,
      vencimiento: c.vencimiento,
      importe: num(c.importe),
      pagado,
      saldo,
      situacion: saldo <= 0 ? "pagada" : c.vencimiento < hoy ? "vencida" : pagado > 0 ? "parcial" : "pendiente",
      imputaciones,
    });
    cuotasPor.set(c.plan_id, l);
  }
  const pedidosPor = new Map<number, PedidoDePlan[]>();
  for (const p of pedidos) {
    const l = pedidosPor.get(p.plan_id) ?? [];
    l.push({ pedido_id: p.pedido_id, importe: num(p.importe) });
    pedidosPor.set(p.plan_id, l);
  }
  return planes
    .map((p) => {
      const detalle = (cuotasPor.get(p.id) ?? []).sort((a, b) => a.numero - b.numero);
      const vencidas = detalle.filter((c) => c.situacion === "vencida");
      const saldo = r2(detalle.reduce((s, c) => s + c.saldo, 0));
      return {
        id: p.id,
        disciplina_id: p.disciplina_id,
        descripcion: p.descripcion,
        importe_total: num(p.importe_total),
        notas: p.notas,
        estado: p.estado,
        motivo_cancelacion: p.motivo_cancelacion,
        cancelado_at: p.cancelado_at,
        created_at: p.created_at,
        pagado: r2(detalle.reduce((s, c) => s + c.pagado, 0)),
        saldo,
        cuotas: detalle.length,
        cuotas_pagadas: detalle.filter((c) => c.situacion === "pagada").length,
        cuotas_vencidas: vencidas.length,
        saldo_vencido: r2(vencidas.reduce((s, c) => s + c.saldo, 0)),
        proximo_vencimiento: detalle.find((c) => c.saldo > 0)?.vencimiento ?? null,
        situacion: p.estado === "cancelado" ? "cancelado" : saldo <= 0 ? "cumplido" : vencidas.length > 0 ? "atrasado" : "al_dia",
        pedidos: pedidosPor.get(p.id) ?? [],
        detalle,
      };
    })
    .sort((a, b) => Number(b.estado === "vigente") - Number(a.estado === "vigente"));
}

/** Planes de la disciplina con cuotas, pedidos e imputaciones (vigentes primero). */
export function planesPagoDisciplina(so: ClienteSocios, disciplina: number, hoy: string): Promise<PlanPago[]> {
  return leerPlanesPago(so, hoy, { disciplina });
}

/** Pagos de la disciplina (más nuevos primero), con lo imputado a planes. */
export async function pagosDisciplina(so: ClienteSocios, disciplina: number, planes: PlanPago[]): Promise<PagoDisciplina[]> {
  const cobros = exigir(
    await so.from("cobros_disciplina").select("*").eq("disciplina_id", disciplina).order("fecha", { ascending: false }).order("id", { ascending: false })
  );
  const cuotaInfo = new Map<number, { plan_id: number; plan: string; numero: number }>();
  for (const p of planes) for (const c of p.detalle) cuotaInfo.set(c.id, { plan_id: p.id, plan: p.descripcion, numero: c.numero });
  const porCobro = new Map<number, ImputacionPlan[]>();
  for (const p of planes)
    for (const c of p.detalle)
      for (const a of c.imputaciones) {
        if (a.cobro_id == null) continue;
        const info = cuotaInfo.get(c.id)!;
        const l = porCobro.get(a.cobro_id) ?? [];
        l.push({ id: a.id, plan_id: info.plan_id, plan: info.plan, cuota: info.numero, fecha: a.fecha, importe: a.importe, anulada: a.anulada });
        porCobro.set(a.cobro_id, l);
      }
  return cobros.map((c) => ({
    id: c.id,
    fecha: c.fecha,
    importe: num(c.importe),
    cuenta_id: c.cuenta_id,
    referencia: c.referencia,
    notas: c.notas,
    estado: c.estado,
    motivo_anulacion: c.motivo_anulacion,
    asiento_id: c.asiento_id,
    imputaciones: porCobro.get(c.id) ?? [],
  }));
}

// ------------------------------------------------------------
// Liquidaciones de la disciplina
// ------------------------------------------------------------

export interface LiquidacionDeDisciplina {
  id: number;
  desde: string;
  hasta: string;
  fecha: string;
  cobrado: number;
  comision: number;
  importe: number;
  compensado: number;
  transferido: number;
  estado: string;
  notas: string | null;
  motivo_anulacion: string | null;
  asiento_id: string;
}

export async function liquidacionesDeDisciplina(so: ClienteSocios, disciplina: number): Promise<LiquidacionDeDisciplina[]> {
  const filas = exigir(
    await so
      .from("liquidaciones_disciplina")
      .select("*")
      .eq("disciplina_id", disciplina)
      .order("hasta", { ascending: false })
      .order("id", { ascending: false })
  );
  return filas.map((l) => ({
    id: l.id,
    desde: l.desde,
    hasta: l.hasta,
    fecha: l.fecha,
    cobrado: num(l.cobrado),
    comision: num(l.comision),
    importe: num(l.importe),
    compensado: num(l.compensado),
    transferido: num(l.transferido),
    estado: l.estado,
    notas: l.notas,
    motivo_anulacion: l.motivo_anulacion,
    asiento_id: l.asiento_id,
  }));
}

// ------------------------------------------------------------
// Pedidos
// ------------------------------------------------------------

export interface PlanDePedido {
  id: number;
  descripcion: string;
  disciplina_id: number;
}

/** Plan vigente en el que está cada pedido (un pedido está en un solo plan vigente). */
export async function planesVigentesDePedidos(so: ClienteSocios, pedidos: number[]): Promise<Map<number, PlanDePedido>> {
  const filas = await porIds(pedidos, (lote) =>
    so.from("plan_pago_pedidos").select("pedido_id, planes_pago!inner(id, descripcion, disciplina_id, estado)").in("pedido_id", lote).eq("planes_pago.estado", "vigente")
  );
  const out = new Map<number, PlanDePedido>();
  for (const f of filas) {
    const p = Array.isArray(f.planes_pago) ? f.planes_pago[0] : f.planes_pago;
    if (p) out.set(f.pedido_id, { id: p.id, descripcion: p.descripcion, disciplina_id: p.disciplina_id });
  }
  return out;
}

export interface PedidoDisciplina {
  id: number;
  numero: string;
  fecha: string;
  total: number;
  estado: string;
  detalle: string;
  /** Plan vigente que lo incluye. */
  plan: PlanDePedido | null;
}

/**
 * Pedidos de la disciplina (más nuevos primero). `db` es el cliente de
 * servicio: la tesorería no ve `public.pedidos` por RLS.
 */
export async function pedidosDeDisciplina(db: ClientePadron, so: ClienteSocios, disciplina: number): Promise<PedidoDisciplina[]> {
  const filas = await leerTodo((a, b) =>
    db
      .from("pedidos")
      .select("id, numero_pedido, total, estado, created_at, fecha_venta, pedido_items(cantidad, productos(nombre), producto_variantes(nombre))")
      .eq("tipo", "disciplina")
      .eq("disciplina_id", disciplina)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(a, b)
  );
  const planes = await planesVigentesDePedidos(
    so,
    filas.map((f) => f.id)
  );
  const uno = <T,>(v: T | T[] | null | undefined): T | null => (v == null ? null : Array.isArray(v) ? (v[0] ?? null) : v);
  return filas.map((f) => ({
    id: f.id,
    numero: f.numero_pedido ?? `#${f.id}`,
    fecha: (f.fecha_venta ?? f.created_at ?? "").slice(0, 10),
    total: num(f.total),
    estado: f.estado,
    detalle: (f.pedido_items ?? [])
      .map((i) => {
        const v = uno(i.producto_variantes)?.nombre;
        return `${i.cantidad} × ${uno(i.productos)?.nombre ?? "producto"}${v ? ` (${v})` : ""}`;
      })
      .join(" · "),
    plan: planes.get(f.id) ?? null,
  }));
}

/** Planes vigentes con saldo de todas las disciplinas (para imputar en la liquidación). */
export interface PlanVigente {
  id: number;
  disciplina_id: number;
  descripcion: string;
  saldo: number;
  saldo_vencido: number;
  proximo_vencimiento: string | null;
}

export async function planesVigentesConSaldo(so: ClienteSocios, hoy: string, disciplina?: number): Promise<PlanVigente[]> {
  const planes = await leerPlanesPago(so, hoy, { disciplina, soloVigentes: true });
  return planes
    .filter((p) => p.saldo > 0)
    .map((p) => ({
      id: p.id,
      disciplina_id: p.disciplina_id,
      descripcion: p.descripcion,
      saldo: p.saldo,
      saldo_vencido: p.saldo_vencido,
      proximo_vencimiento: p.proximo_vencimiento,
    }))
    .sort((a, b) => a.id - b.id);
}

// ------------------------------------------------------------
// Socios de la disciplina
// ------------------------------------------------------------

export interface InscripcionDisciplina {
  id: number;
  persona_id: number;
  persona: string;
  cedula: string;
  numero_socio: number | null;
  plan_id: number;
  plan: string;
  periodicidad: string;
  desde: string;
  hasta: string | null;
  motivo_fin: string | null;
  estado: "vigente" | "programada" | "finalizada";
}

export interface SocioDisciplina {
  persona_id: number;
  persona: string;
  cedula: string;
  numero_socio: number | null;
  planes: string[];
  plan_ids: number[];
  /** Desde cuándo está en la disciplina (inicio de la inscripción vigente más vieja). */
  desde: string;
  medio: string | null;
  medioDisciplina: string | null;
  alDia: boolean | null;
  cuotasVencidas: number;
  deudaVencida: number;
}

export interface MovimientoMes {
  mes: string;
  altas: number;
  bajas: number;
}

export interface SociosDeDisciplina {
  vigentes: SocioDisciplina[];
  inscripciones: InscripcionDisciplina[];
  categorias: { id: number; nombre: string; activo: boolean }[];
  porMes: MovimientoMes[];
}

type FilaPersona = { id: number; nombre: string; apellido: string; cedula: string; numero_socio: number | null };

export async function sociosDeDisciplina(
  so: ClienteSocios,
  padron: ClientePadron,
  disciplina: number,
  hoy: string
): Promise<SociosDeDisciplina> {
  const categorias = exigir(await so.from("planes").select("id, nombre, activo").eq("disciplina_id", disciplina).order("nombre"));
  const planIds = categorias.map((c) => c.id);
  const nombrePlan = new Map(categorias.map((c) => [c.id, c.nombre]));
  const subs = planIds.length
    ? await leerTodo((a, b) => so.from("suscripciones").select("*").in("plan_id", planIds).order("id").range(a, b))
    : [];
  const personaIds = [...new Set(subs.map((s) => s.persona_id))];
  const [personas, medios, situacion, disciplinas] = await Promise.all([
    porIds<FilaPersona>(personaIds, (lote) =>
      padron.from("padron_socios").select("id, nombre, apellido, cedula, numero_socio").in("id", lote) as unknown as PromiseLike<{
        data: FilaPersona[] | null;
        error: { message: string } | null;
      }>
    ),
    porIds(personaIds, (lote) =>
      so.from("medios_cobro").select("persona_id, medio, disciplina_id").in("persona_id", lote).lte("desde", hoy).or(`hasta.is.null,hasta.gte.${hoy}`)
    ),
    porIds(personaIds, (lote) => so.rpc("situacion", { p_fecha: hoy }).in("persona_id", lote)),
    padron.from("disciplinas").select("id, nombre").then(exigir),
  ]);
  const per = new Map(personas.map((p) => [p.id, p]));
  const medioPor = new Map(medios.map((m) => [m.persona_id, m]));
  const sitPor = new Map(situacion.map((s) => [s.persona_id, s]));
  const nombreDisc = new Map(disciplinas.map((d) => [d.id, d.nombre]));
  const nombre = (id: number) => {
    const p = per.get(id);
    return p ? `${p.apellido}, ${p.nombre}` : `Persona ${id}`;
  };

  const inscripciones: InscripcionDisciplina[] = subs
    .map((s) => ({
      id: s.id,
      persona_id: s.persona_id,
      persona: nombre(s.persona_id),
      cedula: per.get(s.persona_id)?.cedula ?? "",
      numero_socio: per.get(s.persona_id)?.numero_socio ?? null,
      plan_id: s.plan_id,
      plan: nombrePlan.get(s.plan_id) ?? `Plan ${s.plan_id}`,
      periodicidad: s.periodicidad,
      desde: s.desde,
      hasta: s.hasta,
      motivo_fin: s.motivo_fin,
      estado: (s.desde > hoy ? "programada" : vigenteEn(s.desde, s.hasta, hoy) ? "vigente" : "finalizada") as InscripcionDisciplina["estado"],
    }))
    .sort((a, b) => b.desde.localeCompare(a.desde) || a.persona.localeCompare(b.persona, "es"));

  const vigPor = new Map<number, InscripcionDisciplina[]>();
  for (const i of inscripciones) {
    if (i.estado !== "vigente") continue;
    const l = vigPor.get(i.persona_id) ?? [];
    l.push(i);
    vigPor.set(i.persona_id, l);
  }
  const vigentes: SocioDisciplina[] = [...vigPor.entries()]
    .map(([pid, l]) => {
      const m = medioPor.get(pid);
      const s = sitPor.get(pid);
      return {
        persona_id: pid,
        persona: nombre(pid),
        cedula: per.get(pid)?.cedula ?? "",
        numero_socio: per.get(pid)?.numero_socio ?? null,
        planes: l.map((i) => i.plan),
        plan_ids: l.map((i) => i.plan_id),
        desde: l.map((i) => i.desde).sort()[0],
        medio: m?.medio ?? null,
        medioDisciplina: m?.disciplina_id ? (nombreDisc.get(m.disciplina_id) ?? null) : null,
        alDia: s ? !!s.al_dia : null,
        cuotasVencidas: num(s?.cuotas_vencidas),
        deudaVencida: num(s?.deuda_vencida),
      };
    })
    .sort((a, b) => a.persona.localeCompare(b.persona, "es"));

  // Altas y bajas de los últimos 12 meses. Un cambio de categoría (cierra
  // una inscripción y abre otra al día siguiente) no cuenta como baja ni alta.
  const meses: string[] = [];
  for (let i = 11; i >= 0; i--) meses.push(sumarMesesDia(`${hoy.slice(0, 7)}-01`, -i).slice(0, 7));
  const porMes = new Map(meses.map((m) => [m, { mes: m, altas: 0, bajas: 0 }]));
  const diaSiguiente = (iso: string) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  const inicios = new Set(subs.map((s) => `${s.persona_id}|${s.desde}`));
  const finales = new Set(subs.filter((s) => s.hasta).map((s) => `${s.persona_id}|${diaSiguiente(s.hasta!)}`));
  for (const s of subs) {
    const alta = porMes.get(s.desde.slice(0, 7));
    if (alta && s.desde <= hoy && !finales.has(`${s.persona_id}|${s.desde}`)) alta.altas++;
    if (s.hasta && s.hasta <= hoy) {
      const baja = porMes.get(s.hasta.slice(0, 7));
      if (baja && !inicios.has(`${s.persona_id}|${diaSiguiente(s.hasta)}`)) baja.bajas++;
    }
  }

  return { vigentes, inscripciones, categorias, porMes: [...porMes.values()] };
}
