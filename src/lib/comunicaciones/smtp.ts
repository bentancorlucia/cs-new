import nodemailer, { type Transporter } from "nodemailer";

/**
 * SMTP del dominio (cPanel). Las credenciales viven solo en variables de
 * entorno: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (y SMTP_SECURE=false
 * para STARTTLS en 587; por defecto TLS directo en 465).
 */

let transporter: Transporter | null = null;

export function smtpConfigurado() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function obtenerTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      pool: true,
      maxConnections: 2,
      connectionTimeout: 15_000,
      socketTimeout: 30_000,
    });
  }
  return transporter;
}

export type Correo = {
  de: { nombre: string; email: string };
  para: { nombre?: string | null; email: string };
  responderA?: string | null;
  asunto: string;
  html: string;
  texto?: string;
  encabezados?: Record<string, string>;
  adjuntos?: { nombre: string; contenido: Buffer; tipo: string }[];
};

export type ResultadoEnvio =
  | { ok: true; id: string }
  | { ok: false; error: string; permanente: boolean };

export async function enviarCorreo(correo: Correo): Promise<ResultadoEnvio> {
  try {
    const info = await obtenerTransporter().sendMail({
      from: { name: correo.de.nombre, address: correo.de.email },
      to: correo.para.nombre ? { name: correo.para.nombre, address: correo.para.email } : correo.para.email,
      replyTo: correo.responderA ?? undefined,
      subject: correo.asunto,
      html: correo.html,
      text: correo.texto,
      headers: correo.encabezados,
      attachments: correo.adjuntos?.map((a) => ({
        filename: a.nombre,
        content: a.contenido,
        contentType: a.tipo,
      })),
    });
    return { ok: true, id: info.messageId };
  } catch (e) {
    const err = e as { responseCode?: number; code?: string; message?: string };
    // 5xx del servidor (dirección rechazada, mensaje inválido): no se
    // reintenta. 4xx, timeouts y conexión: sí.
    const permanente =
      typeof err.responseCode === "number" && err.responseCode >= 500 && err.responseCode < 600;
    return { ok: false, error: `${err.code ?? ""} ${err.message ?? String(e)}`.trim(), permanente };
  }
}
