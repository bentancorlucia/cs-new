import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { claveDeYmd } from "@/lib/reportes/rango";
import { uruguayDateKey } from "@/lib/timezone";
import { CATALOGO, type Modulo } from "./catalogo";
import type { UsuarioMcp } from "./auth";

// Consultas genéricas de SOLO LECTURA sobre las tablas del catálogo.
// Todo identificador (tabla, columna, relación) se valida contra CATALOGO y
// contra los módulos del usuario antes de armar el select de PostgREST: nunca
// se interpola texto libre del cliente en el select ni en nombres de columna.

const ROL_A_MODULO: Record<string, Modulo> = {
  tienda: "tienda",
  tesorero: "tesoreria",
  secretaria: "secretaria",
};

export function modulosDe(usuario: UsuarioMcp): Modulo[] {
  if (usuario.roles.includes("super_admin")) {
    return ["tienda", "tesoreria", "secretaria"];
  }
  return [...new Set(usuario.roles.map((r) => ROL_A_MODULO[r]).filter(Boolean))];
}

export function tablasPermitidas(usuario: UsuarioMcp): string[] {
  const modulos = modulosDe(usuario);
  return Object.entries(CATALOGO)
    .filter(([, t]) => t.modulos.some((m) => modulos.includes(m)))
    .map(([nombre]) => nombre);
}

// ---------- Schemas de entrada ----------

const identificador = z.string().regex(/^[a-z_][a-z0-9_]*$/, "Identificador inválido");

const relacionSchema = z.object({
  tabla: identificador.describe("Tabla relacionada (debe estar entre tus tablas permitidas)"),
  columnas: z.array(identificador).min(1).describe("Columnas a traer de la tabla relacionada"),
  fk: identificador
    .optional()
    .describe("Columna FK para desambiguar cuando hay más de una relación posible (ej. 'perfil_id')"),
  obligatoria: z
    .boolean()
    .optional()
    .describe("true = INNER JOIN: descarta filas sin relación. Necesario para filtrar la tabla principal por columnas de la relacionada."),
});

const filtroSchema = z.object({
  columna: z
    .string()
    .regex(/^([a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*$/)
    .describe("Columna de la tabla, o 'relacion.columna' para una tabla en 'relaciones'"),
  operador: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is"]),
  valor: z
    .union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number()]))])
    .describe("Para 'in' un array; para 'is' null/true/false; para like/ilike usar % como comodín"),
});

const baseSchema = {
  tabla: identificador.describe("Tabla principal (ver listar_tablas)"),
  relaciones: z.array(relacionSchema).max(5).optional(),
  filtros: z.array(filtroSchema).max(20).optional(),
};

export const consultarSchema = z.object({
  ...baseSchema,
  columnas: z
    .array(identificador)
    .optional()
    .describe("Columnas a traer. Por defecto todas."),
  orden: z
    .array(z.object({ columna: identificador, descendente: z.boolean().optional() }))
    .max(3)
    .optional(),
  limite: z.number().int().min(1).max(500).optional().describe("Filas a devolver (máx. 500, por defecto 50)"),
  desde_fila: z.number().int().min(0).optional().describe("Offset para paginar"),
});

