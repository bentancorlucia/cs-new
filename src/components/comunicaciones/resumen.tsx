"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ClipboardCheck, Inbox, Plus, Send, ServerOff, Workflow } from "lucide-react";
import { easeSmooth } from "@/lib/motion";
import { Aviso, BotonLink, EncabezadoPagina, Kpi, NumeroAnimado, Panel, Vacio } from "./ui";
import { EnvioItem } from "./envio-item";
import { ProcesarCola } from "./procesar-cola";
import type { EnvioResumen } from "./tipos";

export function ResumenComunicaciones({
  smtp,
  puedeGestionar,
  kpis,
  recientes,
  borradores,
  error,
}: {
  smtp: boolean;
  puedeGestionar: boolean;
  kpis: { enviadosMes: number; enCola: number; fallidos: number; bajas: number };
  recientes: EnvioResumen[];
  borradores: EnvioResumen[];
  error: string | null;
}) {
  // Primero los que prepararon las automatizaciones asistidas.
  const ordenados = [...borradores].sort(
    (a, b) => Number(b.origen === "automatizacion") - Number(a.origen === "automatizacion")
  );

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Comunicaciones"
        titulo="Resumen"
        descripcion="Correos del club a socios y clientes: la cola de salida, lo que espera aprobación y las bajas."
      >
        {puedeGestionar && smtp && <ProcesarCola enCola={kpis.enCola} />}
        {puedeGestionar && (
          <BotonLink href="/comunicaciones/envios/nuevo">
            <Plus className="size-4" />
            Nuevo envío
          </BotonLink>
        )}
      </EncabezadoPagina>

      {error && <Aviso tono="error" icono={AlertTriangle} titulo="No se pudo leer todo" >{error}</Aviso>}

      {!smtp && (
        <Aviso tono="alerta" icono={ServerOff} titulo="El servidor de correo no está configurado">
          Los envíos se preparan y quedan en la cola, pero no sale ningún correo hasta que se configure el SMTP del
          dominio. Faltan las variables de entorno <code className="rounded bg-white/70 px-1">SMTP_HOST</code>,{" "}
          <code className="rounded bg-white/70 px-1">SMTP_USER</code> y{" "}
          <code className="rounded bg-white/70 px-1">SMTP_PASS</code> (y opcionalmente{" "}
          <code className="rounded bg-white/70 px-1">SMTP_PORT</code>) en el proyecto de Vercel. Las credenciales nunca
          se cargan en esta pantalla.
        </Aviso>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Enviados este mes" delay={0.02} detalle="Correos entregados al servidor">
          <NumeroAnimado valor={kpis.enviadosMes} />
        </Kpi>
        <Kpi etiqueta="En cola" delay={0.06} detalle="Aprobados, esperando su turno">
          <NumeroAnimado valor={kpis.enCola} />
        </Kpi>
        <Kpi etiqueta="Fallidos" delay={0.1} tono={kpis.fallidos > 0 ? "alerta" : "neutro"} detalle="Se pueden reintentar desde el envío">
          <NumeroAnimado valor={kpis.fallidos} />
        </Kpi>
        <Kpi etiqueta="Bajas vigentes" delay={0.14} detalle="Direcciones que no reciben difusión">
          <NumeroAnimado valor={kpis.bajas} />
        </Kpi>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel
          titulo={
            <>
              Esperando aprobación
              {borradores.length > 0 && (
                <span className="ml-1 rounded-full bg-dorado-100 px-2 py-0.5 text-[11px] text-dorado-800">
                  {borradores.length}
                </span>
              )}
            </>
          }
          icono={ClipboardCheck}
          delay={0.1}
        >
          <div className="p-3">
            {ordenados.length === 0 ? (
              <Vacio icono={Inbox} titulo="Nada para aprobar" texto="Los envíos nuevos y los que preparan las automatizaciones asistidas aparecen acá." />
            ) : (
              <>
                {ordenados.some((b) => b.origen === "automatizacion") && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mb-2 flex items-center gap-1.5 px-1 text-xs text-violet-800"
                  >
                    <Workflow className="size-3.5" />
                    Preparados por automatizaciones asistidas: revisalos y aprobalos para que salgan.
                  </motion.p>
                )}
                <ul className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {ordenados.map((e, i) => (
                      <EnvioItem key={e.id} envio={e} indice={i} destacado={e.origen === "automatizacion"} />
                    ))}
                  </AnimatePresence>
                </ul>
              </>
            )}
          </div>
        </Panel>

        <Panel
          titulo="Envíos recientes"
          icono={Send}
          delay={0.16}
          accion={
            <BotonLink href="/comunicaciones/envios" variante="secundario" className="h-8 px-3 text-xs">
              Ver todos
            </BotonLink>
          }
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...easeSmooth, delay: 0.2 }}
            className="p-3"
          >
            {recientes.length === 0 ? (
              <Vacio icono={Send} titulo="Todavía no se envió nada" texto="Cuando se apruebe un envío, vas a ver acá cómo avanza." />
            ) : (
              <ul className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {recientes.map((e, i) => (
                    <EnvioItem key={e.id} envio={e} indice={i} />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </motion.div>
        </Panel>
      </div>
    </div>
  );
}
