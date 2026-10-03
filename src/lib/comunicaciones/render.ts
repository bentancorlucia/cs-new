import Mustache from "mustache";
import { Marked } from "marked";
import { MOLDE_ORIGINAL, partirFirma, type Encabezado } from "./molde";

/**
 * Arma un mail a partir de una plantilla. Dos formatos:
 *   - "texto": párrafos, **negrita**, [enlaces](url) y listas dentro del
 *     molde del club. El HTML que se escriba se descarta.
 *   - "html": el HTML tal cual, dentro del molde (usaMolde) o como
 *     documento completo.
 * Variables con Mustache en los dos: {{dato}} (escapado), {{{dato}}} (sin
 * escapar), {{#lista}}…{{/lista}}, {{#dato}}…{{/dato}} (solo si hay dato) y
 * {{^dato}}…{{/dato}} (solo si no hay). En difusión siempre está
 * {{enlace_baja}}; si un HTML completo no lo usa, se agrega un pie con él.
 */

const BORDO = "#730d32";
const SECUNDARIO = "#6b7280";

export type Formato = "texto" | "html";

const marked = new Marked({
  gfm: true,
  breaks: true,
  async: false,
  renderer: {
    // Sin HTML crudo en las plantillas de texto.
    html: () => "",
    paragraph({ tokens }) {
      return `<p style="margin:0 0 18px 0;">${this.parser.parseInline(tokens)}</p>\n`;
    },
    link({ href, tokens }) {
      const texto = this.parser.parseInline(tokens);
      const seguro = /^(https?:|mailto:|tel:)/i.test(href) ? href : "#";
      return `<a href="${escaparAtributo(seguro)}" style="color:${BORDO};font-weight:600">${texto}</a>`;
    },
  },
});

export type Variables = Record<string, unknown>;

function escaparHtml(texto: string) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escaparAtributo(texto: string) {
  return escaparHtml(texto).replace(/'/g, "&#39;");
}

const sinEscapar = (s: unknown) => String(s);

/** Reemplaza las variables. `escapar` = HTML (cuerpo); sin escapar = texto plano (asunto). */
export function aplicarVariables(texto: string, variables: Variables, escapar = false) {
  return Mustache.render(texto, variables, {}, escapar ? undefined : { escape: sinEscapar });
}

/**
 * Variables que usa un texto (con las secciones que las rodean) y el error
 * de sintaxis si lo hay, por ejemplo una sección sin cerrar.
 */
export function analizarVariables(
  ...textos: string[]
): { variables: string[]; usos: { nombre: string; secciones: string[] }[]; error: string | null } {
  const usos: { nombre: string; secciones: string[] }[] = [];
  const recorrer = (tokens: Mustache.TemplateSpans, secciones: string[]) => {
    for (const t of tokens) {
      const [tipo, nombre, , , hijos] = t as [string, string, number, number, Mustache.TemplateSpans?];
      if (tipo === "name" || tipo === "&" || tipo === "{") {
        if (nombre !== ".") usos.push({ nombre, secciones });
      } else if (tipo === "#" || tipo === "^") {
        usos.push({ nombre, secciones });
        if (hijos) recorrer(hijos, tipo === "#" ? [...secciones, nombre] : secciones);
      }
    }
  };
  let error: string | null = null;
  for (const texto of textos) {
    try {
      recorrer(Mustache.parse(texto), []);
    } catch (e) {
      error ??= traducirError(e);
    }
  }
  return { variables: [...new Set(usos.map((u) => u.nombre))], usos, error };
}

/**
 * Variables que no existen: `conocidas` incluye las de las listas como
 * "items.producto". Adentro de {{#items}} vale "producto" o cualquier
 * variable general.
 */
export function variablesDesconocidas(conocidas: Iterable<string>, ...textos: string[]) {
  const c = new Set([...conocidas, "enlace_baja"]);
  const { usos } = analizarVariables(...textos);
  const fuera = usos.filter(
    (u) => !c.has(u.nombre) && !u.secciones.some((s) => c.has(`${s}.${u.nombre}`))
  );
  return [...new Set(fuera.map((u) => u.nombre))];
}

/** Compatibilidad: solo los nombres. */
export function variablesUsadas(texto: string) {
  return analizarVariables(texto).variables;
}

function traducirError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  const sinCerrar = m.match(/Unclosed section "([^"]+)"/);
  if (sinCerrar) return `Falta cerrar {{/${sinCerrar[1]}}}`;
  const deMas = m.match(/Unopened section "([^"]+)"/);
  if (deMas) return `{{/${deMas[1]}}} cierra una sección que no se abrió`;
  const distinto = m.match(/Unclosed section "([^"]+)" at/);
  if (distinto) return `La sección {{#${distinto[1]}}} no está bien cerrada`;
  if (/Unclosed tag/.test(m)) return "Hay unas llaves {{ sin cerrar }}";
  return `Error en las variables: ${m}`;
}

