"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import { renderPlantilla, type Formato, type Variables } from "@/lib/comunicaciones/render";
import type { Encabezado } from "@/lib/comunicaciones/molde";
import { URL_BAJA_EJEMPLO, VARIABLES_EJEMPLO } from "@/lib/comunicaciones/esquemas";
import { VistaMail } from "./ui";

export type DestinatarioPrevia = {
  email: string;
  nombre: string | null;
  variables: Record<string, unknown>;
};

/**
 * Cómo le llega el correo a cada destinatario: mismo render que usa el
 * worker (renderPlantilla), en un iframe aislado.
 */
export function VistaPreviaDestinatarios({
  asunto,
  cuerpo,
  categoria,
  pie,
  destinatarios,
  alto,
  formato = "texto",
  usaMolde = true,
  encabezado,
  moldeHtml,
}: {
  formato?: Formato;
  usaMolde?: boolean;
  encabezado?: Encabezado | null;
  moldeHtml?: string | null;
  asunto: string;
  cuerpo: string;
  categoria: string;
  pie: string | null;
  destinatarios: DestinatarioPrevia[];
  alto?: string;
}) {
  const [i, setI] = useState(0);
  const lista = destinatarios.length > 0 ? destinatarios : null;
  const idx = lista ? Math.min(i, lista.length - 1) : 0;
  const actual = lista?.[idx] ?? null;
  const [dir, setDir] = useState(1);

  const r = useMemo(() => {
    const variables: Variables = actual
      ? { nombre: actual.nombre ?? "", ...actual.variables }
      : { ...VARIABLES_EJEMPLO };
    try {
      return renderPlantilla({ asunto, cuerpo, formato, usaMolde, encabezado }, variables, {
        pie,
        moldeHtml,
        bajaUrl: categoria === "difusion" || categoria === "personal" ? URL_BAJA_EJEMPLO : null,
        categoria,
      });
    } catch {
      // Mientras se escribe, una sección puede quedar abierta: se avisa en el editor.
      return {
        asunto,
        html: `<p style="font-family:sans-serif;color:#9f1239;padding:24px">La vista previa vuelve cuando las variables estén bien escritas.</p>`,
        texto: "",
      };
    }
  }, [actual, asunto, cuerpo, categoria, pie, formato, usaMolde, encabezado, moldeHtml]);

  function mover(d: number) {
    if (!lista) return;
    setDir(d);
    setI((v) => (Math.min(v, lista.length - 1) + d + lista.length) % lista.length);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-xl border border-linea bg-white p-1.5">
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => mover(-1)}
          disabled={!lista || lista.length < 2}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-superficie hover:text-foreground disabled:opacity-40"
          aria-label="Destinatario anterior"
        >
          <ChevronLeft className="size-4" />
        </motion.button>
        <div className="relative min-w-0 flex-1 overflow-hidden text-center">
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.div
              key={actual?.email ?? "ejemplo"}
              custom={dir}
              initial={{ opacity: 0, x: dir * 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -24 }}
              transition={{ duration: 0.22 }}
              className="flex min-w-0 items-center justify-center gap-2"
            >
              <UserRound className="size-4 shrink-0 text-bordo-700" />
              <div className="min-w-0 text-left">
                <div className="truncate text-sm font-medium">
                  {actual ? actual.nombre || actual.email : "Destinatario de ejemplo"}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {actual ? actual.email : "Con datos inventados para ver las variables"}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
        {lista && (
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {idx + 1}/{lista.length}
          </span>
        )}
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => mover(1)}
          disabled={!lista || lista.length < 2}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-superficie hover:text-foreground disabled:opacity-40"
          aria-label="Destinatario siguiente"
        >
          <ChevronRight className="size-4" />
        </motion.button>
      </div>
      <VistaMail html={r.html} asunto={r.asunto} className={alto} />
    </div>
  );
}
