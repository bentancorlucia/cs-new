import { Marked } from "marked";

/**
 * Arma un mail a partir de una plantilla: variables {{nombre}}, texto con
 * formato simple (párrafos, **negrita**, [enlaces](url), listas) y el molde
 * del club. El HTML que escriba la persona se descarta: solo formato.
 */

const BORDO = "#730d32";
const AMARILLO = "#f7b643";
const FONDO = "#faf8f5";
const TEXTO = "#1f1f1f";
const SECUNDARIO = "#6b7280";

const marked = new Marked({
  gfm: true,
  breaks: true,
  async: false,
  renderer: {
    // Sin HTML crudo en las plantillas.
    html: () => "",
    link({ href, tokens }) {
      const texto = this.parser.parseInline(tokens);
      const seguro = /^(https?:|mailto:|tel:)/i.test(href) ? href : "#";
      return `<a href="${escaparAtributo(seguro)}" style="color:${BORDO};font-weight:600">${texto}</a>`;
    },
  },
});

export type Variables = Record<string, string | number | null | undefined>;

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

/** Reemplaza {{variable}}; las que faltan quedan vacías. */
export function aplicarVariables(texto: string, variables: Variables, escapar = false) {
  return texto.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, clave: string) => {
    const valor = variables[clave];
    const s = valor === null || valor === undefined ? "" : String(valor);
    return escapar ? escaparHtml(s) : s;
  });
}

/** Variables usadas en un texto (para validar plantillas). */
export function variablesUsadas(texto: string) {
  return [...new Set([...texto.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]))];
}

function cuerpoAHtml(cuerpo: string, variables: Variables) {
  // Las variables se escapan antes del formato para que un dato no meta HTML.
  return marked.parse(aplicarVariables(cuerpo, variables, true)) as string;
}

function cuerpoATexto(cuerpo: string, variables: Variables) {
  return aplicarVariables(cuerpo, variables)
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
}

export function molde(contenidoHtml: string, opciones: { pie?: string | null; bajaUrl?: string | null } = {}) {
  const pie = opciones.pie ? `<p style="margin:0 0 8px">${escaparHtml(opciones.pie)}</p>` : "";
  const baja = opciones.bajaUrl
    ? `<p style="margin:0">Si no querés recibir más estos correos, <a href="${escaparAtributo(opciones.bajaUrl)}" style="color:${SECUNDARIO}">date de baja acá</a>.</p>`
    : "";
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

export function renderPlantilla(
  plantilla: { asunto: string; cuerpo: string },
  variables: Variables,
  opciones: { pie?: string | null; bajaUrl?: string | null } = {}
) {
  return {
    asunto: aplicarVariables(plantilla.asunto, variables).replace(/\s+/g, " ").trim(),
    html: molde(cuerpoAHtml(plantilla.cuerpo, variables), opciones),
    texto:
      cuerpoATexto(plantilla.cuerpo, variables) +
      (opciones.bajaUrl ? `\n\n—\nPara darte de baja: ${opciones.bajaUrl}` : ""),
  };
}