function cuerpoTextoAHtml(cuerpo: string, variables: Variables) {
  // Las variables se escapan antes del formato para que un dato no meta HTML.
  return marked.parse(aplicarVariables(cuerpo, variables, true)) as string;
}

function cuerpoATexto(cuerpo: string, variables: Variables, formato: Formato) {
  const t = aplicarVariables(cuerpo, variables);
  if (formato === "html") {
    return t
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|tr|li|table)>/gi, "\n")
      .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&times;/g, "×")
      .replace(/&mdash;/g, "—")
      .replace(/&amp;/g, "&")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n\s*\n+/g, "\n\n")
      .trim();
  }
  return t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
}

function pieBaja(bajaUrl: string) {
  return `<p style="margin:0">Si no querés recibir más estos correos, <a href="${escaparAtributo(bajaUrl)}" style="color:${SECUNDARIO}">date de baja acá</a>.</p>`;
}

export type OpcionesMolde = {
  pie?: string | null;
  bajaUrl?: string | null;
  /** Molde propio de Configuración; sin él (o si falla), el original. */
  moldeHtml?: string | null;
};

/**
 * Pone el contenido dentro del molde del club. Título, subtítulo, vista
 * previa y firma pueden tener variables ({{nombre}}).
 */
export function molde(
  contenidoHtml: string,
  opciones: OpcionesMolde & { encabezado?: Encabezado | null; asunto?: string; variables?: Variables } = {}
) {
  const vars = opciones.variables ?? {};
  const enc = opciones.encabezado ?? {};
  const texto = (t: string | null | undefined) => (t ? aplicarVariables(t, vars).trim() : "");
  const datos = {
    ...vars,
    titulo: texto(enc.titulo) || texto(opciones.asunto) || "Club Seminario",
    subtitulo: texto(enc.subtitulo),
    preencabezado: texto(enc.preencabezado),
    firma: partirFirma(texto(enc.firma)),
    contenido: contenidoHtml,
    pie: opciones.pie?.trim() || "",
    enlace_baja: opciones.bajaUrl ?? "",
  };
  if (opciones.moldeHtml?.trim()) {
    try {
      return Mustache.render(opciones.moldeHtml, datos);
    } catch {
      // Un molde propio roto no deja a nadie sin mail: va el original.
    }
  }
  return Mustache.render(MOLDE_ORIGINAL, datos);
}

/** Un HTML completo de difusión que no usa {{enlace_baja}} recibe el pie de baja. */
function asegurarBaja(html: string, usaEnlace: boolean, bajaUrl: string | null | undefined) {
  if (!bajaUrl || usaEnlace) return html;
  const pie = `<div style="padding:16px;font-size:12px;color:${SECUNDARIO};text-align:center;font-family:Helvetica,Arial,sans-serif">${pieBaja(bajaUrl)}</div>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${pie}</body>`) : html + pie;
}

export type PlantillaRender = {
  asunto: string;
  cuerpo: string;
  formato?: Formato | string | null;
  usaMolde?: boolean | null;
  encabezado?: Encabezado | null;
};

export function renderPlantilla(
  plantilla: PlantillaRender,
  variables: Variables,
  opciones: OpcionesMolde = {}
) {
  const formato: Formato = plantilla.formato === "html" ? "html" : "texto";
  const usaMolde = plantilla.usaMolde ?? true;
  const vars: Variables = { ...variables, enlace_baja: opciones.bajaUrl ?? "" };

  const enMolde = (contenido: string, bajaUrl: string | null | undefined) =>
    molde(contenido, {
      ...opciones,
      bajaUrl,
      encabezado: plantilla.encabezado,
      asunto: plantilla.asunto,
      variables: vars,
    });

  let html: string;
  if (formato === "texto") {
    html = enMolde(cuerpoTextoAHtml(plantilla.cuerpo, vars), opciones.bajaUrl);
  } else {
    const contenido = aplicarVariables(plantilla.cuerpo, vars, true);
    if (usaMolde) {
      // Dentro del molde: si el HTML ya usa el enlace de baja, el pie no lo repite.
      const usaEnlace = analizarVariables(plantilla.cuerpo).variables.includes("enlace_baja");
      html = enMolde(contenido, usaEnlace ? null : opciones.bajaUrl);
    } else {
      html = asegurarBaja(
        contenido,
        analizarVariables(plantilla.cuerpo).variables.includes("enlace_baja"),
        opciones.bajaUrl
      );
    }
  }

  return {
    asunto: aplicarVariables(plantilla.asunto, vars).replace(/\s+/g, " ").trim(),
    html,
    texto:
      cuerpoATexto(plantilla.cuerpo, vars, formato) +
      (opciones.bajaUrl ? `\n\n—\nPara darte de baja: ${opciones.bajaUrl}` : ""),
  };
}
