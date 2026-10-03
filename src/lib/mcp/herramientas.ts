import type { McpServer, CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRango } from "@/lib/reportes/rango";
import { generarReporteTienda } from "@/lib/reportes/tienda";
import { obtenerDashboardTienda } from "@/lib/tienda/dashboard";
import {
  ejecucionDelPresupuesto,
  estadoConciliaciones,
  estadosContables,
  flujoDeCaja,
  importarExtracto,
  mayorDeCuenta,
  panoramaContable,
  previsualizarExtracto,
  proyeccionDeCaja,
} from "./contabilidad";
import { obtenerResumenSocios } from "@/lib/socios/resumen";
import { cobranzaSocios, deudoresSocios, estadoCuentaSocio } from "./socios";
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

// Ventas de la tienda: también tesorería y la comisión fiscal (solo lectura).
const ROLES_REPORTES_TIENDA = ["tienda", "tesorero", "comision_fiscal"];
const ROLES_CONTABILIDAD = ["tesorero", "comision_fiscal"];
const ROLES_TESORERIA = ["tesorero"];
const ROLES_CUOTAS = ["secretaria", "tesorero", "comision_fiscal"];
const ROLES_SECRETARIA = ["secretaria"];
const ROLES_CUALQUIER_MODULO = ["tienda", "tesorero", "secretaria"];

// Tope de respuesta para no saturar el contexto del modelo.
const MAX_CARACTERES = 120_000;

