-- ============================================================
-- Se quita el teléfono +598 91 965 438 de todo el sitio: el mail de
-- "pedido listo" (texto y original), el molde propio si lo tuviera y el
-- contenido de las páginas.
-- ============================================================

ALTER TABLE comunicaciones.plantillas DISABLE TRIGGER plantillas_transaccional;
UPDATE comunicaciones.plantillas
   SET cuerpo = regexp_replace(cuerpo, '\n?<p[^>]*>¿Necesitás envío\?[^\n]*</p>', '', 'g'),
       cuerpo_original = regexp_replace(cuerpo_original, '\n?<p[^>]*>¿Necesitás envío\?[^\n]*</p>', '', 'g')
 WHERE cuerpo ~ '91 ?965 ?438|91965438' OR cuerpo_original ~ '91 ?965 ?438|91965438';
ALTER TABLE comunicaciones.plantillas ENABLE TRIGGER plantillas_transaccional;

UPDATE comunicaciones.config
   SET molde_html = regexp_replace(molde_html, '<br>\s*<a href="tel:\+59891965438"[^>]*>[^<]*</a>', '', 'g')
 WHERE molde_html ~ '91965438';

UPDATE public.contenido_paginas
   SET contenido = regexp_replace(contenido, 'Teléfono: \+598 91 965 438\. ', '', 'g')
 WHERE contenido ~ '91 965 438';
