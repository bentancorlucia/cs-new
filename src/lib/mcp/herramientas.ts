import { createClient } from "@supabase/supabase-js";
import type { McpServer, CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Database } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRango } from "@/lib/reportes/rango";
import { generarReporteTienda } from "@/lib/reportes/tienda";
import { obtenerDashboardTienda } from "@/lib/tienda/dashboard";
import { obtenerPanoramaTesoreria } from "@/lib/tesoreria/panorama";
import { calcularEjecucionPresupuesto } from "@/lib/tesoreria/ejecucion";
import { periodoActual } from "@/lib/tesoreria/presupuesto";
import { obtenerResumenSocios } from "@/lib/socios/resumen";
import {
  ErrorConciliacion,
  aplicarExtracto,
  aplicarExtractoSchema,
  editarMovimientos,
  editarMovimientosSchema,
  estadoConciliacionCuentas,
  extractoSchema,
  previsualizarExtracto,
} from "@/lib/tesoreria/conciliacion-extracto";
import { uruguayNowParts } from "@/lib/timezone";
import { tieneRol, usuarioDe, type UsuarioMcp } from "./auth";
import {
  agregarSchema,
  agregarTabla,
  catalogoPara,
  consultarSchema,
  consultarTabla,
  modulosDe,
} from "./consultas";

const ROLES_TIENDA = ["tienda"];
const ROLES_TESORERIA = ["tesorero"];
const ROLES_SECRETARIA = ["secretaria"];
const ROLES_CUALQUIER_MODULO = ["tienda", "tesorero", "secretaria"];

// Tope de respuesta para no saturar el contexto del modelo.
const MAX_CARACTERES = 120_000;

export const INSTRUCCIONES_MCP = `Servidor de datos internos de Club Seminario (Montevideo, Uruguay).
Las herramientas de consulta devuelven los mismos números que los paneles del dashboard. Solo tesorería puede escribir (ver abajo).
- Fechas en formato YYYY-MM-DD, calendario de Uruguay (UTC-3).
- Montos de tienda en pesos uruguayos (UYU). Las ventas de tienda NO incluyen donaciones (se transfieren a la Olla del Hogar).
- Tesorería maneja UYU y USD; los totales consolidados usan la cotización BCU vigente (promedio compra/venta).
- Cada herramienta requiere un rol (tienda, tesorero, secretaria; super_admin ve todo). Si no hay permiso, decíselo al usuario en vez de inventar datos.
- Usá "quien_soy" si no sabés qué puede consultar el usuario.
- Para preguntas generales preferí las herramientas de resumen (estado_tienda_hoy, reporte_tienda, panorama_finanzas, ejecucion_presupuesto, resumen_socios).
- Para cualquier otro dato: listar_tablas → consultar_tabla (filas) o agregar_tabla (sumas, conteos, promedios agrupados). Son de solo lectura y solo muestran las tablas del área del usuario.
- Los datos pueden incluir información personal (nombres, cédulas, teléfonos): usala solo para responder lo que te preguntan.
- Conciliación bancaria (rol tesorero), cuando el usuario sube un estado de cuenta:
  1. Identificá la cuenta (consultar_tabla cuentas_financieras) y mirá estado_conciliacion para saber qué meses ya están.
  2. Transcribí TODAS las líneas del extracto (fecha, concepto, monto positivo, ingreso/egreso, saldo si figura) y los saldos inicial y final.
  3. previsualizar_extracto: si la lectura no cierra, el error es tuyo leyendo el extracto; releé las líneas indicadas antes de seguir.
  4. Mostrale al usuario el resumen y las correcciones que proponés (movimientos a corregir, duplicados a eliminar, saldo inicial, categorías) y esperá su OK.
  5. aplicar_extracto con el mismo preview_id. Todo se aplica junto o nada. Lo que sale del extracto queda conciliado.
  - Para cargar meses pasados, subí los extractos del más viejo al más nuevo: el primero fija el saldo inicial de la cuenta.
  - Nunca inventes un ajuste para que cierre: cada corrección tiene que apuntar a una línea del banco o a un movimiento concreto. El ajuste de conciliación es solo si el usuario lo pide.
  - Los movimientos generados por tienda, transferencias o pagos a proveedores ("protegido") no se editan ni borran desde acá: decile al usuario que los corrija en su panel.
Respondé en español rioplatense.`;

