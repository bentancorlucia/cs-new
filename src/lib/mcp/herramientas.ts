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
import { uruguayNowParts } from "@/lib/timezone";
import { tieneRol, usuarioDe, type UsuarioMcp } from "./auth";

const ROLES_TIENDA = ["tienda"];
const ROLES_TESORERIA = ["tesorero"];
const ROLES_SECRETARIA = ["secretaria"];

export const INSTRUCCIONES_MCP = `Servidor de datos internos de Club Seminario (Montevideo, Uruguay).
Todas las herramientas son de solo lectura y devuelven los mismos números que los paneles del dashboard.
- Fechas en formato YYYY-MM-DD, calendario de Uruguay (UTC-3).
- Montos de tienda en pesos uruguayos (UYU). Las ventas de tienda NO incluyen donaciones (se transfieren a la Olla del Hogar).
- Tesorería maneja UYU y USD; los totales consolidados usan la cotización BCU vigente (promedio compra/venta).
- Cada herramienta requiere un rol (tienda, tesorero, secretaria; super_admin ve todo). Si no hay permiso, decíselo al usuario en vez de inventar datos.
- Usá "quien_soy" si no sabés qué puede consultar el usuario.
Respondé en español rioplatense.`;

const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD")
  .optional();

const soloLectura = { readOnlyHint: true, openWorldHint: false } as const;

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
        },
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
}

async function conRol(
  ctx: Ctx,
  roles: string[],
  herramienta: string,
  fn: (token: string) => Promise<unknown>
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
    return ok(await fn(authInfo.token));
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Error";
    console.error(`[mcp] ${herramienta} falló:`, e);
    return error(`No se pudo obtener la información: ${msg}`);
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
