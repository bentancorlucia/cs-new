-- ============================================================
-- Comunicaciones — plantillas en HTML y mails transaccionales editables
--
-- * Formato por plantilla: 'texto' (párrafos, **negrita**, enlaces, como
--   hasta ahora) o 'html'. En HTML, usa_molde decide si va dentro del molde
--   del club (encabezado y pie) o es el documento completo.
-- * Variables con Mustache: {{dato}} (escapado), {{{dato}}} (sin escapar),
--   {{#lista}}…{{/lista}} y {{#dato}}…{{/dato}} (solo si hay dato).
-- * Los mails de tienda y entradas pasan a ser plantillas del sistema
--   "transaccionales": editables, siempre activas, institucionales y con
--   su versión original guardada para restaurarla. Si una falla al
--   armarse, el sitio usa la versión de siempre (nadie se queda sin mail).
-- * El envío guarda el formato y el molde de su plantilla (las plantillas
--   pueden cambiar después).
-- ============================================================

ALTER TABLE comunicaciones.plantillas
  ADD COLUMN formato text NOT NULL DEFAULT 'texto' CHECK (formato IN ('texto', 'html')),
  ADD COLUMN usa_molde boolean NOT NULL DEFAULT true,
  ADD COLUMN transaccional boolean NOT NULL DEFAULT false,
  ADD COLUMN asunto_original text,
  ADD COLUMN cuerpo_original text,
  ADD CONSTRAINT plantillas_transaccional CHECK (
    NOT transaccional OR (sistema AND activa AND categoria = 'institucional' AND formato = 'html'
                          AND asunto_original IS NOT NULL AND cuerpo_original IS NOT NULL));

ALTER TABLE comunicaciones.envios
  ADD COLUMN formato text NOT NULL DEFAULT 'texto' CHECK (formato IN ('texto', 'html')),
  ADD COLUMN usa_molde boolean NOT NULL DEFAULT true;

-- La vista del resumen de envíos se armó con e.*: se recrea para que
-- incluya las columnas nuevas.
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

-- Las originales se guardan también para las plantillas del sistema de
-- texto (bienvenida, cuotas, cumpleaños): se pueden restaurar.
UPDATE comunicaciones.plantillas SET asunto_original = asunto, cuerpo_original = cuerpo WHERE sistema;

CREATE FUNCTION comunicaciones._plantilla_transaccional() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.transaccional AND (NOT NEW.transaccional OR NOT NEW.activa OR NEW.categoria <> 'institucional'
                            OR NEW.formato <> 'html' OR NEW.asunto_original IS DISTINCT FROM OLD.asunto_original
                            OR NEW.cuerpo_original IS DISTINCT FROM OLD.cuerpo_original) THEN
    RAISE EXCEPTION 'Los mails automáticos de la tienda y eventos solo cambian de asunto, texto y molde';
  END IF;
  IF OLD.sistema AND (NEW.asunto_original IS DISTINCT FROM OLD.asunto_original
                      OR NEW.cuerpo_original IS DISTINCT FROM OLD.cuerpo_original) THEN
    RAISE EXCEPTION 'La versión original de una plantilla del sistema no cambia';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER plantillas_transaccional BEFORE UPDATE ON comunicaciones.plantillas
  FOR EACH ROW EXECUTE FUNCTION comunicaciones._plantilla_transaccional();

INSERT INTO comunicaciones.plantillas (clave, nombre, categoria, asunto, cuerpo, sistema, formato, usa_molde,
  transaccional, asunto_original, cuerpo_original) VALUES
('pedido_confirmacion', 'Tienda: compra confirmada', 'institucional', $a$Confirmación de compra — Pedido #{{numero_pedido}}$a$, $h$
<h2 style="margin:0 0 8px;font-size:20px;color:#730d32;">Confirmación de compra</h2>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;">¡Gracias, {{nombre}}! Tu pedido fue confirmado.</p>
<p style="margin:0 0 16px;font-size:14px;color:#1f1f1f;"><strong>Pedido:</strong> #{{numero_pedido}}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
  {{#items}}
  <tr>
    <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#1f1f1f;">{{producto}} &times; {{cantidad}}</td>
    <td align="right" style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#1f1f1f;">{{importe}}</td>
  </tr>
  {{/items}}
  <tr>
    <td style="padding:12px 0 0;font-size:16px;font-weight:700;color:#730d32;">Total</td>
    <td align="right" style="padding:12px 0 0;font-size:16px;font-weight:700;color:#730d32;">{{total}}</td>
  </tr>
</table>
{{#pedido_url}}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
  <tr>
    <td align="center" style="background:#730d32;border-radius:8px;">
      <a href="{{pedido_url}}" target="_blank" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Ver mi pedido</a>
    </td>
  </tr>
</table>
{{/pedido_url}}
<p style="margin:24px 0 0;font-size:13px;color:#6b7280;text-align:center;">Te avisaremos cuando tu pedido esté listo para retirar.</p>
$h$, true, 'html', true, true, $a$Confirmación de compra — Pedido #{{numero_pedido}}$a$, $h$
<h2 style="margin:0 0 8px;font-size:20px;color:#730d32;">Confirmación de compra</h2>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;">¡Gracias, {{nombre}}! Tu pedido fue confirmado.</p>
<p style="margin:0 0 16px;font-size:14px;color:#1f1f1f;"><strong>Pedido:</strong> #{{numero_pedido}}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
  {{#items}}
  <tr>
    <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#1f1f1f;">{{producto}} &times; {{cantidad}}</td>
    <td align="right" style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#1f1f1f;">{{importe}}</td>
  </tr>
  {{/items}}
  <tr>
    <td style="padding:12px 0 0;font-size:16px;font-weight:700;color:#730d32;">Total</td>
    <td align="right" style="padding:12px 0 0;font-size:16px;font-weight:700;color:#730d32;">{{total}}</td>
  </tr>
</table>
{{#pedido_url}}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
  <tr>
    <td align="center" style="background:#730d32;border-radius:8px;">
      <a href="{{pedido_url}}" target="_blank" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Ver mi pedido</a>
    </td>
  </tr>
</table>
{{/pedido_url}}
<p style="margin:24px 0 0;font-size:13px;color:#6b7280;text-align:center;">Te avisaremos cuando tu pedido esté listo para retirar.</p>
$h$),
('pedido_verificacion', 'Tienda: transferencia a verificar', 'institucional', $a$Pedido #{{numero_pedido}} — Verificación de transferencia pendiente$a$, $h$
<h2 style="margin:0 0 8px;font-size:20px;color:#730d32;">Pedido recibido — Verificación pendiente</h2>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;">¡Gracias, {{nombre}}! Recibimos tu pedido y estamos verificando tu transferencia.</p>
<p style="margin:0 0 16px;font-size:14px;color:#1f1f1f;"><strong>Pedido:</strong> #{{numero_pedido}}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
  {{#items}}
  <tr>
    <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#1f1f1f;">{{producto}} &times; {{cantidad}}</td>
    <td align="right" style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#1f1f1f;">{{importe}}</td>
  </tr>
  {{/items}}
  {{#donacion}}
  <tr>
    <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#1f1f1f;">Donación a la Olla del Hogar de Cristo</td>
    <td align="right" style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#1f1f1f;">{{donacion}}</td>
  </tr>
  {{/donacion}}
  <tr>
    <td style="padding:12px 0 0;font-size:16px;font-weight:700;color:#730d32;">Total</td>
    <td align="right" style="padding:12px 0 0;font-size:16px;font-weight:700;color:#730d32;">{{total}}</td>
  </tr>
</table>
<div style="background:#FEF3C7;border-left:4px solid #f7b643;border-radius:8px;padding:16px;margin-bottom:16px;">
  <p style="margin:0;font-size:14px;color:#1f1f1f;"><strong>Tu transferencia está siendo verificada.</strong><br/>Te notificaremos por email cuando sea confirmada.</p>
</div>
{{#pedido_url}}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
  <tr>
    <td align="center" style="background:#730d32;border-radius:8px;">
      <a href="{{pedido_url}}" target="_blank" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Ver mi pedido</a>
    </td>
  </tr>
</table>
{{/pedido_url}}
<p style="margin:24px 0 0;font-size:13px;color:#6b7280;text-align:center;">Si tenés alguna consulta, escribinos a clubseminario.com.uy.</p>
$h$, true, 'html', true, true, $a$Pedido #{{numero_pedido}} — Verificación de transferencia pendiente$a$, $h$
<h2 style="margin:0 0 8px;font-size:20px;color:#730d32;">Pedido recibido — Verificación pendiente</h2>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;">¡Gracias, {{nombre}}! Recibimos tu pedido y estamos verificando tu transferencia.</p>
<p style="margin:0 0 16px;font-size:14px;color:#1f1f1f;"><strong>Pedido:</strong> #{{numero_pedido}}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
  {{#items}}
  <tr>
    <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#1f1f1f;">{{producto}} &times; {{cantidad}}</td>
    <td align="right" style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#1f1f1f;">{{importe}}</td>
  </tr>
  {{/items}}
  {{#donacion}}
  <tr>
    <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#1f1f1f;">Donación a la Olla del Hogar de Cristo</td>
    <td align="right" style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#1f1f1f;">{{donacion}}</td>
  </tr>
  {{/donacion}}
  <tr>
    <td style="padding:12px 0 0;font-size:16px;font-weight:700;color:#730d32;">Total</td>
    <td align="right" style="padding:12px 0 0;font-size:16px;font-weight:700;color:#730d32;">{{total}}</td>
  </tr>
</table>
<div style="background:#FEF3C7;border-left:4px solid #f7b643;border-radius:8px;padding:16px;margin-bottom:16px;">
  <p style="margin:0;font-size:14px;color:#1f1f1f;"><strong>Tu transferencia está siendo verificada.</strong><br/>Te notificaremos por email cuando sea confirmada.</p>
</div>
{{#pedido_url}}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
  <tr>
    <td align="center" style="background:#730d32;border-radius:8px;">
      <a href="{{pedido_url}}" target="_blank" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Ver mi pedido</a>
    </td>
  </tr>
</table>
{{/pedido_url}}
<p style="margin:24px 0 0;font-size:13px;color:#6b7280;text-align:center;">Si tenés alguna consulta, escribinos a clubseminario.com.uy.</p>
$h$),
('pedido_listo', 'Tienda: pedido listo para retirar', 'institucional', $a$Tu pedido #{{numero_pedido}} está listo para retirar$a$, $h$
<h2 style="margin:0 0 8px;font-size:20px;color:#730d32;">Tu pedido está listo</h2>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;">¡Hola, {{nombre}}! Tu pedido #{{numero_pedido}} está listo para retirar en el club.</p>
<div style="background:#faf8f5;border-radius:8px;padding:16px;margin-bottom:16px;">
  <p style="margin:0;font-size:14px;color:#1f1f1f;"><strong>Lugar de retiro:</strong> Sede Club Seminario (Soriano 1472, Montevideo — Colegio Seminario)<br/><strong>Horario:</strong> Martes, Jueves y Viernes de 12:30 a 15:30 hs</p>
</div>
<p style="margin:0 0 16px;font-size:13px;color:#6b7280;">¿Necesitás envío? Contactanos al <a href="https://wa.me/59891498409" style="color:#730d32;text-decoration:none;font-weight:600;">+598 91 965 438</a>.</p>
{{#pedido_url}}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
  <tr>
    <td align="center" style="background:#730d32;border-radius:8px;">
      <a href="{{pedido_url}}" target="_blank" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Ver detalles del pedido</a>
    </td>
  </tr>
</table>
{{/pedido_url}}
$h$, true, 'html', true, true, $a$Tu pedido #{{numero_pedido}} está listo para retirar$a$, $h$
<h2 style="margin:0 0 8px;font-size:20px;color:#730d32;">Tu pedido está listo</h2>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;">¡Hola, {{nombre}}! Tu pedido #{{numero_pedido}} está listo para retirar en el club.</p>
<div style="background:#faf8f5;border-radius:8px;padding:16px;margin-bottom:16px;">
  <p style="margin:0;font-size:14px;color:#1f1f1f;"><strong>Lugar de retiro:</strong> Sede Club Seminario (Soriano 1472, Montevideo — Colegio Seminario)<br/><strong>Horario:</strong> Martes, Jueves y Viernes de 12:30 a 15:30 hs</p>
</div>
<p style="margin:0 0 16px;font-size:13px;color:#6b7280;">¿Necesitás envío? Contactanos al <a href="https://wa.me/59891498409" style="color:#730d32;text-decoration:none;font-weight:600;">+598 91 965 438</a>.</p>
{{#pedido_url}}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
  <tr>
    <td align="center" style="background:#730d32;border-radius:8px;">
      <a href="{{pedido_url}}" target="_blank" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Ver detalles del pedido</a>
    </td>
  </tr>
</table>
{{/pedido_url}}
$h$),
('pedido_cancelado', 'Tienda: pedido cancelado', 'institucional', $a$Tu pedido #{{numero_pedido}} fue cancelado$a$, $h$
<h2 style="margin:0 0 8px;font-size:20px;color:#730d32;">Pedido cancelado</h2>
<p style="margin:0 0 16px;font-size:14px;color:#6b7280;">Hola, {{nombre}}. Tu pedido #{{numero_pedido}} fue cancelado.</p>
{{#motivo}}
<div style="background:#faf8f5;border-radius:8px;padding:16px;margin-bottom:16px;">
  <p style="margin:0;font-size:14px;color:#1f1f1f;"><strong>Motivo:</strong> {{motivo}}</p>
</div>
{{/motivo}}
<p style="margin:0;font-size:13px;color:#6b7280;text-align:center;">Si tenés alguna consulta, escribinos a clubseminario.com.uy.</p>
$h$, true, 'html', true, true, $a$Tu pedido #{{numero_pedido}} fue cancelado$a$, $h$
<h2 style="margin:0 0 8px;font-size:20px;color:#730d32;">Pedido cancelado</h2>
<p style="margin:0 0 16px;font-size:14px;color:#6b7280;">Hola, {{nombre}}. Tu pedido #{{numero_pedido}} fue cancelado.</p>
{{#motivo}}
<div style="background:#faf8f5;border-radius:8px;padding:16px;margin-bottom:16px;">
  <p style="margin:0;font-size:14px;color:#1f1f1f;"><strong>Motivo:</strong> {{motivo}}</p>
</div>
{{/motivo}}
<p style="margin:0;font-size:13px;color:#6b7280;text-align:center;">Si tenés alguna consulta, escribinos a clubseminario.com.uy.</p>
$h$),
('entradas', 'Eventos: entradas confirmadas', 'institucional', $a$Tus entradas para {{evento}}$a$, $h$
<h2 style="margin:0 0 8px;font-size:20px;color:#730d32;">Tus entradas están confirmadas</h2>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;">¡Hola, {{nombre}}! Ya tenés tus entradas para el evento.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
  <tr><td style="padding:4px 0;font-size:14px;color:#1f1f1f;"><strong>Evento:</strong> {{evento}}</td></tr>
  <tr><td style="padding:4px 0;font-size:14px;color:#1f1f1f;"><strong>Tipo:</strong> {{tipo_entrada}} &times; {{cantidad}}</td></tr>
  {{#total}}
  <tr><td style="padding:4px 0;font-size:14px;color:#1f1f1f;"><strong>Total:</strong> {{total}}</td></tr>
  {{/total}}
</table>
<div style="background:#faf8f5;border-radius:8px;padding:20px;margin-bottom:24px;text-align:center;">
  <p style="margin:0 0 4px;font-size:14px;color:#1f1f1f;">📎 Adjuntamos <strong>{{cantidad_texto}}</strong> en PDF con tu código QR.</p>
  <p style="margin:0;font-size:13px;color:#6b7280;">Presentá el QR en la entrada del evento.</p>
</div>
{{#evento_url}}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
  <tr>
    <td align="center" style="background:#730d32;border-radius:8px;">
      <a href="{{evento_url}}" target="_blank" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Ver evento</a>
    </td>
  </tr>
</table>
{{/evento_url}}
$h$, true, 'html', true, true, $a$Tus entradas para {{evento}}$a$, $h$
<h2 style="margin:0 0 8px;font-size:20px;color:#730d32;">Tus entradas están confirmadas</h2>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;">¡Hola, {{nombre}}! Ya tenés tus entradas para el evento.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
  <tr><td style="padding:4px 0;font-size:14px;color:#1f1f1f;"><strong>Evento:</strong> {{evento}}</td></tr>
  <tr><td style="padding:4px 0;font-size:14px;color:#1f1f1f;"><strong>Tipo:</strong> {{tipo_entrada}} &times; {{cantidad}}</td></tr>
  {{#total}}
  <tr><td style="padding:4px 0;font-size:14px;color:#1f1f1f;"><strong>Total:</strong> {{total}}</td></tr>
  {{/total}}
</table>
<div style="background:#faf8f5;border-radius:8px;padding:20px;margin-bottom:24px;text-align:center;">
  <p style="margin:0 0 4px;font-size:14px;color:#1f1f1f;">📎 Adjuntamos <strong>{{cantidad_texto}}</strong> en PDF con tu código QR.</p>
  <p style="margin:0;font-size:13px;color:#6b7280;">Presentá el QR en la entrada del evento.</p>
</div>
{{#evento_url}}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
  <tr>
    <td align="center" style="background:#730d32;border-radius:8px;">
      <a href="{{evento_url}}" target="_blank" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Ver evento</a>
    </td>
  </tr>
</table>
{{/evento_url}}
$h$),
('notificacion', 'Aviso general', 'institucional', $a${{titulo}}$a$, $h$
<h2 style="margin:0 0 8px;font-size:20px;color:#730d32;">{{titulo}}</h2>
<p style="margin:0 0 16px;font-size:14px;color:#1f1f1f;">{{mensaje}}</p>
{{#cta_url}}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
  <tr>
    <td align="center" style="background:#730d32;border-radius:8px;">
      <a href="{{cta_url}}" target="_blank" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">{{cta_texto}}</a>
    </td>
  </tr>
</table>
{{/cta_url}}
$h$, true, 'html', true, true, $a${{titulo}}$a$, $h$
<h2 style="margin:0 0 8px;font-size:20px;color:#730d32;">{{titulo}}</h2>
<p style="margin:0 0 16px;font-size:14px;color:#1f1f1f;">{{mensaje}}</p>
{{#cta_url}}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
  <tr>
    <td align="center" style="background:#730d32;border-radius:8px;">
      <a href="{{cta_url}}" target="_blank" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">{{cta_texto}}</a>
    </td>
  </tr>
</table>
{{/cta_url}}
$h$);

DROP FUNCTION comunicaciones.crear_envio(text, text, text, text, jsonb, uuid, jsonb);
DROP FUNCTION comunicaciones._encolar(text, text, text, text, jsonb, text, boolean, timestamptz, uuid, jsonb);

CREATE FUNCTION comunicaciones._encolar(
  p_nombre text, p_categoria text, p_asunto text, p_cuerpo text, p_destinatarios jsonb,
  p_origen text, p_aprobado boolean, p_programado_para timestamptz DEFAULT NULL,
  p_plantilla uuid DEFAULT NULL, p_audiencia jsonb DEFAULT NULL,
  p_formato text DEFAULT 'texto', p_usa_molde boolean DEFAULT true
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
                                     programado_para, origen, aprobado_por, aprobado_at, formato, usa_molde)
  VALUES (coalesce(nullif(btrim(p_nombre), ''), btrim(p_asunto)), p_categoria, p_plantilla, btrim(p_asunto), p_cuerpo,
          p_audiencia, CASE WHEN p_aprobado THEN 'aprobado' ELSE 'borrador' END, coalesce(p_programado_para, now()),
          p_origen, CASE WHEN p_aprobado THEN contabilidad._usuario() END, CASE WHEN p_aprobado THEN now() END,
          p_formato, coalesce(p_usa_molde, true))
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
  p_formato text DEFAULT 'texto', p_usa_molde boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM comunicaciones._exigir_gestion();
  IF nullif(btrim(p_cuerpo), '') IS NULL THEN
    RAISE EXCEPTION 'Falta el texto del mensaje';
  END IF;
  RETURN comunicaciones._encolar(p_nombre, p_categoria, p_asunto, p_cuerpo, p_destinatarios, 'manual', false,
                                 NULL, p_plantilla, p_audiencia, p_formato, p_usa_molde);
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
                                     v_p.formato, v_p.usa_molde);
  -- Sin destinatarios no queda registrada: puede volver a correr ese día.
  INSERT INTO comunicaciones.corridas (clave, periodo, envio_id, cantidad)
  VALUES (p_clave, p_periodo, v_envio, jsonb_array_length(v_dest))
  ON CONFLICT (clave, periodo) DO UPDATE SET envio_id = EXCLUDED.envio_id, cantidad = EXCLUDED.cantidad,
                                             created_at = now();
  RETURN v_envio;
END;
$$;

REVOKE EXECUTE ON FUNCTION comunicaciones._encolar(text, text, text, text, jsonb, text, boolean, timestamptz, uuid, jsonb, text, boolean),
  comunicaciones._plantilla_transaccional() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION comunicaciones.crear_envio(text, text, text, text, jsonb, uuid, jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION comunicaciones.crear_envio(text, text, text, text, jsonb, uuid, jsonb, text, boolean)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION comunicaciones._encolar(text, text, text, text, jsonb, text, boolean, timestamptz, uuid, jsonb, text, boolean)
  TO service_role;
