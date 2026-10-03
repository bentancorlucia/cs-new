"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Plus, Search, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { easeSmooth } from "@/lib/motion";
import { Aviso, BotonLink, EncabezadoPagina, Filtros, Vacio, claseControl } from "./ui";
import { EnvioItem } from "./envio-item";
import type { EnvioResumen } from "./tipos";

type Filtro = "todos" | "borrador" | "en_curso" | "programado" | "terminado" | "cancelado" | "automatizacion";

function clasificar(e: EnvioResumen): Exclude<Filtro, "todos" | "automatizacion"> {
  if (e.estado === "borrador") return "borrador";
  if (e.estado === "cancelado") return "cancelado";
  if (new Date(e.programado_para).getTime() > Date.now()) return "programado";
  return Number(e.pendientes) + Number(e.enviando) > 0 ? "en_curso" : "terminado";
}

export function EnviosLista({
  envios,
  puedeGestionar,
  error,
}: {
  envios: EnvioResumen[];
  puedeGestionar: boolean;
  error: string | null;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [texto, setTexto] = useState("");
  const q = useDeferredValue(texto.trim().toLowerCase());

  const clases = useMemo(() => new Map(envios.map((e) => [e.id, clasificar(e)])), [envios]);
  const lista = useMemo(
    () =>
      envios.filter((e) => {
        if (filtro === "automatizacion" ? e.origen !== "automatizacion" : filtro !== "todos" && clases.get(e.id) !== filtro)
          return false;
        return !q || `${e.nombre} ${e.asunto}`.toLowerCase().includes(q);
      }),
    [envios, filtro, q, clases]
  );
  const cuenta = (f: Filtro) => envios.filter((e) => clases.get(e.id) === f).length;

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Comunicaciones"
        titulo="Envíos"
        descripcion="Cada envío nace en borrador, se aprueba (ahora o programado) y sale por la cola respetando el tope por hora."
      >
        {puedeGestionar && (
          <BotonLink href="/comunicaciones/envios/nuevo">
            <Plus className="size-4" />
            Nuevo envío
          </BotonLink>
        )}
      </EncabezadoPagina>

      {error && <Aviso tono="error" icono={AlertTriangle}>{error}</Aviso>}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...easeSmooth, delay: 0.05 }}
        className="space-y-3 rounded-2xl border border-linea bg-white p-3"
      >
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscá por nombre o asunto…"
            className={cn(claseControl, "pl-9")}
          />
        </div>
        <Filtros<Filtro>
          id="envios"
          valor={filtro}
          onChange={setFiltro}
          opciones={[
            { valor: "todos", etiqueta: "Todos", cantidad: envios.length },
            { valor: "borrador", etiqueta: "Borradores", cantidad: cuenta("borrador") },
            { valor: "en_curso", etiqueta: "En curso", cantidad: cuenta("en_curso") },
            { valor: "programado", etiqueta: "Programados", cantidad: cuenta("programado") },
            { valor: "terminado", etiqueta: "Terminados", cantidad: cuenta("terminado") },
            { valor: "cancelado", etiqueta: "Cancelados", cantidad: cuenta("cancelado") },
            {
              valor: "automatizacion",
              etiqueta: "Automatizaciones",
              cantidad: envios.filter((e) => e.origen === "automatizacion").length,
            },
          ]}
        />
      </motion.div>

      {lista.length === 0 ? (
        <Vacio
          icono={Send}
          titulo={envios.length === 0 ? "Todavía no hay envíos" : "No hay envíos con ese filtro"}
          texto={envios.length === 0 ? "Armá el primero: elegís a quién, escribís el mensaje y lo revisás antes de aprobarlo." : undefined}
        >
          {puedeGestionar && envios.length === 0 && (
            <BotonLink href="/comunicaciones/envios/nuevo">
              <Plus className="size-4" />
              Nuevo envío
            </BotonLink>
          )}
        </Vacio>
      ) : (
        <motion.ul layout className="space-y-2">
          <AnimatePresence mode="popLayout">
            {lista.map((e, i) => (
              <EnvioItem key={e.id} envio={e} indice={i} destacado={e.estado === "borrador" && e.origen === "automatizacion"} />
            ))}
          </AnimatePresence>
        </motion.ul>
      )}
    </div>
  );
}
