import Mustache from "mustache";
import { Marked } from "marked";

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
const AMARILLO = "#f7b643";
const FONDO = "#faf8f5";
const TEXTO = "#1f1f1f";
const SECUNDARIO = "#6b7280";

export type Formato = "texto" | "html";

const marked = new Marked({
  gfm: true,
  breaks: true,
  async: false,
  renderer: {
    // Sin HTML crudo en las plantillas de texto.
    html: () => "",
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

export function molde(contenidoHtml: string, opciones: { pie?: string | null; bajaUrl?: string | null } = {}) {
  const pie = opciones.pie ? `<p style="margin:0 0 8px">${escaparHtml(opciones.pie)}</p>` : "";
  const baja = opciones.bajaUrl ? pieBaja(opciones.bajaUrl) : "";
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${FONDO};font-family:Helvetica,Arial,sans-serif;color:${TEXTO}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FONDO}">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-top:4px solid ${BORDO}">
        <tr><td style="padding:20px 28px;border-bottom:1px solid #eee">
          <span style="font-size:18px;font-weight:700;color:${BORDO};letter-spacing:0.5px">CLUB SEMINARIO</span>
          <span style="display:inline-block;width:24px;height:3px;background:${AMARILLO};vertical-align:middle;margin-left:8px"></span>
        </td></tr>
        <tr><td style="padding:24px 28px;font-size:15px;line-height:1.6">${contenidoHtml}</td></tr>
        <tr><td style="padding:16px 28px 24px;font-size:12px;line-height:1.5;color:${SECUNDARIO};border-top:1px solid #eee">
          ${pie}${baja}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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
};

export function renderPlantilla(
  plantilla: PlantillaRender,
  variables: Variables,
  opciones: { pie?: string | null; bajaUrl?: string | null } = {}
) {
  const formato: Formato = plantilla.formato === "html" ? "html" : "texto";
  const usaMolde = plantilla.usaMolde ?? true;
  const vars: Variables = { ...variables, enlace_baja: opciones.bajaUrl ?? "" };

  let html: string;
  if (formato === "texto") {
    html = molde(cuerpoTextoAHtml(plantilla.cuerpo, vars), opciones);
  } else {
    const contenido = aplicarVariables(plantilla.cuerpo, vars, true);
    if (usaMolde) {
      // Dentro del molde: si el HTML ya usa el enlace de baja, el pie no lo repite.
      const usaEnlace = analizarVariables(plantilla.cuerpo).variables.includes("enlace_baja");
      html = molde(contenido, { pie: opciones.pie, bajaUrl: usaEnlace ? null : opciones.bajaUrl });
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