const agrupacion = z
  .string()
  .regex(/^([a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*(:(dia|semana|mes|anio))?$/)
  .describe("Columna o 'relacion.columna'; en fechas se puede agregar ':dia', ':semana', ':mes' o ':anio' (hora de Uruguay)");

export const agregarSchema = z.object({
  ...baseSchema,
  agrupar_por: z.array(agrupacion).max(4).optional().describe("Sin agrupar = un único total"),
  metricas: z
    .array(
      z.object({
        funcion: z.enum(["count", "count_distinct", "sum", "avg", "min", "max"]),
        columna: z
          .string()
          .regex(/^([a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*$/)
          .optional()
          .describe("No hace falta para count"),
      })
    )
    .min(1)
    .max(8),
});

type Relacion = z.infer<typeof relacionSchema>;
type Filtro = z.infer<typeof filtroSchema>;

class ErrorConsulta extends Error {}

// ---------- Validación ----------

function validarTabla(usuario: UsuarioMcp, tabla: string) {
  if (!CATALOGO[tabla]) {
    throw new ErrorConsulta(`La tabla '${tabla}' no existe o no está disponible. Usá listar_tablas.`);
  }
  if (!tablasPermitidas(usuario).includes(tabla)) {
    throw new ErrorConsulta(`No tenés permiso para consultar '${tabla}' con tus roles actuales.`);
  }
}

function validarColumna(tabla: string, columna: string) {
  if (!CATALOGO[tabla].columnas.includes(columna)) {
    throw new ErrorConsulta(
      `La columna '${columna}' no existe en '${tabla}'. Columnas: ${CATALOGO[tabla].columnas.join(", ")}`
    );
  }
}

/** Valida 'col' o 'relacion.col' contra la tabla principal y sus relaciones. */
function validarRuta(tabla: string, relaciones: Relacion[], ruta: string) {
  const [a, b] = ruta.split(".");
  if (b === undefined) return validarColumna(tabla, a);
  const rel = relaciones.find((r) => r.tabla === a);
  if (!rel) throw new ErrorConsulta(`'${a}' no está en 'relaciones'.`);
  validarColumna(a, b);
}

function armarSelect(
  usuario: UsuarioMcp,
  tabla: string,
  columnas: string[] | null,
  relaciones: Relacion[]
): string {
  validarTabla(usuario, tabla);
  const base = columnas ?? CATALOGO[tabla].columnas;
  base.forEach((c) => validarColumna(tabla, c));

  const embebidos = relaciones.map((r) => {
    validarTabla(usuario, r.tabla);
    r.columnas.forEach((c) => validarColumna(r.tabla, c));
    const hint = r.fk ? `!${r.fk}` : "";
    const inner = r.obligatoria ? "!inner" : "";
    return `${r.tabla}${hint}${inner}(${r.columnas.join(",")})`;
  });

  return [...base, ...embebidos].join(",");
}

function formatearValor(f: Filtro): string {
  const v = f.valor;
  if (f.operador === "in") {
    if (!Array.isArray(v)) throw new ErrorConsulta("El operador 'in' requiere un array.");
    const quote = (x: string | number) => `"${String(x).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    return `(${v.map(quote).join(",")})`;
  }
  if (f.operador === "is") {
    if (v !== null && typeof v !== "boolean") {
      throw new ErrorConsulta("El operador 'is' solo acepta null, true o false.");
    }
    return String(v);
  }
  if (Array.isArray(v) || v === null) {
    throw new ErrorConsulta(`Valor inválido para '${f.operador}'.`);
  }
  return String(v);
}

// PostgREST builder sin tipar: las tablas son dinámicas (validadas arriba).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;

function aplicarFiltros(q: Query, tabla: string, relaciones: Relacion[], filtros: Filtro[]): Query {
  for (const f of filtros) {
    validarRuta(tabla, relaciones, f.columna);
    q = q.filter(f.columna, f.operador, formatearValor(f));
  }
  return q;
}

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

// ---------- consultar_tabla ----------

export async function consultarTabla(usuario: UsuarioMcp, input: z.infer<typeof consultarSchema>) {
  const relaciones = input.relaciones ?? [];
  const select = armarSelect(usuario, input.tabla, input.columnas ?? null, relaciones);
  const limite = input.limite ?? 50;
  const desde = input.desde_fila ?? 0;

  let q: Query = db().from(input.tabla).select(select, { count: "exact" });
  q = aplicarFiltros(q, input.tabla, relaciones, input.filtros ?? []);
  for (const o of input.orden ?? []) {
    validarColumna(input.tabla, o.columna);
    q = q.order(o.columna, { ascending: !o.descendente });
  }
  if (!input.orden?.length && CATALOGO[input.tabla].columnas.includes("id")) {
    q = q.order("id", { ascending: true });
  }

  const { data, error, count } = await q.range(desde, desde + limite - 1);
  if (error) throw new ErrorConsulta(`Error de consulta: ${error.message}`);

  const filas = (data ?? []) as unknown[];
  return {
    tabla: input.tabla,
    total_coincidencias: count ?? null,
    desde_fila: desde,
    devueltas: filas.length,
    hay_mas: count != null ? desde + filas.length < count : filas.length === limite,
    filas,
  };
}

// ---------- agregar_tabla ----------

const PAGINA = 1000;
const MAX_FILAS_AGREGACION = 50_000;

function valorEn(fila: Record<string, unknown>, ruta: string): unknown {
  const [a, b] = ruta.split(".");
  if (b === undefined) return fila[a];
  const rel = fila[a];
  // Relaciones uno-a-muchos vienen como array: se toma la primera.
  const obj = Array.isArray(rel) ? rel[0] : rel;
  return obj && typeof obj === "object" ? (obj as Record<string, unknown>)[b] : null;
}

function claveFecha(valor: unknown, bucket: string): string | null {
  if (valor == null) return null;
  const s = String(valor);
  // Columnas DATE (YYYY-MM-DD) no se convierten de zona horaria.
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : uruguayDateKey(s);
  switch (bucket) {
    case "dia":
      return ymd;
    case "semana":
      return claveDeYmd(ymd, true);
    case "mes":
      return ymd.slice(0, 7);
    case "anio":
      return ymd.slice(0, 4);
    default:
      return ymd;
  }
}

export async function agregarTabla(usuario: UsuarioMcp, input: z.infer<typeof agregarSchema>) {
  const relaciones = input.relaciones ?? [];
  const agrupar = input.agrupar_por ?? [];

  // Columnas base necesarias (las de relaciones vienen en el embed).
  const rutasUsadas = [
    ...agrupar.map((g) => g.split(":")[0]),
    ...input.metricas.map((m) => m.columna).filter((c): c is string => !!c),
  ];
  for (const m of input.metricas) {
    if (m.funcion !== "count" && !m.columna) {
      throw new ErrorConsulta(`La métrica '${m.funcion}' requiere 'columna'.`);
    }
  }
  rutasUsadas.forEach((r) => validarRuta(input.tabla, relaciones, r));

  const tieneId = CATALOGO[input.tabla].columnas.includes("id");
  const base = [
    ...new Set([...(tieneId ? ["id"] : []), ...rutasUsadas.filter((r) => !r.includes("."))]),
  ];
  const select = armarSelect(usuario, input.tabla, base.length ? base : [CATALOGO[input.tabla].columnas[0]], relaciones);

  const filas: Record<string, unknown>[] = [];
  let truncado = false;
  for (let desde = 0; ; desde += PAGINA) {
    let q: Query = db().from(input.tabla).select(select);
    q = aplicarFiltros(q, input.tabla, relaciones, input.filtros ?? []);
    if (tieneId) q = q.order("id", { ascending: true });
    const { data, error } = await q.range(desde, desde + PAGINA - 1);
    if (error) throw new ErrorConsulta(`Error de consulta: ${error.message}`);
    filas.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < PAGINA) break;
    if (filas.length >= MAX_FILAS_AGREGACION) {
      truncado = true;
      break;
    }
  }

  type Acumulador = {
    claves: Record<string, unknown>;
    count: number;
    valores: Map<number, { suma: number; n: number; min: unknown; max: unknown; distintos: Set<string> }>;
  };
  const grupos = new Map<string, Acumulador>();

  for (const fila of filas) {
    const claves: Record<string, unknown> = {};
    for (const g of agrupar) {
      const [ruta, bucket] = g.split(":");
      const v = valorEn(fila, ruta);
      claves[g] = bucket ? claveFecha(v, bucket) : v ?? null;
    }
    const k = JSON.stringify(claves);
    let acc = grupos.get(k);
    if (!acc) {
      acc = { claves, count: 0, valores: new Map() };
      grupos.set(k, acc);
    }
    acc.count += 1;

    input.metricas.forEach((m, i) => {
      if (!m.columna) return;
      const v = valorEn(fila, m.columna);
      if (v == null) return;
      let slot = acc.valores.get(i);
      if (!slot) {
        slot = { suma: 0, n: 0, min: v, max: v, distintos: new Set() };
        acc.valores.set(i, slot);
      }
      const num = Number(v);
      if (!Number.isNaN(num)) {
        slot.suma += num;
        slot.n += 1;
      }
      if ((v as number | string) < (slot.min as number | string)) slot.min = v;
      if ((v as number | string) > (slot.max as number | string)) slot.max = v;
      slot.distintos.add(String(v));
    });
  }

  const nombreMetrica = (m: (typeof input.metricas)[number]) =>
    m.columna ? `${m.funcion}_${m.columna.replace(".", "_")}` : m.funcion;

  const resultado = [...grupos.values()].map((acc) => {
    const out: Record<string, unknown> = { ...acc.claves };
    input.metricas.forEach((m, i) => {
      const slot = acc.valores.get(i);
      const nombre = nombreMetrica(m);
      switch (m.funcion) {
        case "count":
          out[nombre] = m.columna ? (slot?.n ?? 0) : acc.count;
          break;
        case "count_distinct":
          out[nombre] = slot?.distintos.size ?? 0;
          break;
        case "sum":
          out[nombre] = slot?.suma ?? 0;
          break;
        case "avg":
          out[nombre] = slot && slot.n > 0 ? slot.suma / slot.n : null;
          break;
        case "min":
          out[nombre] = slot?.min ?? null;
          break;
        case "max":
          out[nombre] = slot?.max ?? null;
          break;
      }
    });
    return out;
  });

  // Orden: por fecha/clave si se agrupa por tiempo, si no por la 1ra métrica desc.
  const primeraMetrica = nombreMetrica(input.metricas[0]);
  const agrupaPorTiempo = agrupar.some((g) => g.includes(":"));
  resultado.sort((a, b) =>
    agrupaPorTiempo
      ? JSON.stringify(agrupar.map((g) => a[g])).localeCompare(JSON.stringify(agrupar.map((g) => b[g])))
      : Number(b[primeraMetrica] ?? 0) - Number(a[primeraMetrica] ?? 0)
  );

  const MAX_GRUPOS = 500;
  return {
    tabla: input.tabla,
    filas_procesadas: filas.length,
    truncado_en_filas: truncado ? MAX_FILAS_AGREGACION : undefined,
    total_grupos: resultado.length,
    grupos: resultado.slice(0, MAX_GRUPOS),
    aviso:
      resultado.length > MAX_GRUPOS
        ? `Se muestran ${MAX_GRUPOS} de ${resultado.length} grupos. Agregá filtros o agrupá más grueso.`
        : undefined,
  };
}

export function catalogoPara(usuario: UsuarioMcp, modulo?: Modulo) {
  const permitidas = tablasPermitidas(usuario);
  return Object.entries(CATALOGO)
    .filter(([nombre, t]) => permitidas.includes(nombre) && (!modulo || t.modulos.includes(modulo)))
    .map(([nombre, t]) => ({ tabla: nombre, modulos: t.modulos, descripcion: t.descripcion, columnas: t.columnas }));
}

export { ErrorConsulta };