const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD")
  .optional();

const soloLectura = { readOnlyHint: true, openWorldHint: false } as const;
const escritura = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

type Ctx = { http?: { authInfo?: Parameters<typeof usuarioDe>[0] } };

export function registrarHerramientas(server: McpServer) {
  server.registerTool(
    "quien_soy",
    {
      title: "Quién soy",
      description:
        "Devuelve el usuario conectado, sus roles y qué herramientas puede usar.",
      annotations: soloLectura,
    },
    async (ctx) => {
      const usuario = usuarioDe((ctx as Ctx).http?.authInfo);
      if (!usuario) return error("Sesión no válida.");
      log(usuario, "quien_soy");
      return ok({
        usuario: { nombre: usuario.nombre, email: usuario.email, roles: usuario.roles },
        herramientasDisponibles: {
          estado_tienda_hoy: tieneRol(usuario, ROLES_TIENDA),
          reporte_tienda: tieneRol(usuario, ROLES_TIENDA),
          panorama_finanzas: tieneRol(usuario, ROLES_TESORERIA),
          ejecucion_presupuesto: tieneRol(usuario, ROLES_TESORERIA),
          resumen_socios: tieneRol(usuario, ROLES_SECRETARIA),
          listar_tablas: tieneRol(usuario, ROLES_CUALQUIER_MODULO),
          consultar_tabla: tieneRol(usuario, ROLES_CUALQUIER_MODULO),
          agregar_tabla: tieneRol(usuario, ROLES_CUALQUIER_MODULO),
          estado_conciliacion: tieneRol(usuario, ROLES_TESORERIA),
          previsualizar_extracto: tieneRol(usuario, ROLES_TESORERIA),
          aplicar_extracto: tieneRol(usuario, ROLES_TESORERIA),
          editar_movimientos: tieneRol(usuario, ROLES_TESORERIA),
        },
        modulosConAccesoCompleto: modulosDe(usuario),
      });
    }
  );

  server.registerTool(
    "estado_tienda_hoy",
    {
      title: "Estado de la tienda hoy",
      description:
        "Foto actual de la tienda: ventas de hoy, últimos 7 días y mes en curso; pedidos pendientes de entregar; " +
        "últimos 10 pedidos; top 5 productos del mes; productos con stock en o bajo el mínimo. Requiere rol tienda.",
      annotations: soloLectura,
    },
    async (ctx) =>
      conRol(ctx as Ctx, ROLES_TIENDA, "estado_tienda_hoy", async () =>
        obtenerDashboardTienda(createAdminClient())
      )
  );

  server.registerTool(
    "reporte_tienda",
    {
      title: "Reporte de ventas de la tienda",
      description:
        "Reporte de un período: ventas, costo de mercadería (COGS), margen, cantidad de pedidos, ticket promedio y % de ventas a socios, " +
        "cada uno comparado con el período anterior de igual largo. Incluye top 10 productos, margen por categoría, online vs. POS, " +
        "método de pago y pedidos por estado. Por defecto: últimos 30 días. Requiere rol tienda.",
      inputSchema: z.object({
        desde: fecha.describe("Inicio del período (inclusive)"),
        hasta: fecha.describe("Fin del período (inclusive). Por defecto hoy."),
        incluir_serie: z
          .boolean()
          .optional()
          .describe("Incluir la serie diaria (o semanal si el rango supera 60 días). Por defecto false."),
      }),
      annotations: soloLectura,
    },
    async ({ desde, hasta, incluir_serie }, ctx) =>
      conRol(ctx as Ctx, ROLES_TIENDA, "reporte_tienda", async () => {
        const rango = parseRango(paramsRango(desde, hasta));
        const { serie, ...reporte } = await generarReporteTienda(createAdminClient(), rango);
        return incluir_serie ? { ...reporte, serie } : reporte;
      })
  );

  server.registerTool(
    "panorama_finanzas",
    {
      title: "Panorama financiero",
      description:
        "Saldos actuales de cada cuenta de tesorería, total consolidado en UYU y USD, cotización BCU usada, " +
        "ingresos/egresos por mes de los últimos 12 meses y top 5 categorías de ingreso y egreso del mes en curso. Requiere rol tesorero.",
      annotations: soloLectura,
    },
    async (ctx) =>
      conRol(ctx as Ctx, ROLES_TESORERIA, "panorama_finanzas", async (token) =>
        obtenerPanoramaTesoreria(clienteComoUsuario(token))
      )
  );

  server.registerTool(
    "ejecucion_presupuesto",
    {
      title: "Presupuesto vs. ejecutado",
      description:
        "Compara lo presupuestado con lo ejecutado por categoría (árbol padre/hijo, campo 'nivel') y por mes, en la moneda pedida. " +
        "Por defecto: el año en curso en UYU. Requiere rol tesorero.",
      inputSchema: z.object({
        tipo_periodo: z
          .enum(["anual", "semestral", "cuatrimestral", "trimestral", "mensual"])
          .optional()
          .describe("Por defecto anual."),
        anio: z.number().int().min(2000).max(2100).optional().describe("Por defecto el año actual."),
        periodo_numero: z
          .number()
          .int()
          .min(1)
          .max(12)
          .optional()
          .describe("Número de período dentro del año (ej. 2 = 2do semestre, 9 = septiembre). Por defecto el período actual."),
        moneda: z.enum(["UYU", "USD"]).optional().describe("Moneda de visualización. Por defecto UYU."),
      }),
      annotations: soloLectura,
    },
    async ({ tipo_periodo, anio, periodo_numero, moneda }, ctx) =>
      conRol(ctx as Ctx, ROLES_TESORERIA, "ejecucion_presupuesto", async (token) => {
        const tipo = tipo_periodo ?? "anual";
        const actual = periodoActual(tipo);
        return calcularEjecucionPresupuesto(clienteComoUsuario(token), {
          tipo,
          anio: anio ?? actual.anio,
          numero: periodo_numero ?? actual.numero,
          moneda: moneda ?? "UYU",
        });
      })
  );

  server.registerTool(
    "resumen_socios",
    {
      title: "Situación de socios",
      description:
        "Padrón de socios: total, activos, inactivos y activos con cuenta web; altas y bajas dentro del período; " +
        "socios activos por disciplina. Por defecto: el mes en curso. No devuelve datos personales. Requiere rol secretaria.",
      inputSchema: z.object({
        desde: fecha.describe("Inicio del período para altas/bajas. Por defecto el 1° del mes actual."),
        hasta: fecha.describe("Fin del período. Por defecto hoy."),
      }),
      annotations: soloLectura,
    },
    async ({ desde, hasta }, ctx) =>
      conRol(ctx as Ctx, ROLES_SECRETARIA, "resumen_socios", async () => {
        const { year, month } = uruguayNowParts();
        const inicioMes = `${year}-${String(month).padStart(2, "0")}-01`;
        const rango = parseRango(paramsRango(desde ?? inicioMes, hasta));
        return obtenerResumenSocios(createAdminClient(), rango);
      })
  );
  server.registerTool(
    "listar_tablas",
    {
      title: "Tablas disponibles",
      description:
        "Lista las tablas que el usuario puede consultar según sus roles (tienda, tesorería, secretaría), " +
        "con descripción y columnas. Usala antes de consultar_tabla / agregar_tabla.",
      inputSchema: z.object({
        modulo: z.enum(["tienda", "tesoreria", "secretaria"]).optional().describe("Filtrar por área"),
      }),
      annotations: soloLectura,
    },
    async ({ modulo }, ctx) =>
      conRol(ctx as Ctx, ROLES_CUALQUIER_MODULO, "listar_tablas", async (_t, usuario) =>
        catalogoPara(usuario, modulo)
      )
  );

  server.registerTool(
    "consultar_tabla",
    {
      title: "Consultar tabla",
      description:
        "Devuelve filas de una tabla (solo lectura) con filtros, orden y paginación. Puede traer columnas de tablas relacionadas " +
        "vía 'relaciones' (ej. pedido_items con productos(nombre)). Para filtrar por una columna de la relación usá 'relacion.columna' " +
        "y marcá la relación como obligatoria. Devuelve también el total de coincidencias. Máx. 500 filas por llamada.",
      inputSchema: consultarSchema,
      annotations: soloLectura,
    },
    async (input, ctx) =>
      conRol(ctx as Ctx, ROLES_CUALQUIER_MODULO, `consultar_tabla:${input.tabla}`, async (_t, usuario) =>
        recortar(await consultarTabla(usuario, input))
      )
  );

  server.registerTool(
    "agregar_tabla",
    {
      title: "Agregar datos",
      description:
        "Calcula count, count_distinct, sum, avg, min y max sobre una tabla (solo lectura), opcionalmente agrupando por columnas " +
        "o por fecha (':dia', ':semana', ':mes', ':anio' en hora de Uruguay). Acepta filtros y relaciones como consultar_tabla " +
        "(usá relaciones muchos-a-uno, ej. pedido_items → pedidos). Recorre hasta 50.000 filas. " +
        "Ej.: ventas por mes = tabla pedidos, filtros estado in [...], agrupar_por ['created_at:mes'], metricas [{funcion:'sum', columna:'total'}].",
      inputSchema: agregarSchema,
      annotations: soloLectura,
    },
    async (input, ctx) =>
      conRol(ctx as Ctx, ROLES_CUALQUIER_MODULO, `agregar_tabla:${input.tabla}`, async (_t, usuario) =>
        agregarTabla(usuario, input)
      )
  );

  server.registerTool(
    "estado_conciliacion",
    {
      title: "Estado de conciliación bancaria",
      description:
        "Por cuenta de tesorería: extractos cargados (período, saldos del banco, si cierra y por cuánto no), " +
        "si hay huecos entre extractos, desde/hasta cuándo está conciliada y cuántos movimientos quedan sin conciliar. " +
        "Usala antes de cargar un extracto y para ver qué meses faltan. Requiere rol tesorero.",
      inputSchema: z.object({
        cuenta_id: z.number().int().positive().optional().describe("Por defecto todas las cuentas de tesorería"),
      }),
      annotations: soloLectura,
    },
    async ({ cuenta_id }, ctx) =>
      conRol(ctx as Ctx, ROLES_TESORERIA, "estado_conciliacion", async (token) =>
        estadoConciliacionCuentas(clienteComoUsuario(token), cuenta_id)
      )
  );

  server.registerTool(
    "previsualizar_extracto",
    {
      title: "Previsualizar estado de cuenta",
      description:
        "Compara un estado de cuenta del banco (líneas transcriptas por vos) contra los movimientos del sistema, SIN escribir nada. " +
        "Verifica que las líneas sumen el saldo final (error de lectura), propone para cada línea conciliar con un movimiento existente, " +
        "crearla o marcarla como transferencia de donaciones a la Olla; detecta posibles errores de carga (fecha, monto o tipo distintos), " +
        "movimientos del sistema que el banco no muestra, y si el saldo de apertura coincide (sugiere saldo inicial en el primer extracto). " +
        "Devuelve preview_id para aplicar_extracto. Requiere rol tesorero.",
      inputSchema: extractoSchema,
      annotations: soloLectura,
    },
    async (input, ctx) =>
      conRol(ctx as Ctx, ROLES_TESORERIA, "previsualizar_extracto", async (token) =>
        recortarLineas(await previsualizarExtracto(clienteComoUsuario(token), input))
      )
  );

  server.registerTool(
    "aplicar_extracto",
    {
      title: "Aplicar estado de cuenta",
      description:
        "ESCRIBE en tesorería. Aplica un estado de cuenta ya previsualizado, en una sola transacción: correcciones a movimientos existentes " +
        "(con motivo, quedan en el historial), ajuste del saldo inicial de la cuenta (ajustar_saldo_inicial, solo con el extracto más antiguo), conciliación de movimientos existentes y " +
        "creación de los nuevos. Todo lo que sale del extracto queda conciliado. Mandá las mismas líneas y saldos que en la previsualización " +
        "y solo las decisiones que cambian la propuesta. Confirmá con el usuario antes de usarla. Requiere rol tesorero.",
      inputSchema: aplicarExtractoSchema,
      annotations: escritura,
    },
    async (input, ctx) =>
      conRol(ctx as Ctx, ROLES_TESORERIA, "aplicar_extracto", async (token) =>
        aplicarExtracto(clienteComoUsuario(token), input)
      )
  );

  server.registerTool(
    "editar_movimientos",
    {
      title: "Corregir movimientos de tesorería",
      description:
        "ESCRIBE en tesorería. Edita (monto, tipo, fecha, descripción, nombre, notas, categoría) o elimina movimientos de una cuenta, " +
        "todo junto o nada, con un motivo por cambio que queda en el historial. Sirve para clasificar movimientos o corregir los que " +
        "hacen que un extracto no cierre. Cambiar monto o tipo de un movimiento conciliado lo desconcilia. " +
        "Los movimientos de tienda, transferencias o pagos a proveedores solo admiten cambio de categoría, nombre y notas. " +
        "Confirmá con el usuario antes de usarla. Requiere rol tesorero.",
      inputSchema: editarMovimientosSchema,
      annotations: escritura,
    },
    async (input, ctx) =>
      conRol(ctx as Ctx, ROLES_TESORERIA, "editar_movimientos", async (token) =>
        editarMovimientos(clienteComoUsuario(token), input)
      )
  );
}

