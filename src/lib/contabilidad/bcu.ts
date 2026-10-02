/**
 * Cliente del web service SOAP oficial del Banco Central del Uruguay.
 *
 * - awsbcucotizaciones: cotizaciones de cierre por rango de fechas.
 * - awsultimocierre: fecha del último cierre publicado.
 *
 * El BCU publica el cierre del día D al final del día D. Para el dólar
 * (código 2225, "DLS. USA BILLETE") TCC = TCV: es el interbancario único.
 *
 * Respuesta real (2/10/2026), resumida:
 *   <SOAP-ENV:Envelope …><SOAP-ENV:Body>
 *     <wsbcucotizaciones.ExecuteResponse xmlns="Cotiza"><Salida xmlns="Cotiza">
 *       <respuestastatus><status>1</status><codigoerror>0</codigoerror><mensaje/></respuestastatus>
 *       <datoscotizaciones>
 *         <datoscotizaciones.dato xmlns="Cotiza">
 *           <Fecha>2026-10-01</Fecha><Moneda>2225</Moneda><Nombre>DLS. USA BILLETE</Nombre>
 *           <CodigoISO>DLS.</CodigoISO><Emisor>ESTADOS UNIDOS</Emisor>
 *           <TCC>40.463000</TCC><TCV>40.463000</TCV><ArbAct>1.000000</ArbAct><FormaArbitrar>0</FormaArbitrar>
 *         </datoscotizaciones.dato> …
 * Errores (siempre HTTP 200, status 0 + un "dato" vacío con Fecha xsi:nil):
 *   100 "No existe cotización para la fecha indicada" (fin de semana, feriado, día sin publicar)
 *   102 "Campo de fecha inválida" · 103 "Fecha Hasta es menor que Fecha Desde"
 * Un pedido mal formado devuelve un Envelope vacío, también con HTTP 200.
 *
 * Solo para el servidor (Server Actions y cron). No hay DOMParser: se
 * parsea con expresiones regulares tolerantes a prefijos de namespace.
 */
import { hoyUruguay } from "./formato";
import type { ContabilidadClient, createContabilidadAdminClient } from "./server";

const URL_COTIZACIONES = "https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsbcucotizaciones";
const URL_ULTIMO_CIERRE = "https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsultimocierre";
const TIMEOUT_MS = 15_000;

/** Código BCU del dólar estadounidense billete (interbancario). */
export const BCU_DOLAR = 2225;

/** Sin cotización en el rango pedido: no es un error, es un día no hábil. */
const BCU_SIN_DATOS = "100";

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export class BcuError extends Error {
  constructor(message: string, readonly codigo?: string) {
    super(message);
    this.name = "BcuError";
  }
}

export type CotizacionBcu = { fecha: string; tasa: number };

// ------------------------------------------------------------
// Transporte SOAP
// ------------------------------------------------------------

function sobre(cuerpo: string): string {
  return (
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cot="Cotiza">' +
    `<soapenv:Body>${cuerpo}</soapenv:Body></soapenv:Envelope>`
  );
}

async function llamarSoap(url: string, accion: string, cuerpo: string): Promise<string> {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${accion}"`,
      },
      body: sobre(cuerpo),
      cache: "no-store",
      signal: controlador.signal,
    });
  } catch (e) {
    if (controlador.signal.aborted) {
      throw new BcuError(`El BCU no respondió en ${TIMEOUT_MS / 1000} segundos`);
    }
    const detalle = e instanceof Error ? e.message : String(e);
    throw new BcuError(`No se pudo conectar con el BCU (${detalle})`);
  } finally {
    clearTimeout(temporizador);
  }

  const texto = await respuesta.text().catch(() => "");
  if (!respuesta.ok) {
    throw new BcuError(`El BCU respondió con error HTTP ${respuesta.status}`);
  }
  const falla = etiqueta(texto, "faultstring");
  if (falla !== null) {
    throw new BcuError(`El BCU devolvió un error SOAP: ${falla || "sin detalle"}`);
  }
  return texto;
}

