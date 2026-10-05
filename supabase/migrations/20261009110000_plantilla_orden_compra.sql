-- ============================================================
-- Comunicaciones — mail de la orden de compra al proveedor, con el
-- PDF adjunto (editable en Plantillas)
-- ============================================================

INSERT INTO comunicaciones.plantillas (clave, nombre, categoria, asunto, cuerpo, sistema, formato, usa_molde, transaccional,
                                       asunto_original, cuerpo_original, encabezado, encabezado_original)
SELECT 'orden_compra', 'Compras: orden de compra al proveedor', 'institucional', a, c, true, 'html', true, true, a, c, e, e
FROM (SELECT
  $a$Orden de compra {{numero_orden}} — Club Seminario$a$ AS a,
  $c$<p style="margin:0 0 16px 0;">Hola {{nombre}}:</p>
<p style="margin:0 0 16px 0;">Te enviamos adjunta la orden de compra <strong>{{numero_orden}}</strong> del {{fecha}} por un total de <strong>{{total}}</strong>.</p>
{{#mensaje}}<p style="margin:0 0 16px 0; white-space:pre-line;">{{mensaje}}</p>{{/mensaje}}
<p style="margin:0 0 16px 0;">Por favor, indicá el número de orden en el remito y en la factura. Si hay alguna diferencia de precio, cantidad o plazo de entrega, avisanos antes de despachar.</p>
<p style="margin:0 0 8px 0;">Muchas gracias.</p>$c$ AS c,
  $e${"titulo": "Orden de compra {{numero_orden}}", "subtitulo": "{{proveedor}}", "preencabezado": "Orden {{numero_orden}} por {{total}}", "firma": "Compras\nClub Seminario"}$e$::jsonb AS e
) x
ON CONFLICT (clave) DO NOTHING;