/** Previsualizaciones largas: si no entra, se resumen las líneas que ya casan sin dudas. */
function recortarLineas<T extends { lineas: Array<{ propuesta: string; alternativas?: unknown; posibles_errores?: unknown }> }>(r: T) {
  if (JSON.stringify(r).length <= MAX_CARACTERES) return r;
  const simples = r.lineas.filter((l) => l.propuesta === "conciliar" && !l.alternativas);
  return {
    ...r,
    lineas: r.lineas.filter((l) => !(l.propuesta === "conciliar" && !l.alternativas)),
    lineas_conciliadas_sin_dudas: simples.length,
    aviso: "Respuesta resumida por tamaño: se omitieron las líneas que casan con un único movimiento (quedan con esa propuesta).",
  };
}

/** Si la respuesta es enorme, recorta filas y avisa cómo paginar. */
function recortar<T extends { filas: unknown[]; devueltas: number }>(r: T) {
  let filas = r.filas;
  while (filas.length > 1 && JSON.stringify(filas).length > MAX_CARACTERES) {
    filas = filas.slice(0, Math.floor(filas.length / 2));
  }
  if (filas.length === r.filas.length) return r;
  return {
    ...r,
    filas,
    devueltas: filas.length,
    hay_mas: true,
    aviso: `Respuesta recortada a ${filas.length} filas por tamaño. Pedí menos columnas o usá desde_fila para paginar.`,
  };
}

