-- ============================================================
-- Comunicaciones — molde nuevo de los correos
--
-- * Molde del club: encabezado bordó con el escudo, franja tipo bufanda,
--   cuerpo, firma y pie con los datos del club (en el código; se puede
--   reemplazar desde Configuración → config.molde_html).
-- * Cada plantilla (y cada envío, que la copia) tiene su encabezado:
--   título, subtítulo, texto de vista previa y firma, con variables.
-- * Las plantillas del sistema pasan al diseño nuevo; si una ya se había
--   editado, se le respeta el texto (solo se actualiza el original).
-- ============================================================

ALTER TABLE comunicaciones.config ADD COLUMN molde_html text;
ALTER TABLE comunicaciones.plantillas
  ADD COLUMN encabezado jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(encabezado) = 'object'),
  ADD COLUMN encabezado_original jsonb;
ALTER TABLE comunicaciones.envios
  ADD COLUMN encabezado jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(encabezado) = 'object');

DROP VIEW comunicaciones.envios_resumen;
CREATE VIEW comunicaciones.envios_resumen WITH (security_invoker = true) AS
SELECT e.*,
  count(m.id) AS total,
  count(m.id) FILTER (WHERE m.estado = 'pendiente') AS pendientes,
  count(m.id) FILTER (WHERE m.estado = 'enviando') AS enviando,
  count(m.id) FILTER (WHERE m.estado = 'enviado') AS enviados,
  count(m.id) FILTER (WHERE m.estado = 'fallido') AS fallidos,
  count(m.id) FILTER (WHERE m.estado = 'omitido') AS omitidos,
  count(m.id) FILTER (WHERE m.estado = 'cancelado') AS cancelados
FROM comunicaciones.envios e
LEFT JOIN comunicaciones.mensajes m ON m.envio_id = e.id
GROUP BY e.id;
GRANT SELECT ON comunicaciones.envios_resumen TO authenticated, service_role;

CREATE OR REPLACE FUNCTION comunicaciones._plantilla_transaccional() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.transaccional AND (NOT NEW.transaccional OR NOT NEW.activa OR NEW.categoria <> 'institucional'
                            OR NEW.formato <> 'html' OR NEW.asunto_original IS DISTINCT FROM OLD.asunto_original
                            OR NEW.cuerpo_original IS DISTINCT FROM OLD.cuerpo_original
                            OR NEW.encabezado_original IS DISTINCT FROM OLD.encabezado_original) THEN
    RAISE EXCEPTION 'Los mails automáticos de la tienda y eventos solo cambian de asunto, texto, encabezado y molde';
  END IF;
  IF OLD.sistema AND (NEW.asunto_original IS DISTINCT FROM OLD.asunto_original
                      OR NEW.cuerpo_original IS DISTINCT FROM OLD.cuerpo_original
                      OR NEW.encabezado_original IS DISTINCT FROM OLD.encabezado_original) THEN
    RAISE EXCEPTION 'La versión original de una plantilla del sistema no cambia';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE comunicaciones.plantillas DISABLE TRIGGER plantillas_transaccional;
