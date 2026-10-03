"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, ExternalLink, Gauge, Mail, MessageCircle, Save, ServerOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { REGEX_EMAIL } from "@/lib/comunicaciones/esquemas";
import { REGEX_WHATSAPP, linkWhatsApp, textoWhatsApp } from "@/lib/comunicaciones/whatsapp";
import { guardarConfig, guardarWhatsApp } from "@/app/(dashboard)/comunicaciones/actions";
import { Aviso, Boton, Campo, EncabezadoPagina, Panel, claseControl } from "./ui";
import type { ConfigComunicaciones } from "./tipos";

const claseArea =
  "block w-full resize-y rounded-lg border border-linea bg-white px-3 py-2 text-sm outline-none transition-all placeholder:text-muted-foreground/70 hover:border-bordo-200 focus:border-bordo-700 focus:ring-3 focus:ring-bordo-800/10 disabled:opacity-60";

const EJEMPLO_WA = { nombre: "María", numero: "T-1042" };

export function Configuracion({
  config,
  puedeGestionar,
  puedeWhatsApp,
  smtp,
}: {
  config: ConfigComunicaciones | null;
  puedeGestionar: boolean;
  puedeWhatsApp: boolean;
  smtp: boolean;
}) {
  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Comunicaciones"
        titulo="Configuración"
        descripcion="Con qué nombre y dirección salen los correos, cuántos por hora, y el WhatsApp de la tienda."
      />
      {!config ? (
        <Aviso tono="error" titulo="No se encontró la configuración de comunicaciones" />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {puedeGestionar || !puedeWhatsApp ? (
            <PanelCorreo config={config} editable={puedeGestionar} smtp={smtp} />
          ) : (
            <Aviso tono="info" icono={Mail} className="h-fit">
              La configuración de correo la maneja secretaría. Desde acá podés cambiar el WhatsApp de la tienda.
            </Aviso>
          )}
          <PanelWhatsApp config={config} editable={puedeWhatsApp} />
        </div>
      )}
    </div>
  );
}

