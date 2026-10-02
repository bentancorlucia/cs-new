# Comunicaciones

Schema `comunicaciones` (migración `20261006100000_comunicaciones.sql`, tests en `supabase/tests/comunicaciones.test.sql`). Modelo tomado de ContaSystem, pero enviando desde el servidor por el SMTP del dominio (cPanel) en lugar de la PC del operador.

## Cómo funciona

1. **Encolar.** Un envío (`envios`) tiene una fila por destinatario en `mensajes`, creada antes de mandar nada. Esa fila es a la vez la cola, el historial y el ancla de la baja. Al encolar se **omiten**, con su motivo, las direcciones inválidas, las repetidas, las dadas de baja y las que ya recibieron ese mismo aviso (`dedupe_key`).
2. **Aprobar.** Los envíos manuales y los de automatizaciones asistidas (por ejemplo, cuotas vencidas) nacen en **borrador** y salen cuando alguien los aprueba (ahora o programados). Los transaccionales (pedidos, entradas) salen solos.
3. **Enviar.** El worker `/api/comunicaciones/worker` corre cada minuto (Vercel Cron) y además se dispara al encolar un mail transaccional. Funciona así:
   - toma tandas con `FOR UPDATE SKIP LOCKED` y respeta el **tope por hora** configurado (cPanel suele limitar);
   - vuelve a chequear la baja;
   - arma el mail (molde del club, texto con formato simple y variables escapadas) y lo manda por SMTP;
   - si el error es transitorio, reintenta con espera de 1, 5, 15, 60 y 240 minutos;
   - si el error es permanente (5xx) o se agotaron los intentos, lo marca como fallido.
4. **Bajas.**
   - **Difusión** admite baja; **institucional** (cuotas, pedidos, entradas) no.
   - La baja es por dirección. Un rebote o un pedido expreso se carga como alcance `total`.
   - El pie de cada mail de difusión trae un enlace firmado (`/baja/<id>.<firma>`): el GET muestra la confirmación y el POST registra la baja. El header `List-Unsubscribe` permite la baja en un clic (RFC 8058), que Gmail y Yahoo exigen para envíos masivos.
   - Las bajas no se borran: se revocan.
5. **Automatizaciones** (`/api/comunicaciones/automatizaciones`, a diario a las 8:00):
   - bienvenida a altas recientes: una vez por persona;
   - cumpleaños: una vez por año;
   - cuotas vencidas: el día del mes configurado, asistida.

   Nacen **apagadas** y cada corrida se registra una sola vez por período.

Los mails de tienda y entradas (`src/lib/email/send.ts`) se encolan con su HTML; el PDF de las entradas se genera al enviar. Ya no se usa Resend.

## Variables de entorno (cargarlas directamente en Vercel, nunca en el chat ni en el repo)

| Variable | Qué es |
|---|---|
| `SMTP_HOST` | servidor SMTP del cPanel (p. ej. `mail.clubseminario.com.uy`) |
| `SMTP_PORT` | `465` (TLS) o `587` (STARTTLS) |
| `SMTP_SECURE` | `false` si se usa 587 |
| `SMTP_USER` | casilla que envía (p. ej. `noreply@clubseminario.com.uy`) |
| `SMTP_PASS` | contraseña de esa casilla |
| `COMUNICACIONES_SECRET` | secreto para firmar los enlaces de baja (si falta, usa `CRON_SECRET`) |
| `NEXT_PUBLIC_SITE_URL` | URL del sitio para los enlaces (por defecto `https://www.clubseminario.com.uy`) |

El remitente que se configure en la pantalla tiene que ser la casilla de `SMTP_USER` (o un alias autorizado por el servidor). En el DNS conviene tener SPF, DKIM (cPanel lo genera en "Email Deliverability") y un registro DMARC empezando por `p=none`.

## Permisos

| Rol | Puede |
|---|---|
| secretaria, super_admin | crear, aprobar y cancelar envíos; plantillas, bajas, automatizaciones, configuración |
| tienda | ver; editar el WhatsApp de la tienda |
| tesorero | ver |

## WhatsApp

El número de la tienda y sus mensajes predefinidos (`pedido_listo`, `consulta`) se guardan en `comunicaciones.config`. La tienda pública los lee con `public.whatsapp_tienda()`. Los botones arman enlaces `wa.me`: no se usa la API paga de WhatsApp Business.
