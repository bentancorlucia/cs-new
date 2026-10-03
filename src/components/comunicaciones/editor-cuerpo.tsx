"use client";

import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Bold, Braces, Link2, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { variablesUsadas } from "@/lib/comunicaciones/render";
import { CLAVES_VARIABLES, VARIABLES } from "@/lib/comunicaciones/esquemas";
import { Campo, claseControl } from "./ui";

/** Variables que no existen en las audiencias (quedarían vacías). */
export function variablesDesconocidas(...textos: string[]) {
  return variablesUsadas(textos.join("\n")).filter((v) => !CLAVES_VARIABLES.includes(v));
}

/**
 * Asunto + cuerpo con formato simple y selector de variables. El selector
 * inserta en el último campo que tuvo el foco.
 */
export function EditorCuerpo({
  asunto,
  cuerpo,
  onAsunto,
  onCuerpo,
  errorAsunto,
  errorCuerpo,
  deshabilitado,
}: {
  asunto: string;
  cuerpo: string;
  onAsunto: (v: string) => void;
  onCuerpo: (v: string) => void;
  errorAsunto?: string | null;
  errorCuerpo?: string | null;
  deshabilitado?: boolean;
}) {
  const refAsunto = useRef<HTMLInputElement>(null);
  const refCuerpo = useRef<HTMLTextAreaElement>(null);
  const ultimo = useRef<"asunto" | "cuerpo">("cuerpo");
  const desconocidas = variablesDesconocidas(asunto, cuerpo);

  /** Reemplaza la selección del cuerpo (o inserta en el cursor) y deja el cursor donde corresponde. */
  function editarCuerpo(fn: (sel: string) => { texto: string; cursor?: [number, number] }) {
    const el = refCuerpo.current;
    if (!el) return;
    const ini = el.selectionStart ?? cuerpo.length;
    const fin = el.selectionEnd ?? cuerpo.length;
    const { texto, cursor } = fn(cuerpo.slice(ini, fin));
    const nuevo = cuerpo.slice(0, ini) + texto + cuerpo.slice(fin);
    onCuerpo(nuevo);
    requestAnimationFrame(() => {
      el.focus();
      const [a, b] = cursor ? [ini + cursor[0], ini + cursor[1]] : [ini + texto.length, ini + texto.length];
      el.setSelectionRange(a, b);
    });
  }

  function negrita() {
    editarCuerpo((sel) => {
      const t = sel || "texto en negrita";
      return { texto: `**${t}**`, cursor: [2, 2 + t.length] };
    });
  }

  function enlace() {
    editarCuerpo((sel) => {
      const t = sel || "texto del enlace";
      const url = "https://";
      return { texto: `[${t}](${url})`, cursor: [t.length + 3, t.length + 3 + url.length] };
    });
  }

  function lista() {
    editarCuerpo((sel) => {
      const lineas = (sel || "Primer punto\nSegundo punto").split("\n");
      const texto = lineas.map((l) => (l.startsWith("- ") ? l : `- ${l}`)).join("\n");
      return { texto: `\n${texto}\n`, cursor: [1, 1 + texto.length] };
    });
  }

  function insertarVariable(clave: string) {
    const v = `{{${clave}}}`;
    if (ultimo.current === "asunto" && refAsunto.current) {
      const el = refAsunto.current;
      const ini = el.selectionStart ?? asunto.length;
      const fin = el.selectionEnd ?? asunto.length;
      onAsunto(asunto.slice(0, ini) + v + asunto.slice(fin));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(ini + v.length, ini + v.length);
      });
    } else {
      editarCuerpo(() => ({ texto: v }));
    }
  }

  const herramienta =
    "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-superficie hover:text-foreground disabled:opacity-50";

  return (
    <div className="space-y-3">
      <Campo etiqueta="Asunto" error={errorAsunto}>
        <input
          ref={refAsunto}
          value={asunto}
          disabled={deshabilitado}
          onFocus={() => (ultimo.current = "asunto")}
          onChange={(e) => onAsunto(e.target.value)}
          maxLength={300}
          placeholder="Ej: Novedades de {{disciplinas}}"
          aria-invalid={!!errorAsunto}
          className={claseControl}
        />
      </Campo>

      <div className="space-y-1">
        <span className="px-0.5 text-[10px] uppercase tracking-editorial text-muted-foreground">Mensaje</span>
        <div
          className={cn(
            "overflow-hidden rounded-lg border bg-white transition-all focus-within:border-bordo-700 focus-within:ring-3 focus-within:ring-bordo-800/10",
            errorCuerpo ? "border-rose-300" : "border-linea hover:border-bordo-200"
          )}
        >
          <div className="flex flex-wrap items-center gap-0.5 border-b border-linea bg-superficie/50 px-1.5 py-1">
            <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={negrita} disabled={deshabilitado} className={herramienta} title="Negrita">
              <Bold className="size-3.5" />
              <span className="hidden sm:inline">Negrita</span>
            </motion.button>
            <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={enlace} disabled={deshabilitado} className={herramienta} title="Enlace">
              <Link2 className="size-3.5" />
              <span className="hidden sm:inline">Enlace</span>
            </motion.button>
            <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={lista} disabled={deshabilitado} className={herramienta} title="Lista">
              <List className="size-3.5" />
              <span className="hidden sm:inline">Lista</span>
            </motion.button>
            <span className="ml-auto hidden px-2 text-[11px] text-muted-foreground md:inline">
              Línea en blanco = párrafo nuevo
            </span>
          </div>
          <textarea
            ref={refCuerpo}
            value={cuerpo}
            disabled={deshabilitado}
            onFocus={() => (ultimo.current = "cuerpo")}
            onChange={(e) => onCuerpo(e.target.value)}
            rows={12}
            placeholder={"Hola {{nombre}}:\n\nEscribí acá el mensaje…"}
            className="block min-h-56 w-full resize-y bg-white px-3 py-2.5 font-mono text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/70"
          />
        </div>
        <AnimatePresence initial={false}>
          {errorCuerpo && (
            <motion.span
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="block px-0.5 text-xs text-rose-700"
            >
              {errorCuerpo}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 px-0.5 text-[11px] text-muted-foreground">
          <Braces className="size-3.5" />
          Insertar dato del destinatario (en el asunto o el mensaje, donde esté el cursor):
        </div>
        <div className="flex flex-wrap gap-1.5">
          {VARIABLES.map((v) => (
            <motion.button
              key={v.clave}
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.94 }}
              disabled={deshabilitado}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertarVariable(v.clave)}
              className="rounded-full border border-bordo-100 bg-bordo-50/60 px-2.5 py-1 font-mono text-[11px] text-bordo-800 transition-colors hover:bg-bordo-100"
              title={`Ej: ${v.ejemplo}`}
            >
              {`{{${v.clave}}}`}
              <span className="ml-1 font-sans text-bordo-800/60">{v.etiqueta}</span>
            </motion.button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {desconocidas.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex gap-2 rounded-xl border border-dorado-300 bg-dorado-100/60 px-3 py-2 text-xs text-dorado-900">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {desconocidas.length === 1 ? "La variable " : "Las variables "}
                {desconocidas.map((d, i) => (
                  <span key={d}>
                    {i > 0 && ", "}
                    <code className="font-mono">{`{{${d}}}`}</code>
                  </span>
                ))}{" "}
                no {desconocidas.length === 1 ? "existe" : "existen"}: en el correo {desconocidas.length === 1 ? "va a quedar" : "van a quedar"} vacía
                {desconocidas.length === 1 ? "" : "s"}.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
