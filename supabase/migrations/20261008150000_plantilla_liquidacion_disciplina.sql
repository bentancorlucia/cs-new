-- ============================================================
-- Comunicaciones — mail automático a los representantes de cada
-- disciplina con el resumen de su liquidación (editable en Plantillas)
-- ============================================================

INSERT INTO comunicaciones.plantillas (clave, nombre, categoria, asunto, cuerpo, sistema, formato, usa_molde, transaccional,
                                       asunto_original, cuerpo_original, encabezado, encabezado_original)
SELECT 'liquidacion_disciplina', 'Disciplinas: liquidación del mes', 'institucional', a, c, true, 'html', true, true, a, c, e, e
FROM (SELECT
  $a$Liquidación de {{disciplina}} — {{periodo}}$a$ AS a,
  $c$<p style="margin:0 0 18px 0;">Hola {{nombre}}: este es el resumen de la liquidación de las cuotas de <strong>{{disciplina}}</strong> de {{periodo}}.</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0; border-collapse:collapse; font-size:14px;">
  <tr><td style="padding:8px 0; border-bottom:1px solid #eee;">Cobrado por débito Visa ({{tarjetas_cobradas}} tarjetas)</td><td align="right" style="padding:8px 0 8px 12px; border-bottom:1px solid #eee; white-space:nowrap;">{{visa_cobrado}}</td></tr>
  <tr><td style="padding:8px 0; border-bottom:1px solid #eee;">− Cuota social que se queda el club</td><td align="right" style="padding:8px 0 8px 12px; border-bottom:1px solid #eee; white-space:nowrap;">{{social_total}}</td></tr>
  <tr><td style="padding:8px 0 8px 14px; border-bottom:1px solid #eee; color:#6b7280; font-size:13px;">cobrada en el débito {{visa_social}} · a cargo de la disciplina (rebotes y socios que no pagaron por el club) {{social_a_cargo}} · {{socios}} socios en el mes, cuota social {{cuota_social}}</td><td style="border-bottom:1px solid #eee;"></td></tr>
  <tr><td style="padding:8px 0; border-bottom:1px solid #eee;">− Comisión del débito</td><td align="right" style="padding:8px 0 8px 12px; border-bottom:1px solid #eee; white-space:nowrap;">{{gastos_comision}}</td></tr>
  <tr><td style="padding:8px 0; border-bottom:1px solid #eee;">− IVA de la comisión</td><td align="right" style="padding:8px 0 8px 12px; border-bottom:1px solid #eee; white-space:nowrap;">{{gastos_iva}}</td></tr>
  {{#hay_otros}}<tr><td style="padding:8px 0; border-bottom:1px solid #eee;">+ Cuotas de la disciplina cobradas por otros medios</td><td align="right" style="padding:8px 0 8px 12px; border-bottom:1px solid #eee; white-space:nowrap;">{{otros_cobrado}}</td></tr>{{/hay_otros}}
  <tr><td style="padding:12px 0; font-weight:700; color:#730d32;">{{resultado_texto}}</td><td align="right" style="padding:12px 0; font-weight:700; color:#730d32; font-size:16px; white-space:nowrap;">{{resultado}}</td></tr>
</table>

<p style="margin:0 0 8px 0; font-weight:700;">Débito por importe de cuota</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0; border-collapse:collapse; font-size:13px;">
  <tr style="color:#6b7280;"><td style="padding:6px 0; border-bottom:1px solid #ddd;">Cuota</td><td align="right" style="border-bottom:1px solid #ddd;">Tarjetas</td><td align="right" style="border-bottom:1px solid #ddd;">Rechazos</td><td align="right" style="border-bottom:1px solid #ddd;">Cobradas</td><td align="right" style="border-bottom:1px solid #ddd;">Importe</td></tr>
  {{#por_cuota}}<tr><td style="padding:6px 0; border-bottom:1px solid #f0f0f0;">{{cuota}}</td><td align="right" style="border-bottom:1px solid #f0f0f0;">{{tarjetas}}</td><td align="right" style="border-bottom:1px solid #f0f0f0;">{{rechazos}}</td><td align="right" style="border-bottom:1px solid #f0f0f0;">{{cobradas}}</td><td align="right" style="border-bottom:1px solid #f0f0f0;">{{importe}}</td></tr>{{/por_cuota}}
</table>

<p style="margin:0 0 8px 0; font-weight:700;">Cuotas cobradas</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0; border-collapse:collapse; font-size:13px;">
  {{#cobrados}}<tr><td style="padding:5px 0; border-bottom:1px solid #f0f0f0;">{{nombre}}</td><td style="padding:5px 0; border-bottom:1px solid #f0f0f0; color:#6b7280;">{{medio}}</td><td align="right" style="padding:5px 0; border-bottom:1px solid #f0f0f0;">{{importe}}</td></tr>{{/cobrados}}
  {{^cobrados}}<tr><td style="padding:5px 0; color:#6b7280;">No hubo cobros este mes.</td></tr>{{/cobrados}}
</table>

{{#hay_rebotes}}
<p style="margin:0 0 8px 0; font-weight:700; color:#b91c1c;">Rebotes del débito</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0; border-collapse:collapse; font-size:13px;">
  {{#rebotes}}<tr><td style="padding:5px 0; border-bottom:1px solid #f0f0f0;">{{nombre}}</td><td style="padding:5px 0; border-bottom:1px solid #f0f0f0; color:#6b7280;">{{motivo}}</td><td align="right" style="padding:5px 0; border-bottom:1px solid #f0f0f0;">{{importe}}</td></tr>{{/rebotes}}
</table>
{{/hay_rebotes}}

{{#hay_sin_pagar}}
<p style="margin:0 0 8px 0; font-weight:700;">Cuota social a cargo de la disciplina</p>
<p style="margin:0 0 8px 0; font-size:13px; color:#6b7280;">Socios que este mes no pagaron por el club: la disciplina pone su cuota social y les cobra directamente.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0; border-collapse:collapse; font-size:13px;">
  {{#sin_pagar}}<tr><td style="padding:5px 0; border-bottom:1px solid #f0f0f0;">{{nombre}}</td><td align="right" style="padding:5px 0; border-bottom:1px solid #f0f0f0;">{{importe}}</td></tr>{{/sin_pagar}}
</table>
{{/hay_sin_pagar}}

{{#panel_url}}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 26px 0;">
  <tr>
    <td style="background:#730D32; border-radius:10px;">
      <a href="{{panel_url}}" target="_blank" style="display:inline-block; padding:14px 28px; font-family:'Satoshi','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:15px; font-weight:700; color:#FFFFFF; text-decoration:none;">Ver el detalle en el panel</a>
    </td>
  </tr>
</table>
{{/panel_url}}$c$ AS c,
  $e${"titulo": "Liquidación de {{periodo}}", "subtitulo": "{{disciplina}}", "preencabezado": "{{resultado_texto}}: {{resultado}}", "firma": "Tesorería\nClub Seminario"}$e$::jsonb AS e
) x
ON CONFLICT (clave) DO NOTHING;