async function conRol(
  ctx: Ctx,
  roles: string[],
  herramienta: string,
  fn: (token: string, usuario: UsuarioMcp) => Promise<unknown>
): Promise<CallToolResult> {
  const authInfo = ctx.http?.authInfo;
  const usuario = usuarioDe(authInfo);
  if (!usuario || !authInfo) return error("Sesión no válida.");
  if (!tieneRol(usuario, roles)) {
    log(usuario, herramienta, "denegado");
    return error(
      `Tu usuario no tiene permiso para esta consulta (requiere rol: ${roles.join(" o ")}). ` +
        "Pedile a un administrador que te asigne el rol desde el panel."
    );
  }
  log(usuario, herramienta);
  try {
    return ok(await fn(authInfo.token, usuario));
  } catch (e) {
    if (e instanceof ErrorConciliacion) {
      log(usuario, herramienta, "rechazado");
      return error(e.message);
    }
    const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Error";
    console.error(`[mcp] ${herramienta} falló:`, e);
    return error(`No se pudo completar: ${msg}`);
  }
}

/**
 * Cliente que actúa como el usuario (RLS aplicada), igual que las rutas de
 * tesorería que usan createServerClient() con la cookie de sesión.
 */
function clienteComoUsuario(token: string) {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

function paramsRango(desde?: string, hasta?: string) {
  const p = new URLSearchParams();
  if (desde) p.set("desde", desde);
  if (hasta) p.set("hasta", hasta);
  return p;
}

// Redondea floats (ej. 1234.5600000001) para no ensuciar la respuesta.
function redondear(_k: string, v: unknown) {
  return typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v;
}

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, redondear) }] };
}

function error(mensaje: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: mensaje }] };
}

function log(usuario: UsuarioMcp, herramienta: string, resultado = "ok") {
  console.info(`[mcp] ${usuario.email ?? usuario.userId} → ${herramienta} (${resultado})`);
}
