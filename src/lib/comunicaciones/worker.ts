import { createComunicacionesAdminClient } from "./server";
import { renderPlantilla, type Variables } from "./render";
import { enviarCorreo, smtpConfigurado } from "./smtp";
import { urlBajaUnClic, urlPaginaBaja } from "./baja";
import { generarQREntrada } from "@/lib/qr/generate";
import { generarTicketPDF } from "@/lib/pdf/ticket-pdf";

type Envio = { id: string; asunto: string; cuerpo: string | null; categoria: string; formato: string; usa_molde: boolean };

/**
 * Vacía la cola: toma tandas (respetando el tope por hora que controla la
 * base), arma cada mail y lo manda por SMTP. Cada resultado vuelve a la
 * base: enviado, reintento con espera o fallido. Corre hasta agotar la
 * cola o el presupuesto de tiempo.
 */
export async function procesarCola({ presupuestoMs = 50_000 } = {}) {
  const resumen = { enviados: 0, fallidos: 0, reintentos: 0, omitidos: 0 };
  if (!smtpConfigurado()) {
    return { ...resumen, error: "SMTP sin configurar (SMTP_HOST, SMTP_USER, SMTP_PASS)" };
  }

  const db = createComunicacionesAdminClient();
  const { data: cfg, error: errCfg } = await db.from("config").select("*").single();
  if (errCfg || !cfg) throw new Error(errCfg?.message ?? "Sin configuración de comunicaciones");

  const envios = new Map<string, Envio>();
  const inicio = Date.now();

  while (Date.now() - inicio < presupuestoMs) {
    const { data: tanda, error } = await db.rpc("tomar_mensajes");
    if (error) throw new Error(error.message);
    if (!tanda || tanda.length === 0) break;

    for (const m of tanda) {
      // La baja pudo llegar después de encolar.
      const { data: suprimido } = await db.rpc("suprimido", { p_email: m.email, p_categoria: m.categoria });
      if (suprimido) {
        await db.rpc("omitir_mensaje", { p_mensaje: m.id, p_motivo: "Dada de baja" });
        resumen.omitidos++;
        continue;
      }

      let envio = envios.get(m.envio_id);
      if (!envio) {
        const { data } = await db.from("envios").select("id, asunto, cuerpo, categoria, formato, usa_molde").eq("id", m.envio_id).single();
        if (!data) continue;
        envio = data;
        envios.set(m.envio_id, data);
      }

      const { adjunto, ...variables } = (m.variables ?? {}) as Record<string, unknown>;
      const esDifusion = m.categoria === "difusion";
      let asunto: string;
      let html: string;
      let texto: string | undefined;
      if (m.html) {
        asunto = envio.asunto;
        html = m.html;
      } else {
        const r = renderPlantilla(
          { asunto: envio.asunto, cuerpo: envio.cuerpo ?? "", formato: envio.formato, usaMolde: envio.usa_molde },
          { nombre: m.nombre ?? "", ...(variables as Variables) },
          { pie: cfg.pie, bajaUrl: esDifusion ? urlPaginaBaja(m.id) : null }
        );
        asunto = r.asunto;
        html = r.html;
        texto = r.texto;
      }

      const resultado = await enviarCorreo({
        de: { nombre: cfg.remitente_nombre, email: cfg.remitente_email },
        para: { nombre: m.nombre, email: m.email },
        responderA: cfg.responder_a,
        asunto,
        html,
        texto,
        encabezados: esDifusion
          ? {
              "List-Unsubscribe": `<${urlBajaUnClic(m.id)}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }
          : undefined,
        adjuntos: await adjuntos(adjunto),
      });

      await db.rpc("resultado_mensaje", {
        p_mensaje: m.id,
        p_ok: resultado.ok,
        p_smtp_id: resultado.ok ? resultado.id : undefined,
        p_error: resultado.ok ? undefined : resultado.error,
        p_permanente: resultado.ok ? false : resultado.permanente,
      });
      if (resultado.ok) resumen.enviados++;
      else if (resultado.permanente || m.intentos >= 5) resumen.fallidos++;
      else resumen.reintentos++;
    }
  }
  return resumen;
}

/** Adjuntos que se generan al enviar (no se guardan en la base). */
async function adjuntos(adjunto: unknown) {
  const a = adjunto as
    | {
        tipo: "entradas_pdf";
        datos: {
          nombreAsistente: string;
          eventoTitulo: string;
          tipoEntrada: string;
          codigos: string[];
          eventoFecha?: string;
          eventoLugar?: string;
        };
      }
    | undefined;
  if (!a || a.tipo !== "entradas_pdf") return undefined;
  const qrDataUrls = await Promise.all(a.datos.codigos.map((c) => generarQREntrada(c)));
  const pdf = await generarTicketPDF({ ...a.datos, qrDataUrls });
  return [
    {
      nombre: `entradas-${a.datos.eventoTitulo.toLowerCase().replace(/\s+/g, "-")}.pdf`,
      contenido: Buffer.from(pdf),
      tipo: "application/pdf",
    },
  ];
}
