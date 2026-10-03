/**
 * Molde de todos los correos del club (encabezado bordó con el escudo,
 * franja tipo bufanda, cuerpo, firma y pie con los datos del club). Es una
 * plantilla Mustache: se puede reemplazar desde Comunicaciones →
 * Configuración (config.molde_html); este es el original.
 *
 * Datos que recibe:
 *   {{titulo}}         encabezado grande (por defecto, el asunto)
 *   {{subtitulo}}      línea dorada bajo el título (opcional)
 *   {{preencabezado}}  texto de vista previa en la bandeja (opcional)
 *   {{{contenido}}}    el mensaje ya armado
 *   {{#firma}}…{{/firma}} con {{saludo}} y {{firmante}} (opcional)
 *   {{pie}}            línea extra del pie (Configuración)
 *   {{enlace_baja}}    solo en difusión
 * más todos los datos del destinatario ({{nombre}}, {{numero_socio}}…).
 */
export const MOLDE_ORIGINAL = `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>{{titulo}}</title>
  <!-- Mismas tipografías que clubseminario.com.uy (Fontshare).
       Apple Mail, iPhone y Thunderbird las muestran; Gmail y Outlook usan la alternativa (Helvetica/Arial). -->
  <link href="https://api.fontshare.com/v2/css?f[]=clash-display@600,700&f[]=satoshi@400,500,700&display=swap" rel="stylesheet">
  <style>
    body { margin:0; padding:0; background:#FAF8F5; }
    a { color:#730D32; }
    @media only screen and (max-width:620px) {
      .container { width:100% !important; border-radius:0 !important; border-left:0 !important; border-right:0 !important; }
      .pad { padding-left:24px !important; padding-right:24px !important; }
      .titulo { font-size:34px !important; line-height:38px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background:#FAF8F5;">

  {{#preencabezado}}
  <!-- Texto de vista previa en la bandeja de entrada -->
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:#FAF8F5; font-size:1px; line-height:1px;">
    {{preencabezado}}
  </div>
  {{/preencabezado}}

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF8F5;">
    <tr>
      <td align="center" style="padding:32px 12px;">

        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background:#FFFFFF; border:1px solid #E8E4DE; border-radius:16px; overflow:hidden;">

          <!-- ENCABEZADO BORDÓ CON ESCUDO -->
          <tr>
            <td class="pad" align="center" style="background:#730D32; padding:40px 44px 44px 44px;">
              <a href="https://www.clubseminario.com.uy" style="text-decoration:none;">
                <img src="https://www.clubseminario.com.uy/images/escudo/logo-cs.png" width="96" height="96" alt="Escudo Club Seminario" style="display:block; margin:0 auto; width:96px; height:96px; border:0; outline:none;">
              </a>
              <h1 class="titulo" style="margin:28px 0 0 0; font-family:'Clash Display','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:40px; line-height:44px; font-weight:700; color:#FFFFFF; letter-spacing:-0.5px;">
                {{titulo}}
              </h1>
              {{#subtitulo}}
              <p style="margin:14px 0 0 0; font-family:'Satoshi','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:14px; line-height:20px; font-weight:500; color:#F7B643;">
                {{subtitulo}}
              </p>
              {{/subtitulo}}
            </td>
          </tr>

          <!-- FRANJA TIPO BUFANDA (bordó y dorado del club) -->
          <tr>
            <td style="padding:0; font-size:0; line-height:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="140" height="12" style="background:#F7B643; font-size:0; line-height:0;">&nbsp;</td>
                  <td width="20"  height="12" style="background:#730D32; font-size:0; line-height:0;">&nbsp;</td>
                  <td width="20"  height="12" style="background:#F7B643; font-size:0; line-height:0;">&nbsp;</td>
                  <td width="20"  height="12" style="background:#730D32; font-size:0; line-height:0;">&nbsp;</td>
                  <td width="200" height="12" style="background:#F7B643; font-size:0; line-height:0;">&nbsp;</td>
                  <td width="20"  height="12" style="background:#730D32; font-size:0; line-height:0;">&nbsp;</td>
                  <td width="20"  height="12" style="background:#F7B643; font-size:0; line-height:0;">&nbsp;</td>
                  <td width="20"  height="12" style="background:#730D32; font-size:0; line-height:0;">&nbsp;</td>
                  <td width="140" height="12" style="background:#F7B643; font-size:0; line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CUERPO DEL MENSAJE -->
          <tr>
            <td class="pad" style="padding:40px 44px {{#firma}}8px{{/firma}}{{^firma}}36px{{/firma}} 44px; font-family:'Satoshi','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:17px; line-height:27px; color:#1F1F1F;">
              {{{contenido}}}
            </td>
          </tr>

          {{#firma}}
          <!-- FIRMA -->
          <tr>
            <td class="pad" style="padding:8px 44px 44px 44px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="4" style="background:#F7B643; font-size:0; line-height:0;">&nbsp;</td>
                  <td style="padding:2px 0 2px 16px; font-family:'Satoshi','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:16px; line-height:24px; color:#1F1F1F;">
                    {{#saludo}}{{saludo}}<br>{{/saludo}}
                    <strong style="font-weight:700; color:#730D32;">{{firmante}}</strong>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          {{/firma}}

          <!-- PIE (datos de contacto del sitio) -->
          <tr>
            <td class="pad" style="background:#F5F2ED; border-top:1px solid #E8E4DE; padding:24px 44px 28px 44px; font-family:'Satoshi','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:13px; line-height:20px; color:#94918B;">
              <p style="margin:0 0 10px 0; color:#730D32; font-weight:700;">Club Seminario, desde 2010</p>
              <p style="margin:0 0 10px 0;">
                Soriano 1472, Montevideo<br>
                <a href="mailto:secretaria@clubseminario.com.uy" style="color:#94918B; text-decoration:underline;">secretaria@clubseminario.com.uy</a><br>
                <a href="tel:+59891965438" style="color:#94918B; text-decoration:none;">+598 91 965 438</a>
              </p>
              <p style="margin:0 0 14px 0;">
                <a href="https://www.clubseminario.com.uy" style="color:#730D32; font-weight:700; text-decoration:none;">clubseminario.com.uy</a>
                &nbsp;&nbsp;&nbsp;
                <a href="https://www.instagram.com/club.seminario" style="color:#730D32; font-weight:700; text-decoration:none;">Instagram</a>
                &nbsp;&nbsp;&nbsp;
                <a href="https://www.facebook.com/clubseminario" style="color:#730D32; font-weight:700; text-decoration:none;">Facebook</a>
              </p>
              {{#pie}}
              <p style="margin:0 0 6px 0; font-size:12px; line-height:18px;">{{pie}}</p>
              {{/pie}}
              {{#enlace_baja}}
              <p style="margin:0; font-size:12px; line-height:18px;">Recibís este correo por ser socio/a de Club Seminario. Si no querés recibir más novedades, <a href="{{enlace_baja}}" style="color:#94918B; text-decoration:underline;">date de baja acá</a>.</p>
              {{/enlace_baja}}
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;

/** Datos del molde que vienen de cada plantilla (o envío). */
export type Encabezado = {
  titulo?: string | null;
  subtitulo?: string | null;
  preencabezado?: string | null;
  /** Una o dos líneas: "Un abrazo grande,\nComisión Directiva". La última va destacada. */
  firma?: string | null;
};

/** "Un abrazo grande,\nComisión Directiva" → { saludo, firmante }. */
export function partirFirma(firma: string | null | undefined): { saludo: string; firmante: string } | null {
  const lineas = (firma ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (lineas.length === 0) return null;
  return { saludo: lineas.slice(0, -1).join(" "), firmante: lineas[lineas.length - 1] };
}