function PanelCorreo({ config, editable, smtp }: { config: ConfigComunicaciones; editable: boolean; smtp: boolean }) {
  const router = useRouter();
  const [nombre, setNombre] = useState(config.remitente_nombre);
  const [email, setEmail] = useState(config.remitente_email);
  const [responder, setResponder] = useState(config.responder_a ?? "");
  const [porHora, setPorHora] = useState(String(config.limite_por_hora));
  const [porTanda, setPorTanda] = useState(String(config.limite_por_tanda));
  const [pie, setPie] = useState(config.pie ?? "");
  const [pendiente, start] = useTransition();

  const errores = {
    nombre: !nombre.trim() ? "Falta el nombre" : null,
    email: !REGEX_EMAIL.test(email.trim()) ? "Dirección inválida" : null,
    responder: responder.trim() && !REGEX_EMAIL.test(responder.trim()) ? "Dirección inválida" : null,
    porHora: !(Number.isInteger(Number(porHora)) && Number(porHora) >= 1) ? "Un número mayor que 0" : null,
    porTanda:
      !(Number.isInteger(Number(porTanda)) && Number(porTanda) >= 1 && Number(porTanda) <= 200)
        ? "Entre 1 y 200"
        : Number(porTanda) > Number(porHora)
          ? "No puede superar el límite por hora"
          : null,
  };
  const valido = !Object.values(errores).some(Boolean);
  const cambios =
    nombre !== config.remitente_nombre ||
    email !== config.remitente_email ||
    responder !== (config.responder_a ?? "") ||
    porHora !== String(config.limite_por_hora) ||
    porTanda !== String(config.limite_por_tanda) ||
    pie !== (config.pie ?? "");

  function guardar() {
    if (!valido) {
      toast.error("Revisá los campos marcados");
      return;
    }
    start(async () => {
      const r = await guardarConfig({
        remitente_nombre: nombre,
        remitente_email: email,
        responder_a: responder,
        limite_por_hora: Number(porHora),
        limite_por_tanda: Number(porTanda),
        pie,
      });
      if (r.ok) {
        toast.success("Configuración guardada");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Panel titulo="Correo" icono={Mail} delay={0.05}>
      <fieldset disabled={!editable} className="space-y-4 p-4">
        {smtp ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <CheckCircle2 className="size-4" />
            Servidor de correo (SMTP) configurado en las variables de entorno.
          </div>
        ) : (
          <div className="flex gap-2 rounded-xl border border-dorado-300 bg-dorado-100/60 px-3 py-2 text-xs text-dorado-900">
            <ServerOff className="mt-0.5 size-4 shrink-0" />
            <span>
              El SMTP no está configurado: faltan SMTP_HOST, SMTP_USER y SMTP_PASS en las variables de entorno del
              servidor. Mientras tanto, los correos quedan en la cola.
            </span>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre del remitente" error={errores.nombre}>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} className={claseControl} />
          </Campo>
          <Campo etiqueta="Correo del remitente" error={errores.email} ayuda="Tiene que ser del dominio del SMTP">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={claseControl} />
          </Campo>
          <Campo
            etiqueta="Responder a (opcional)"
            error={errores.responder}
            ayuda="Si alguien responde el correo, le llega a esta casilla"
            className="sm:col-span-2"
          >
            <input
              type="email"
              value={responder}
              onChange={(e) => setResponder(e.target.value)}
              placeholder="secretaria@clubseminario.com.uy"
              className={claseControl}
            />
          </Campo>
        </div>

        <div className="rounded-xl border border-linea p-3">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <Gauge className="size-4 text-bordo-700" />
            Ritmo de envío
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Los hostings con cPanel suelen limitar cuántos correos por hora manda una casilla (muchas veces entre 100 y
            500). Si se supera, el servidor los rechaza: mejor quedarse un poco abajo del límite del proveedor. La cola
            manda de a tandas, cada minuto, hasta llegar al tope por hora.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Máximo por hora" error={errores.porHora}>
              <input type="number" min={1} value={porHora} onChange={(e) => setPorHora(e.target.value)} className={claseControl} />
            </Campo>
            <Campo etiqueta="Máximo por tanda" error={errores.porTanda} ayuda="Por minuto, como mucho 200">
              <input type="number" min={1} max={200} value={porTanda} onChange={(e) => setPorTanda(e.target.value)} className={claseControl} />
            </Campo>
          </div>
        </div>

        <Campo etiqueta="Pie de los correos (opcional)" ayuda="Texto chico al final de cada correo: dirección, teléfono, horario…">
          <textarea value={pie} onChange={(e) => setPie(e.target.value)} rows={3} maxLength={1000} className={claseArea} placeholder="Club Seminario · Soriano 1472, Montevideo · 2900 0000" />
        </Campo>

        {editable && (
          <div className="flex justify-end">
            <Boton onClick={guardar} pendiente={pendiente} disabled={!cambios}>
              <Save className="size-4" />
              Guardar
            </Boton>
          </div>
        )}
      </fieldset>
    </Panel>
  );
}

function PanelWhatsApp({ config, editable }: { config: ConfigComunicaciones; editable: boolean }) {
  const router = useRouter();
  const [numero, setNumero] = useState(config.whatsapp_tienda ?? "");
  const [listo, setListo] = useState(config.whatsapp_mensajes?.pedido_listo ?? "");
  const [consulta, setConsulta] = useState(config.whatsapp_mensajes?.consulta ?? "");
  const [pendiente, start] = useTransition();

  const limpio = numero.replace(/[\s+\-()]/g, "");
  const errorNumero =
    limpio === ""
      ? null
      : limpio.startsWith("0")
        ? "Sin el 0 inicial: 598 + el celular sin 0 (ej: 59899123456)"
        : !REGEX_WHATSAPP.test(limpio)
          ? "Formato internacional, solo números (ej: 59899123456)"
          : null;
  const cambios =
    limpio !== (config.whatsapp_tienda ?? "") ||
    listo !== (config.whatsapp_mensajes?.pedido_listo ?? "") ||
    consulta !== (config.whatsapp_mensajes?.consulta ?? "");

  function guardar() {
    if (errorNumero || !listo.trim() || !consulta.trim()) {
      toast.error(errorNumero ?? "Completá los dos mensajes");
      return;
    }
    start(async () => {
      const r = await guardarWhatsApp({ numero: limpio, pedido_listo: listo, consulta });
      if (r.ok) {
        toast.success("WhatsApp de la tienda guardado");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Panel titulo="WhatsApp de la tienda" icono={MessageCircle} delay={0.1}>
      <fieldset disabled={!editable} className="space-y-4 p-4">
        <p className="text-xs text-muted-foreground">
          Con un número cargado aparece «Consultas por WhatsApp» en la tienda online (sin número, no se muestra). Desde
          cada pedido, la tienda le escribe al cliente con estos mensajes, desde el WhatsApp del celular o la compu.
        </p>
        <Campo
          etiqueta="Número"
          error={errorNumero}
          ayuda="Formato internacional sin + ni espacios: 598 + celular sin el 0 (099 123 456 → 59899123456)"
        >
          <div className="flex gap-2">
            <input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              inputMode="numeric"
              placeholder="59899123456"
              className={cn(claseControl, "font-mono")}
              aria-invalid={!!errorNumero}
            />
            {limpio && !errorNumero && (
              <motion.a
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                href={linkWhatsApp(limpio)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-linea px-3 text-sm text-foreground/80 transition-colors hover:bg-superficie"
              >
                Probar
                <ExternalLink className="size-3.5" />
              </motion.a>
            )}
          </div>
        </Campo>

        {(
          [
            { k: "pedido_listo", t: "Mensaje «pedido listo»", d: "Botón «Avisar por WhatsApp» del pedido, cuando está listo para retirar.", v: listo, set: setListo },
            { k: "consulta", t: "Mensaje de consulta", d: "Botón «Escribir por WhatsApp» del pedido, para consultarle algo al cliente.", v: consulta, set: setConsulta },
          ] as const
        ).map((m) => (
          <div key={m.k} className="space-y-1.5">
            <Campo etiqueta={m.t} ayuda={`${m.d} Variables: {{nombre}} (cliente) y {{numero}} (pedido).`}>
              <textarea value={m.v} onChange={(e) => m.set(e.target.value)} rows={2} maxLength={1000} className={claseArea} />
            </Campo>
            <div className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-3 py-2 text-[13px] text-[#111b21] shadow-sm">
              {textoWhatsApp(m.v, EJEMPLO_WA) || <span className="opacity-50">(vacío)</span>}
            </div>
          </div>
        ))}

        {editable && (
          <div className="flex justify-end">
            <Boton onClick={guardar} pendiente={pendiente} disabled={!cambios}>
              <Save className="size-4" />
              Guardar WhatsApp
            </Boton>
          </div>
        )}
      </fieldset>
    </Panel>
  );
}