UPDATE comunicaciones.plantillas
   SET cuerpo = CASE WHEN cuerpo = cuerpo_original THEN $q$<p style="margin:0 0 18px 0;">Hola {{nombre}}: tu pedido fue confirmado. Este es el detalle:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0; border-top:1px solid #E8E4DE;">
  {{#items}}
  <tr>
    <td style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px;">{{producto}} <span style="color:#94918B;">&times; {{cantidad}}</span></td>
    <td align="right" style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px; white-space:nowrap;">{{importe}}</td>
  </tr>
  {{/items}}
  <tr>
    <td style="padding:14px 0 0 0; font-size:17px; font-weight:700; color:#730D32;">Total</td>
    <td align="right" style="padding:14px 0 0 0; font-size:17px; font-weight:700; color:#730D32; white-space:nowrap;">{{total}}</td>
  </tr>
</table>
{{#pedido_url}}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 26px 0;">
  <tr>
    <td style="background:#730D32; border-radius:10px;">
      <a href="{{pedido_url}}" target="_blank" style="display:inline-block; padding:14px 28px; font-family:'Satoshi','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:15px; font-weight:700; color:#FFFFFF; text-decoration:none;">Ver mi pedido</a>
    </td>
  </tr>
</table>
{{/pedido_url}}
<p style="margin:0 0 18px 0;">Te avisamos por correo cuando esté listo para retirar.</p>$q$ ELSE cuerpo END,
       encabezado = $q${"titulo": "¡Gracias por tu compra, {{nombre}}!", "subtitulo": "Pedido #{{numero_pedido}}", "preencabezado": "Tu pedido #{{numero_pedido}} fue confirmado.", "firma": "Gracias,\nTienda Club Seminario"}$q$::jsonb,
       cuerpo_original = $q$<p style="margin:0 0 18px 0;">Hola {{nombre}}: tu pedido fue confirmado. Este es el detalle:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0; border-top:1px solid #E8E4DE;">
  {{#items}}
  <tr>
    <td style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px;">{{producto}} <span style="color:#94918B;">&times; {{cantidad}}</span></td>
    <td align="right" style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px; white-space:nowrap;">{{importe}}</td>
  </tr>
  {{/items}}
  <tr>
    <td style="padding:14px 0 0 0; font-size:17px; font-weight:700; color:#730D32;">Total</td>
    <td align="right" style="padding:14px 0 0 0; font-size:17px; font-weight:700; color:#730D32; white-space:nowrap;">{{total}}</td>
  </tr>
</table>
{{#pedido_url}}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 26px 0;">
  <tr>
    <td style="background:#730D32; border-radius:10px;">
      <a href="{{pedido_url}}" target="_blank" style="display:inline-block; padding:14px 28px; font-family:'Satoshi','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:15px; font-weight:700; color:#FFFFFF; text-decoration:none;">Ver mi pedido</a>
    </td>
  </tr>
</table>
{{/pedido_url}}
<p style="margin:0 0 18px 0;">Te avisamos por correo cuando esté listo para retirar.</p>$q$,
       encabezado_original = $q${"titulo": "¡Gracias por tu compra, {{nombre}}!", "subtitulo": "Pedido #{{numero_pedido}}", "preencabezado": "Tu pedido #{{numero_pedido}} fue confirmado.", "firma": "Gracias,\nTienda Club Seminario"}$q$::jsonb
 WHERE clave = 'pedido_confirmacion';
UPDATE comunicaciones.plantillas
   SET cuerpo = CASE WHEN cuerpo = cuerpo_original THEN $q$<p style="margin:0 0 18px 0;">¡Gracias, {{nombre}}! Recibimos tu pedido y estamos verificando tu transferencia.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0; border-top:1px solid #E8E4DE;">
  {{#items}}
  <tr>
    <td style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px;">{{producto}} <span style="color:#94918B;">&times; {{cantidad}}</span></td>
    <td align="right" style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px; white-space:nowrap;">{{importe}}</td>
  </tr>
  {{/items}}
  {{#donacion}}
  <tr>
    <td style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px;">Donación a la Olla del Hogar de Cristo</td>
    <td align="right" style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px; white-space:nowrap;">{{donacion}}</td>
  </tr>
  {{/donacion}}
  <tr>
    <td style="padding:14px 0 0 0; font-size:17px; font-weight:700; color:#730D32;">Total</td>
    <td align="right" style="padding:14px 0 0 0; font-size:17px; font-weight:700; color:#730D32; white-space:nowrap;">{{total}}</td>
  </tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
  <tr>
    <td style="background:#FDF6E7; border-left:4px solid #F7B643; border-radius:8px; padding:16px 18px; font-size:15px; line-height:23px;">
      <strong>Tu transferencia está siendo verificada.</strong><br>Te avisamos por correo cuando la confirmemos.
    </td>
  </tr>
</table>
{{#pedido_url}}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 26px 0;">
  <tr>
    <td style="background:#730D32; border-radius:10px;">
      <a href="{{pedido_url}}" target="_blank" style="display:inline-block; padding:14px 28px; font-family:'Satoshi','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:15px; font-weight:700; color:#FFFFFF; text-decoration:none;">Ver mi pedido</a>
    </td>
  </tr>
</table>
{{/pedido_url}}
<p style="margin:0 0 18px 0;">Si tenés alguna consulta, respondé este correo.</p>$q$ ELSE cuerpo END,
       encabezado = $q${"titulo": "Recibimos tu pedido", "subtitulo": "Pedido #{{numero_pedido}}", "preencabezado": "Estamos verificando la transferencia de tu pedido #{{numero_pedido}}.", "firma": "Gracias,\nTienda Club Seminario"}$q$::jsonb,
       cuerpo_original = $q$<p style="margin:0 0 18px 0;">¡Gracias, {{nombre}}! Recibimos tu pedido y estamos verificando tu transferencia.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0; border-top:1px solid #E8E4DE;">
  {{#items}}
  <tr>
    <td style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px;">{{producto}} <span style="color:#94918B;">&times; {{cantidad}}</span></td>
    <td align="right" style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px; white-space:nowrap;">{{importe}}</td>
  </tr>
  {{/items}}
  {{#donacion}}
  <tr>
    <td style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px;">Donación a la Olla del Hogar de Cristo</td>
    <td align="right" style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px; white-space:nowrap;">{{donacion}}</td>
  </tr>
  {{/donacion}}
  <tr>
    <td style="padding:14px 0 0 0; font-size:17px; font-weight:700; color:#730D32;">Total</td>
    <td align="right" style="padding:14px 0 0 0; font-size:17px; font-weight:700; color:#730D32; white-space:nowrap;">{{total}}</td>
  </tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
  <tr>
    <td style="background:#FDF6E7; border-left:4px solid #F7B643; border-radius:8px; padding:16px 18px; font-size:15px; line-height:23px;">
      <strong>Tu transferencia está siendo verificada.</strong><br>Te avisamos por correo cuando la confirmemos.
    </td>
  </tr>
</table>
{{#pedido_url}}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 26px 0;">
  <tr>
    <td style="background:#730D32; border-radius:10px;">
      <a href="{{pedido_url}}" target="_blank" style="display:inline-block; padding:14px 28px; font-family:'Satoshi','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:15px; font-weight:700; color:#FFFFFF; text-decoration:none;">Ver mi pedido</a>
    </td>
  </tr>
</table>
{{/pedido_url}}
<p style="margin:0 0 18px 0;">Si tenés alguna consulta, respondé este correo.</p>$q$,
       encabezado_original = $q${"titulo": "Recibimos tu pedido", "subtitulo": "Pedido #{{numero_pedido}}", "preencabezado": "Estamos verificando la transferencia de tu pedido #{{numero_pedido}}.", "firma": "Gracias,\nTienda Club Seminario"}$q$::jsonb
 WHERE clave = 'pedido_verificacion';
UPDATE comunicaciones.plantillas
   SET cuerpo = CASE WHEN cuerpo = cuerpo_original THEN $q$<p style="margin:0 0 18px 0;">Hola {{nombre}}: tu pedido ya está listo para retirar en el club.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
  <tr>
    <td style="background:#FAF8F5; border-left:4px solid #E8E4DE; border-radius:8px; padding:16px 18px; font-size:15px; line-height:23px;">
      <strong>Lugar de retiro:</strong> Sede Club Seminario (Soriano 1472, Montevideo — Colegio Seminario)<br><strong>Horario:</strong> martes, jueves y viernes de 12:30 a 15:30
    </td>
  </tr>
</table>
<p style="margin:0 0 18px 0;">¿Necesitás envío? Escribinos por WhatsApp al <a href="https://wa.me/59891965438" style="color:#730D32; font-weight:700; text-decoration:none;">+598 91 965 438</a>.</p>
{{#pedido_url}}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 26px 0;">
  <tr>
    <td style="background:#730D32; border-radius:10px;">
      <a href="{{pedido_url}}" target="_blank" style="display:inline-block; padding:14px 28px; font-family:'Satoshi','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:15px; font-weight:700; color:#FFFFFF; text-decoration:none;">Ver detalles del pedido</a>
    </td>
  </tr>
</table>
{{/pedido_url}}$q$ ELSE cuerpo END,
       encabezado = $q${"titulo": "¡Tu pedido está listo!", "subtitulo": "Pedido #{{numero_pedido}}", "preencabezado": "Ya podés retirar tu pedido en el club.", "firma": "Te esperamos,\nTienda Club Seminario"}$q$::jsonb,
       cuerpo_original = $q$<p style="margin:0 0 18px 0;">Hola {{nombre}}: tu pedido ya está listo para retirar en el club.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
  <tr>
    <td style="background:#FAF8F5; border-left:4px solid #E8E4DE; border-radius:8px; padding:16px 18px; font-size:15px; line-height:23px;">
      <strong>Lugar de retiro:</strong> Sede Club Seminario (Soriano 1472, Montevideo — Colegio Seminario)<br><strong>Horario:</strong> martes, jueves y viernes de 12:30 a 15:30
    </td>
  </tr>
</table>
<p style="margin:0 0 18px 0;">¿Necesitás envío? Escribinos por WhatsApp al <a href="https://wa.me/59891965438" style="color:#730D32; font-weight:700; text-decoration:none;">+598 91 965 438</a>.</p>
{{#pedido_url}}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 26px 0;">
  <tr>
    <td style="background:#730D32; border-radius:10px;">
      <a href="{{pedido_url}}" target="_blank" style="display:inline-block; padding:14px 28px; font-family:'Satoshi','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:15px; font-weight:700; color:#FFFFFF; text-decoration:none;">Ver detalles del pedido</a>
    </td>
  </tr>
</table>
{{/pedido_url}}$q$,
       encabezado_original = $q${"titulo": "¡Tu pedido está listo!", "subtitulo": "Pedido #{{numero_pedido}}", "preencabezado": "Ya podés retirar tu pedido en el club.", "firma": "Te esperamos,\nTienda Club Seminario"}$q$::jsonb
 WHERE clave = 'pedido_listo';
UPDATE comunicaciones.plantillas
   SET cuerpo = CASE WHEN cuerpo = cuerpo_original THEN $q$<p style="margin:0 0 18px 0;">Hola {{nombre}}: tu pedido #{{numero_pedido}} fue cancelado.</p>
{{#motivo}}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
  <tr>
    <td style="background:#FAF8F5; border-left:4px solid #E8E4DE; border-radius:8px; padding:16px 18px; font-size:15px; line-height:23px;">
      <strong>Motivo:</strong> {{motivo}}
    </td>
  </tr>
</table>
{{/motivo}}
<p style="margin:0 0 18px 0;">Si tenés alguna consulta, respondé este correo.</p>$q$ ELSE cuerpo END,
       encabezado = $q${"titulo": "Pedido cancelado", "subtitulo": "Pedido #{{numero_pedido}}", "preencabezado": "Tu pedido #{{numero_pedido}} fue cancelado.", "firma": "Saludos,\nTienda Club Seminario"}$q$::jsonb,
       cuerpo_original = $q$<p style="margin:0 0 18px 0;">Hola {{nombre}}: tu pedido #{{numero_pedido}} fue cancelado.</p>
{{#motivo}}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
  <tr>
    <td style="background:#FAF8F5; border-left:4px solid #E8E4DE; border-radius:8px; padding:16px 18px; font-size:15px; line-height:23px;">
      <strong>Motivo:</strong> {{motivo}}
    </td>
  </tr>
</table>
{{/motivo}}
<p style="margin:0 0 18px 0;">Si tenés alguna consulta, respondé este correo.</p>$q$,
       encabezado_original = $q${"titulo": "Pedido cancelado", "subtitulo": "Pedido #{{numero_pedido}}", "preencabezado": "Tu pedido #{{numero_pedido}} fue cancelado.", "firma": "Saludos,\nTienda Club Seminario"}$q$::jsonb
 WHERE clave = 'pedido_cancelado';
UPDATE comunicaciones.plantillas
   SET cuerpo = CASE WHEN cuerpo = cuerpo_original THEN $q$<p style="margin:0 0 18px 0;">Hola {{nombre}}: ya tenés tus entradas.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0; border-top:1px solid #E8E4DE;">
  <tr>
    <td style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px;"><strong>Evento</strong></td>
    <td align="right" style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px; white-space:nowrap;">{{evento}}</td>
  </tr>
  <tr>
    <td style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px;"><strong>Entrada</strong></td>
    <td align="right" style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px; white-space:nowrap;">{{tipo_entrada}} &times; {{cantidad}}</td>
  </tr>
  {{#total}}
  <tr>
    <td style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px;"><strong>Total</strong></td>
    <td align="right" style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px; white-space:nowrap;">{{total}}</td>
  </tr>
  {{/total}}
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
  <tr>
    <td style="background:#FDF6E7; border-left:4px solid #F7B643; border-radius:8px; padding:16px 18px; font-size:15px; line-height:23px;">
      📎 Adjuntamos <strong>{{cantidad_texto}}</strong> en PDF con tu código QR.<br>Presentalo en la entrada del evento.
    </td>
  </tr>
</table>
{{#evento_url}}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 26px 0;">
  <tr>
    <td style="background:#730D32; border-radius:10px;">
      <a href="{{evento_url}}" target="_blank" style="display:inline-block; padding:14px 28px; font-family:'Satoshi','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:15px; font-weight:700; color:#FFFFFF; text-decoration:none;">Ver el evento</a>
    </td>
  </tr>
</table>
{{/evento_url}}$q$ ELSE cuerpo END,
       encabezado = $q${"titulo": "¡Tus entradas están confirmadas!", "subtitulo": "{{evento}}", "preencabezado": "Adjuntamos tus entradas con código QR para {{evento}}.", "firma": "¡Te esperamos!\nClub Seminario"}$q$::jsonb,
       cuerpo_original = $q$<p style="margin:0 0 18px 0;">Hola {{nombre}}: ya tenés tus entradas.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0; border-top:1px solid #E8E4DE;">
  <tr>
    <td style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px;"><strong>Evento</strong></td>
    <td align="right" style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px; white-space:nowrap;">{{evento}}</td>
  </tr>
  <tr>
    <td style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px;"><strong>Entrada</strong></td>
    <td align="right" style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px; white-space:nowrap;">{{tipo_entrada}} &times; {{cantidad}}</td>
  </tr>
  {{#total}}
  <tr>
    <td style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px;"><strong>Total</strong></td>
    <td align="right" style="padding:12px 0; border-bottom:1px solid #E8E4DE; font-size:15px; line-height:22px; white-space:nowrap;">{{total}}</td>
  </tr>
  {{/total}}
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
  <tr>
    <td style="background:#FDF6E7; border-left:4px solid #F7B643; border-radius:8px; padding:16px 18px; font-size:15px; line-height:23px;">
      📎 Adjuntamos <strong>{{cantidad_texto}}</strong> en PDF con tu código QR.<br>Presentalo en la entrada del evento.
    </td>
  </tr>
</table>
{{#evento_url}}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 26px 0;">
  <tr>
    <td style="background:#730D32; border-radius:10px;">
      <a href="{{evento_url}}" target="_blank" style="display:inline-block; padding:14px 28px; font-family:'Satoshi','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:15px; font-weight:700; color:#FFFFFF; text-decoration:none;">Ver el evento</a>
    </td>
  </tr>
</table>
{{/evento_url}}$q$,
       encabezado_original = $q${"titulo": "¡Tus entradas están confirmadas!", "subtitulo": "{{evento}}", "preencabezado": "Adjuntamos tus entradas con código QR para {{evento}}.", "firma": "¡Te esperamos!\nClub Seminario"}$q$::jsonb
 WHERE clave = 'entradas';
UPDATE comunicaciones.plantillas
   SET cuerpo = CASE WHEN cuerpo = cuerpo_original THEN $q$<p style="margin:0 0 18px 0;">{{mensaje}}</p>
{{#cta_url}}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 26px 0;">
  <tr>
    <td style="background:#730D32; border-radius:10px;">
      <a href="{{cta_url}}" target="_blank" style="display:inline-block; padding:14px 28px; font-family:'Satoshi','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:15px; font-weight:700; color:#FFFFFF; text-decoration:none;">{{cta_texto}}</a>
    </td>
  </tr>
</table>
{{/cta_url}}$q$ ELSE cuerpo END,
       encabezado = $q${"titulo": "{{titulo}}"}$q$::jsonb,
       cuerpo_original = $q$<p style="margin:0 0 18px 0;">{{mensaje}}</p>
{{#cta_url}}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 26px 0;">
  <tr>
    <td style="background:#730D32; border-radius:10px;">
      <a href="{{cta_url}}" target="_blank" style="display:inline-block; padding:14px 28px; font-family:'Satoshi','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:15px; font-weight:700; color:#FFFFFF; text-decoration:none;">{{cta_texto}}</a>
    </td>
  </tr>
</table>
{{/cta_url}}$q$,
       encabezado_original = $q${"titulo": "{{titulo}}"}$q$::jsonb
 WHERE clave = 'notificacion';
UPDATE comunicaciones.plantillas
   SET cuerpo = CASE WHEN cuerpo = cuerpo_original THEN $q$Hola {{nombre}}:

Te damos la bienvenida como socio/a de Club Seminario. Tu número de socio es **{{numero_socio}}**.

Desde [tu cuenta](https://www.clubseminario.com.uy/mi-cuenta) podés ver tu carnet y tus cuotas.

¡Nos vemos en el club!$q$ ELSE cuerpo END,
       encabezado = $q${"titulo": "¡Bienvenido/a, {{nombre}}!", "subtitulo": "{{#numero_socio}}Socio/a N.º {{numero_socio}}{{/numero_socio}}", "preencabezado": "Ya sos parte de Club Seminario.", "firma": "Un abrazo grande,\nComisión Directiva de Club Seminario"}$q$::jsonb,
       cuerpo_original = $q$Hola {{nombre}}:

Te damos la bienvenida como socio/a de Club Seminario. Tu número de socio es **{{numero_socio}}**.

Desde [tu cuenta](https://www.clubseminario.com.uy/mi-cuenta) podés ver tu carnet y tus cuotas.

¡Nos vemos en el club!$q$,
       encabezado_original = $q${"titulo": "¡Bienvenido/a, {{nombre}}!", "subtitulo": "{{#numero_socio}}Socio/a N.º {{numero_socio}}{{/numero_socio}}", "preencabezado": "Ya sos parte de Club Seminario.", "firma": "Un abrazo grande,\nComisión Directiva de Club Seminario"}$q$::jsonb
 WHERE clave = 'bienvenida';
UPDATE comunicaciones.plantillas
   SET cuerpo = CASE WHEN cuerpo = cuerpo_original THEN $q$Hola {{nombre}}:

Te recordamos que tenés **{{cuotas_vencidas}} cuota(s) vencida(s)** por un total de **{{deuda_vencida}}**.

Si ya pagaste, desestimá este mensaje. Ante cualquier duda, respondé este correo.$q$ ELSE cuerpo END,
       encabezado = $q${"titulo": "Tenés cuotas pendientes", "subtitulo": "{{#numero_socio}}Socio/a N.º {{numero_socio}}{{/numero_socio}}", "preencabezado": "Te recordamos que tenés {{cuotas_vencidas}} cuota(s) vencida(s).", "firma": "Saludos,\nTesorería de Club Seminario"}$q$::jsonb,
       cuerpo_original = $q$Hola {{nombre}}:

Te recordamos que tenés **{{cuotas_vencidas}} cuota(s) vencida(s)** por un total de **{{deuda_vencida}}**.

Si ya pagaste, desestimá este mensaje. Ante cualquier duda, respondé este correo.$q$,
       encabezado_original = $q${"titulo": "Tenés cuotas pendientes", "subtitulo": "{{#numero_socio}}Socio/a N.º {{numero_socio}}{{/numero_socio}}", "preencabezado": "Te recordamos que tenés {{cuotas_vencidas}} cuota(s) vencida(s).", "firma": "Saludos,\nTesorería de Club Seminario"}$q$::jsonb
 WHERE clave = 'cuota_vencida';
UPDATE comunicaciones.plantillas
   SET cuerpo = CASE WHEN cuerpo = cuerpo_original THEN $q$Hola {{nombre}}:

Todo Club Seminario te desea un muy feliz cumpleaños. 🎉$q$ ELSE cuerpo END,
       encabezado = $q${"titulo": "¡Feliz cumpleaños, {{nombre}}!", "subtitulo": "{{#numero_socio}}Socio/a N.º {{numero_socio}}{{/numero_socio}}", "preencabezado": "Todo Club Seminario te desea un muy feliz cumpleaños 🎉", "firma": "Un abrazo grande,\nComisión Directiva de Club Seminario"}$q$::jsonb,
       cuerpo_original = $q$Hola {{nombre}}:

Todo Club Seminario te desea un muy feliz cumpleaños. 🎉$q$,
       encabezado_original = $q${"titulo": "¡Feliz cumpleaños, {{nombre}}!", "subtitulo": "{{#numero_socio}}Socio/a N.º {{numero_socio}}{{/numero_socio}}", "preencabezado": "Todo Club Seminario te desea un muy feliz cumpleaños 🎉", "firma": "Un abrazo grande,\nComisión Directiva de Club Seminario"}$q$::jsonb
 WHERE clave = 'cumpleanos';
ALTER TABLE comunicaciones.plantillas ENABLE TRIGGER plantillas_transaccional;

DROP FUNCTION comunicaciones.crear_envio(text, text, text, text, jsonb, uuid, jsonb, text, boolean);
DROP FUNCTION comunicaciones._encolar(text, text, text, text, jsonb, text, boolean, timestamptz, uuid, jsonb, text, boolean);

CREATE FUNCTION comunicaciones._encolar(
  p_nombre text, p_categoria text, p_asunto text, p_cuerpo text, p_destinatarios jsonb,
  p_origen text, p_aprobado boolean, p_programado_para timestamptz DEFAULT NULL,
  p_plantilla uuid DEFAULT NULL, p_audiencia jsonb DEFAULT NULL,
  p_formato text DEFAULT 'texto', p_usa_molde boolean DEFAULT true, p_encabezado jsonb DEFAULT '{}'
) RETURNS uuid
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_categoria NOT IN ('institucional', 'difusion') THEN
    RAISE EXCEPTION 'Categoría inválida';
  END IF;
  IF nullif(btrim(p_asunto), '') IS NULL THEN
    RAISE EXCEPTION 'Falta el asunto';
  END IF;
  IF p_formato NOT IN ('texto', 'html') THEN
    RAISE EXCEPTION 'Formato inválido';
  END IF;
  INSERT INTO comunicaciones.envios (nombre, categoria, plantilla_id, asunto, cuerpo, audiencia, estado,
                                     programado_para, origen, aprobado_por, aprobado_at, formato, usa_molde, encabezado)
  VALUES (coalesce(nullif(btrim(p_nombre), ''), btrim(p_asunto)), p_categoria, p_plantilla, btrim(p_asunto), p_cuerpo,
          p_audiencia, CASE WHEN p_aprobado THEN 'aprobado' ELSE 'borrador' END, coalesce(p_programado_para, now()),
          p_origen, CASE WHEN p_aprobado THEN contabilidad._usuario() END, CASE WHEN p_aprobado THEN now() END,
          p_formato, coalesce(p_usa_molde, true), coalesce(p_encabezado, '{}'))
  RETURNING id INTO v_id;

  INSERT INTO comunicaciones.mensajes (envio_id, categoria, persona_id, perfil_id, email, nombre, variables, html,
                                       ref_tipo, ref_id, dedupe_key, estado, motivo_omision)
  SELECT DISTINCT ON (d.email) v_id, p_categoria, d.persona_id, d.perfil_id, d.email, d.nombre, d.variables, d.html,
         d.ref_tipo, d.ref_id,
         CASE WHEN NOT d.duplicado THEN d.dedupe_key END,
         CASE WHEN d.motivo IS NULL THEN 'pendiente' ELSE 'omitido' END, d.motivo
  FROM (
    SELECT e.*, x.duplicado,
      CASE
        WHEN e.email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN 'Dirección inválida'
        WHEN comunicaciones.suprimido(e.email, p_categoria) THEN 'Dada de baja'
        WHEN x.duplicado THEN 'Ya se le envió (' || e.dedupe_key || ')'
      END AS motivo
    FROM (
      SELECT lower(btrim(coalesce(r ->> 'email', ''))) AS email, nullif(btrim(r ->> 'nombre'), '') AS nombre,
             (r ->> 'persona_id')::integer AS persona_id, (r ->> 'perfil_id')::uuid AS perfil_id,
             coalesce(r -> 'variables', '{}'::jsonb) AS variables, r ->> 'html' AS html,
             nullif(r ->> 'dedupe_key', '') AS dedupe_key, r ->> 'ref_tipo' AS ref_tipo, r ->> 'ref_id' AS ref_id
      FROM jsonb_array_elements(coalesce(p_destinatarios, '[]')) r
    ) e
    CROSS JOIN LATERAL (SELECT e.dedupe_key IS NOT NULL AND EXISTS (
      SELECT 1 FROM comunicaciones.mensajes m WHERE m.dedupe_key = e.dedupe_key AND m.estado <> 'cancelado') AS duplicado) x
    WHERE e.email <> ''
  ) d
  ORDER BY d.email, d.motivo NULLS FIRST;
  RETURN v_id;
END;
$$;

CREATE FUNCTION comunicaciones.crear_envio(
  p_nombre text, p_categoria text, p_asunto text, p_cuerpo text, p_destinatarios jsonb,
  p_plantilla uuid DEFAULT NULL, p_audiencia jsonb DEFAULT NULL,
  p_formato text DEFAULT 'texto', p_usa_molde boolean DEFAULT true, p_encabezado jsonb DEFAULT '{}'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM comunicaciones._exigir_gestion();
  IF nullif(btrim(p_cuerpo), '') IS NULL THEN
    RAISE EXCEPTION 'Falta el texto del mensaje';
  END IF;
  RETURN comunicaciones._encolar(p_nombre, p_categoria, p_asunto, p_cuerpo, p_destinatarios, 'manual', false,
                                 NULL, p_plantilla, p_audiencia, p_formato, p_usa_molde, p_encabezado);
END;
$$;

CREATE OR REPLACE FUNCTION comunicaciones.correr_automatizacion(p_clave text, p_periodo text, p_filtro jsonb, p_dedupe_prefijo text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_a comunicaciones.automatizaciones;
  v_p comunicaciones.plantillas;
  v_dest jsonb;
  v_envio uuid;
BEGIN
  PERFORM comunicaciones._exigir_gestion();
  SELECT * INTO v_a FROM comunicaciones.automatizaciones WHERE clave = p_clave;
  IF v_a.clave IS NULL OR NOT v_a.activa THEN
    RETURN NULL;
  END IF;
  -- Una corrida por período; si su envío se canceló, se puede volver a correr.
  PERFORM pg_advisory_xact_lock(hashtext('comunicaciones.corrida:' || p_clave || ':' || p_periodo));
  IF EXISTS (SELECT 1 FROM comunicaciones.corridas c JOIN comunicaciones.envios e ON e.id = c.envio_id
             WHERE c.clave = p_clave AND c.periodo = p_periodo AND e.estado <> 'cancelado') THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_p FROM comunicaciones.plantillas WHERE clave = v_a.plantilla_clave AND activa;
  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'La plantilla "%" no está activa', v_a.plantilla_clave;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('email', a.email, 'nombre', a.nombre, 'persona_id', a.persona_id,
           'perfil_id', a.perfil_id, 'variables', a.variables,
           'dedupe_key', p_dedupe_prefijo || ':' || a.persona_id)), '[]')
  INTO v_dest FROM comunicaciones.audiencia_socios(p_filtro) a
  WHERE NOT EXISTS (SELECT 1 FROM comunicaciones.mensajes m
                    WHERE m.dedupe_key = p_dedupe_prefijo || ':' || a.persona_id AND m.estado <> 'cancelado');
  IF jsonb_array_length(v_dest) = 0 THEN
    RETURN NULL;
  END IF;
  v_envio := comunicaciones._encolar(v_a.nombre || ' — ' || p_periodo, v_p.categoria, v_p.asunto, v_p.cuerpo, v_dest,
                                     'automatizacion', v_a.modo = 'auto', NULL, v_p.id, p_filtro,
                                     v_p.formato, v_p.usa_molde, v_p.encabezado);
  -- Sin destinatarios no queda registrada: puede volver a correr ese día.
  INSERT INTO comunicaciones.corridas (clave, periodo, envio_id, cantidad)
  VALUES (p_clave, p_periodo, v_envio, jsonb_array_length(v_dest))
  ON CONFLICT (clave, periodo) DO UPDATE SET envio_id = EXCLUDED.envio_id, cantidad = EXCLUDED.cantidad,
                                             created_at = now();
  RETURN v_envio;
END;
$$;

REVOKE EXECUTE ON FUNCTION comunicaciones._encolar(text, text, text, text, jsonb, text, boolean, timestamptz, uuid, jsonb, text, boolean, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION comunicaciones.crear_envio(text, text, text, text, jsonb, uuid, jsonb, text, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION comunicaciones.crear_envio(text, text, text, text, jsonb, uuid, jsonb, text, boolean, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION comunicaciones._encolar(text, text, text, text, jsonb, text, boolean, timestamptz, uuid, jsonb, text, boolean, jsonb)
  TO service_role;