// ------------------------------------------------------------
// Parseo
// ------------------------------------------------------------

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Abre `<nombre …` o `<ns:nombre …` (atributos opcionales, sin consumir el
 * `/` de un `<x/>`), sin confundir `dato` con `dato.algo`. Lo que sigue tiene
 * que ser `>` o `/>`.
 */
function apertura(nombre: string): string {
  return `<(?:[\\w.-]+:)?${escaparRegex(nombre)}(?:\\s[^>]*?)?`;
}

function cierre(nombre: string): string {
  return `</(?:[\\w.-]+:)?${escaparRegex(nombre)}\\s*>`;
}

/** Contenido (sin espacios alrededor) del primer elemento `nombre`; "" si es `<x/>`; null si no está. */
function etiqueta(xml: string, nombre: string): string | null {
  const re = new RegExp(`${apertura(nombre)}(?:\\/>|>([\\s\\S]*?)${cierre(nombre)})`);
  const m = re.exec(xml);
  if (!m) return null;
  return decodificar((m[1] ?? "").trim());
}

/** Contenido de todos los elementos `nombre`. */
function elementos(xml: string, nombre: string): string[] {
  const re = new RegExp(`${apertura(nombre)}>([\\s\\S]*?)${cierre(nombre)}`, "g");
  return Array.from(xml.matchAll(re), (m) => m[1]);
}

function decodificar(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

function salida(xml: string): string {
  const s = elementos(xml, "Salida")[0];
  if (s === undefined) {
    throw new BcuError("Respuesta inesperada del BCU (sin datos de salida)");
  }
  return s;
}

// ------------------------------------------------------------
// API
// ------------------------------------------------------------

/**
 * Cotizaciones de cierre del BCU entre dos fechas (inclusive), ordenadas por fecha.
 * Devuelve [] si en el rango no hay días con cotización (fin de semana, feriado,
 * o el cierre de hoy todavía no se publicó).
 */
export async function obtenerCotizacionesBcu(
  desde: string,
  hasta: string,
  codigoBcu: number = BCU_DOLAR
): Promise<CotizacionBcu[]> {
  if (!FECHA_ISO.test(desde) || !FECHA_ISO.test(hasta)) {
    throw new BcuError("Las fechas tienen que tener formato AAAA-MM-DD");
  }
  if (hasta < desde) {
    throw new BcuError("La fecha hasta es anterior a la fecha desde");
  }
  if (!Number.isInteger(codigoBcu) || codigoBcu <= 0) {
    throw new BcuError("Código de moneda BCU inválido");
  }

  const xml = await llamarSoap(
    URL_COTIZACIONES,
    "Cotizaaction/AWSBCUCOTIZACIONES.Execute",
    "<cot:wsbcucotizaciones.Execute><cot:Entrada>" +
      `<cot:Moneda><cot:item>${codigoBcu}</cot:item></cot:Moneda>` +
      `<cot:FechaDesde>${desde}</cot:FechaDesde><cot:FechaHasta>${hasta}</cot:FechaHasta>` +
      "<cot:Grupo>0</cot:Grupo>" +
      "</cot:Entrada></cot:wsbcucotizaciones.Execute>"
  );

  const out = salida(xml);
  const estado = etiqueta(out, "respuestastatus");
  const status = estado !== null ? etiqueta(estado, "status") : null;
  if (status === null) {
    throw new BcuError("Respuesta inesperada del BCU (sin estado)");
  }
  if (status !== "1") {
    const codigo = (estado && etiqueta(estado, "codigoerror")) || undefined;
    if (codigo === BCU_SIN_DATOS) return [];
    const mensaje = (estado && etiqueta(estado, "mensaje")) || "error sin detalle";
    throw new BcuError(`El BCU rechazó la consulta: ${mensaje}${codigo ? ` (código ${codigo})` : ""}`, codigo);
  }

  const porFecha = new Map<string, number>();
  for (const dato of elementos(out, "datoscotizaciones.dato")) {
    const fecha = etiqueta(dato, "Fecha") ?? "";
    const moneda = Number(etiqueta(dato, "Moneda"));
    const tcc = Number(etiqueta(dato, "TCC"));
    const tcv = Number(etiqueta(dato, "TCV"));
    if (!FECHA_ISO.test(fecha) || moneda !== codigoBcu) continue;
    // Para el dólar interbancario TCC = TCV. Si alguna vez difieren, promedio.
    const tasa =
      Number.isFinite(tcc) && tcc > 0 && Number.isFinite(tcv) && tcv > 0
        ? (tcc + tcv) / 2
        : Number.isFinite(tcv) && tcv > 0
          ? tcv
          : Number.isFinite(tcc) && tcc > 0
            ? tcc
            : NaN;
    if (!Number.isFinite(tasa)) continue;
    porFecha.set(fecha, Math.round(tasa * 1e6) / 1e6);
  }

  return Array.from(porFecha, ([fecha, tasa]) => ({ fecha, tasa })).sort((a, b) =>
    a.fecha.localeCompare(b.fecha)
  );
}

/** Fecha ("YYYY-MM-DD") del último cierre publicado por el BCU. */
export async function ultimoCierreBcu(): Promise<string> {
  const xml = await llamarSoap(
    URL_ULTIMO_CIERRE,
    "Cotizaaction/AWSULTIMOCIERRE.Execute",
    "<cot:wsultimocierre.Execute/>"
  );
  const fecha = etiqueta(salida(xml), "Fecha");
  if (!fecha || !FECHA_ISO.test(fecha)) {
    throw new BcuError("Respuesta inesperada del BCU (fecha de último cierre)");
  }
  return fecha;
}

// ------------------------------------------------------------
// Sincronización con la base
// ------------------------------------------------------------

type ClienteContabilidad =
  | ContabilidadClient
  | ReturnType<typeof createContabilidadAdminClient>;

export type ResultadoSincronizacion = {
  /** Cotizaciones nuevas o corregidas en la base (las que ya estaban iguales no cuentan). */
  registradas: number;
  /** Cotizaciones que devolvió el BCU en el rango. */
  recibidas: number;
  desde: string;
  hasta: string;
  /** Última cotización publicada en el rango. */
  ultima: CotizacionBcu | null;
};

function restarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - dias)).toISOString().slice(0, 10);
}