export const INSTRUCCIONES_MCP = `Servidor de datos internos de Club Seminario (Montevideo, Uruguay).
Las herramientas devuelven los mismos números que los paneles del dashboard y son de solo lectura.
- Fechas en formato YYYY-MM-DD, calendario de Uruguay (UTC-3).
- Montos de tienda en pesos uruguayos (UYU). Las ventas de tienda NO incluyen donaciones (se transfieren a la Olla del Hogar).
- La contabilidad es de partida doble, en pesos (UYU) con cuentas en dólares; el ejercicio es el año calendario. Se consulta con panorama_finanzas, estados_contables, libro_mayor_cuenta, ejecucion_presupuesto, flujo_caja, proyeccion_caja y estado_conciliacion (roles tesorero o comision_fiscal). Las cargas y correcciones se hacen en el panel /contabilidad.
- Única escritura (rol tesorero): cargar un estado de cuenta del banco. Pasos: 1) estado_conciliacion para ver la cuenta (código) y desde qué fecha va el próximo extracto; 2) transcribí TODAS las líneas (fecha, concepto, importe positivo si entra y negativo si sale, saldo si figura) y los saldos inicial y final; 3) previsualizar_extracto: si no cierra, el error suele ser tuyo al leer el extracto, releé las filas indicadas; 4) mostrale al usuario el resumen y esperá su OK; 5) importar_extracto con los mismos datos. La conciliación contra los libros se hace después en el panel.
- Cada herramienta requiere un rol (tienda, tesorero, comision_fiscal, secretaria; super_admin ve todo). Si no hay permiso, decíselo al usuario en vez de inventar datos.
- Usá "quien_soy" si no sabés qué puede consultar el usuario.
- Para preguntas generales preferí las herramientas de resumen (estado_tienda_hoy, reporte_tienda, panorama_finanzas, estados_contables, resumen_socios).
- Cuotas de socios (roles secretaria, tesorero, comision_fiscal): cobranza_socios (deuda, al día, cobrado del mes), deudores_socios (quiénes deben) y estado_cuenta_socio (por nombre, cédula o número). Las altas, cobros y cuotas se cargan en el panel, no desde acá.
- Para otros datos de tienda o socios: listar_tablas → consultar_tabla (filas) o agregar_tabla (sumas, conteos, promedios agrupados). Solo muestran las tablas del área del usuario.
- Los datos pueden incluir información personal (nombres, cédulas, teléfonos): usala solo para responder lo que te preguntan.
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
          estado_tienda_hoy: tieneRol(usuario, ROLES_REPORTES_TIENDA),
          reporte_tienda: tieneRol(usuario, ROLES_REPORTES_TIENDA),
          panorama_finanzas: tieneRol(usuario, ROLES_CONTABILIDAD),
          estados_contables: tieneRol(usuario, ROLES_CONTABILIDAD),
          libro_mayor_cuenta: tieneRol(usuario, ROLES_CONTABILIDAD),
          resumen_socios: tieneRol(usuario, ROLES_SECRETARIA),
          listar_tablas: tieneRol(usuario, ROLES_CUALQUIER_MODULO),
          consultar_tabla: tieneRol(usuario, ROLES_CUALQUIER_MODULO),
          agregar_tabla: tieneRol(usuario, ROLES_CUALQUIER_MODULO),
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
        "Foto actual de la tienda: ventas netas (a fecha contable, sin donaciones, con devoluciones) de hoy, últimos 7 días y mes en curso, " +
        "con costo y margen; pedidos pendientes por etapa (verificación, preparar, encargados, retirar); encargues cobrados pendientes de entrega (señas); " +
        "últimos 10 pedidos; top 5 productos del mes; stock bajo y agotados; control del mes contra la contabilidad. " +
        "Mismos números que el panel /admin y que reporte_tienda. Requiere rol tienda, tesorero o comision_fiscal.",
      annotations: soloLectura,
    },
    async (ctx) =>
      conRol(ctx as Ctx, ROLES_REPORTES_TIENDA, "estado_tienda_hoy", async () => {
        // La serie diaria del año es para el gráfico del panel.
        const foto = await obtenerDashboardTienda();
        return { ...foto, serie: undefined };
      })
  );

  server.registerTool(
    "reporte_tienda",
    {
      title: "Reporte de ventas de la tienda",
      description:
        "Reporte de un período: ventas netas (pedidos vendidos a su fecha contable + encargues entregados − devoluciones + cambios; sin donaciones), " +
        "costo real del kardex, margen, pedidos, ticket promedio y % de ventas a socios, cada uno comparado con el período anterior de igual largo. " +
        "Incluye ventas por canal (online, POS, disciplina), por cuenta contable (socios, no socios, disciplinas, devoluciones) y por método de pago, " +
        "top 10 productos, margen por categoría, encargues pendientes de entrega, donaciones aparte y el control contra la contabilidad " +
        "(cuentas 4.4.x y costo de ventas). Por defecto: últimos 30 días. Requiere rol tienda, tesorero o comision_fiscal.",
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
      conRol(ctx as Ctx, ROLES_REPORTES_TIENDA, "reporte_tienda", async () => {
        const rango = parseRango(paramsRango(desde, hasta));
        const { serie, ...reporte } = await generarReporteTienda(rango);
        return incluir_serie ? { ...reporte, serie } : reporte;
      })
  );

  server.registerTool(
    "panorama_finanzas",
    {
      title: "Panorama financiero",
      description:
        "Foto contable del ejercicio en curso: saldos de cajas y bancos (en pesos y en dólares), activo, pasivo, patrimonio y " +
        "superávit (déficit) del ejercicio a la fecha, ingresos y egresos por mes, deuda con proveedores según documentos, " +
        "fondos en poder de cada disciplina y última cotización BCU. Requiere rol tesorero o comision_fiscal.",
      annotations: soloLectura,
    },
    async (ctx) =>
      conRol(ctx as Ctx, ROLES_CONTABILIDAD, "panorama_finanzas", async (token) => panoramaContable(token))
  );

  server.registerTool(
    "estados_contables",
    {
      title: "Estados contables",
      description:
        "Estado de situación patrimonial (a la fecha 'hasta') y estado de resultados (de 'desde' a 'hasta') por rubros, " +
        "con terminología de asociación civil (Fondo social, superávit/déficit). Por defecto: el ejercicio en curso hasta hoy. " +
        "Requiere rol tesorero o comision_fiscal.",
      inputSchema: z.object({
        desde: fecha.describe("Inicio del estado de resultados. Por defecto el inicio del ejercicio."),
        hasta: fecha.describe("Fecha del estado de situación y fin del de resultados. Por defecto hoy."),
        nivel: z.number().int().min(1).max(5).optional().describe("Profundidad del detalle (1 = capítulos, 4 = cuentas). Por defecto 3."),
      }),
      annotations: soloLectura,
    },
    async ({ desde, hasta, nivel }, ctx) =>
      conRol(ctx as Ctx, ROLES_CONTABILIDAD, "estados_contables", async (token) =>
        estadosContables(token, desde, hasta, nivel ?? 3)
      )
  );

  server.registerTool(
    "libro_mayor_cuenta",
    {
      title: "Libro mayor de una cuenta",
      description:
        "Movimientos de una cuenta imputable del plan (por código, ej. 1.1.01.07 Banco Itaú tienda) con saldo acumulado; " +
        "en cuentas en dólares también el importe y saldo en dólares y el TC. Por defecto: el ejercicio en curso hasta hoy. " +
        "Devuelve hasta los últimos 300 movimientos. Requiere rol tesorero o comision_fiscal.",
      inputSchema: z.object({
        codigo: z.string().regex(/^[1-5](\.[0-9]{1,3})*$/, "Código de cuenta, ej. 1.1.01.05"),
        desde: fecha.describe("Inicio. Por defecto el inicio del ejercicio."),
        hasta: fecha.describe("Fin. Por defecto hoy."),
      }),
      annotations: soloLectura,
    },
    async ({ codigo, desde, hasta }, ctx) =>
      conRol(ctx as Ctx, ROLES_CONTABILIDAD, "libro_mayor_cuenta", async (token) =>
        mayorDeCuenta(token, codigo, desde, hasta)
      )
  );

  server.registerTool(
    "ejecucion_presupuesto",
    {
      title: "Presupuesto contra lo ejecutado",
      description:
        "Presupuestado, ejecutado y desvío por rubro y cuenta de ingresos y egresos, con totales y resultado, " +
        "para el presupuesto aprobado del ejercicio (o la última versión). Por defecto: el ejercicio en curso de enero al mes actual. " +
        "Requiere rol tesorero o comision_fiscal.",
      inputSchema: z.object({
        anio: z.number().int().min(2000).max(2100).optional().describe("Ejercicio (año). Por defecto el actual."),
        mes_desde: z.number().int().min(1).max(12).optional(),
        mes_hasta: z.number().int().min(1).max(12).optional(),
        nivel: z.number().int().min(1).max(5).optional().describe("Profundidad (1 = capítulos, 4 = cuentas). Por defecto 3."),
      }),
      annotations: soloLectura,
    },
    async ({ anio, mes_desde, mes_hasta, nivel }, ctx) =>
      conRol(ctx as Ctx, ROLES_CONTABILIDAD, "ejecucion_presupuesto", async (token) =>
        ejecucionDelPresupuesto(token, anio, mes_desde, mes_hasta, nivel ?? 3)
      )
  );

  server.registerTool(
    "flujo_caja",
    {
      title: "Flujo de caja real",
      description:
        "Flujo de fondos por método directo: saldo inicial de cajas y bancos, ingresos y egresos por rubro y cuenta " +
        "(contrapartida real, sin lo que no movió plata), por mes, y saldo final con control contra los libros. " +
        "Por defecto: el ejercicio en curso hasta hoy. Requiere rol tesorero o comision_fiscal.",
      inputSchema: z.object({
        desde: fecha.describe("Inicio. Por defecto el inicio del ejercicio."),
        hasta: fecha.describe("Fin. Por defecto hoy."),
      }),
      annotations: soloLectura,
    },
    async ({ desde, hasta }, ctx) =>
      conRol(ctx as Ctx, ROLES_CONTABILIDAD, "flujo_caja", async (token) => flujoDeCaja(token, desde, hasta))
  );

  server.registerTool(
    "proyeccion_caja",
    {
      title: "Proyección de caja",
      description:
        "Saldo de cajas y bancos proyectado mes a mes desde hoy con el presupuesto aprobado (o el promedio real si no hay), " +
        "con los vencimientos a proveedores como dato informativo y alerta de saldo negativo. Requiere rol tesorero o comision_fiscal.",
      inputSchema: z.object({
        horizonte: z.enum(["ejercicio", "12"]).optional().describe("Hasta fin del ejercicio (por defecto) o 12 meses."),
      }),
      annotations: soloLectura,
    },
    async ({ horizonte }, ctx) =>
      conRol(ctx as Ctx, ROLES_CONTABILIDAD, "proyeccion_caja", async (token) => proyeccionDeCaja(token, horizonte))
  );

  server.registerTool(
    "estado_conciliacion",
    {
      title: "Estado de la conciliación bancaria",
      description:
        "Por cada caja y banco: hasta qué fecha está conciliado, el último extracto cargado (período, estado, movimientos " +
        "conciliados) y desde qué fecha va el próximo. Requiere rol tesorero o comision_fiscal.",
      annotations: soloLectura,
    },
    async (ctx) =>
      conRol(ctx as Ctx, ROLES_CONTABILIDAD, "estado_conciliacion", async (token) => estadoConciliaciones(token))
  );

  const extracto = z.object({
    cuenta: z.string().regex(/^1\.1\.01\.[0-9]{2}$/, "Código de la caja o banco, ej. 1.1.01.05"),
    desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    saldo_inicial: z.number(),
    saldo_final: z.number(),
    movimientos: z
      .array(
        z.object({
          fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          concepto: z.string().min(1),
          referencia: z.string().optional(),
          importe: z.number().describe("Positivo si entra a la cuenta, negativo si sale."),
          saldo: z.number().optional().describe("Saldo que informa el banco después del movimiento, si figura."),
        })
      )
      .max(2000),
  });

  server.registerTool(
    "previsualizar_extracto",
    {
      title: "Verificar un estado de cuenta",
      description:
        "Verifica un estado de cuenta transcripto sin guardar nada: que cierre (saldo inicial + movimientos = saldo final), " +
        "que los saldos por fila coincidan y que siga al extracto anterior. Requiere rol tesorero.",
      inputSchema: extracto,
      annotations: soloLectura,
    },
    async (args, ctx) =>
      conRol(ctx as Ctx, ROLES_TESORERIA, "previsualizar_extracto", async (token) => previsualizarExtracto(token, args))
  );

  server.registerTool(
    "importar_extracto",
    {
      title: "Cargar un estado de cuenta",
      description:
        "Guarda el estado de cuenta (todo o nada) para conciliarlo en el panel. Usar solo después de previsualizar_extracto " +
        "sin problemas y con el OK del usuario. Requiere rol tesorero.",
      inputSchema: extracto,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args, ctx) =>
      conRol(ctx as Ctx, ROLES_TESORERIA, "importar_extracto", async (token) => importarExtracto(token, args))
  );

  server.registerTool(
    "cobranza_socios",
    {
      title: "Cobranza de cuotas de socios",
      description:
        "Situación de las cuotas hoy: socios vigentes, al día y fuera de tolerancia, deuda total y vencida, saldo a favor, " +
        "cobrado en el mes por medio y el último lote emitido; para tesorería y Comisión Fiscal, también el control contra la " +
        "contabilidad. Requiere rol secretaria, tesorero o comision_fiscal.",
      annotations: soloLectura,
    },
    async (ctx) =>
      conRol(ctx as Ctx, ROLES_CUOTAS, "cobranza_socios", async (token, usuario) =>
        cobranzaSocios(token, tieneRol(usuario, ROLES_CONTABILIDAD))
      )
  );

  server.registerTool(
    "deudores_socios",
    {
      title: "Socios con cuotas vencidas",
      description:
        "Personas con cuotas vencidas impagas, de mayor a menor deuda, con cuántas cuotas deben, medio de cobro y si siguen " +
        "dentro de la tolerancia. Incluye datos personales: usalos solo para lo que te preguntan. Requiere rol secretaria, " +
        "tesorero o comision_fiscal.",
      inputSchema: z.object({
        limite: z.number().int().min(1).max(500).optional().describe("Cuántos devolver (por defecto 50)."),
      }),
      annotations: soloLectura,
    },
    async ({ limite }, ctx) =>
      conRol(ctx as Ctx, ROLES_CUOTAS, "deudores_socios", async (token) => deudoresSocios(token, limite ?? 50))
  );

  server.registerTool(
    "estado_cuenta_socio",
    {
      title: "Estado de cuenta de un socio",
      description:
        "Cuotas, cobros y notas de crédito de una persona con su saldo, y su situación (deuda vencida, al día, saldo a favor). " +
        "Se busca por nombre, cédula o número de socio; si hay varias coincidencias devuelve la lista para elegir. " +
        "Requiere rol secretaria, tesorero o comision_fiscal.",
      inputSchema: z.object({
        buscar: z.string().min(2).describe("Nombre y apellido, cédula o número de socio."),
      }),
      annotations: soloLectura,
    },
    async ({ buscar }, ctx) =>
      conRol(ctx as Ctx, ROLES_CUOTAS, "estado_cuenta_socio", async (token) => estadoCuentaSocio(token, buscar))
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
    const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Error";
    console.error(`[mcp] ${herramienta} falló:`, e);
    return error(`No se pudo completar: ${msg}`);
  }
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