/**
 * Trae del BCU los últimos `dias` días (hasta hoy, hora de Uruguay) y los
 * registra como fuente "bcu". Idempotente: la base hace upsert, una BCU pisa
 * a una manual y nunca al revés. Solo llama a la base por las que faltan o
 * cambiaron.
 */
export async function sincronizarCotizacionesBcu(
  cliente: ClienteContabilidad,
  dias = 10
): Promise<ResultadoSincronizacion> {
  const n = Math.min(Math.max(Math.trunc(dias), 1), 366);
  const hasta = hoyUruguay();
  const desde = restarDias(hasta, n);

  const cotizaciones = await obtenerCotizacionesBcu(desde, hasta, BCU_DOLAR);
  const resultado: ResultadoSincronizacion = {
    registradas: 0,
    recibidas: cotizaciones.length,
    desde,
    hasta,
    ultima: cotizaciones.at(-1) ?? null,
  };
  if (cotizaciones.length === 0) return resultado;

  // Las dos variantes del cliente comparten la API; se usa la del usuario
  // como tipo común para no pelear con uniones de firmas genéricas.
  const db = cliente as ContabilidadClient;

  const { data: existentes, error: errorLectura } = await db
    .from("cotizaciones")
    .select("fecha, tasa, fuente")
    .eq("moneda", "USD")
    .gte("fecha", desde)
    .lte("fecha", hasta);
  if (errorLectura) {
    throw new Error(`No se pudieron leer las cotizaciones: ${errorLectura.message}`);
  }
  const actuales = new Map((existentes ?? []).map((c) => [c.fecha, c]));

  for (const c of cotizaciones) {
    const actual = actuales.get(c.fecha);
    if (actual && actual.fuente === "bcu" && Number(actual.tasa) === c.tasa) continue;
    const { error } = await db.rpc("registrar_cotizacion", {
      p_moneda: "USD",
      p_fecha: c.fecha,
      p_tasa: c.tasa,
      p_fuente: "bcu",
    });
    if (error) {
      throw new Error(`No se pudo registrar la cotización del ${c.fecha}: ${error.message}`);
    }
    resultado.registradas++;
  }

  return resultado;
}
