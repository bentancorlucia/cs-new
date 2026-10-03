"use client";

import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Bold,
  Braces,
  Code2,
  Eye,
  FileCode2,
  Link2,
  List,
  ListTree,
  MousePointerClick,
  PanelTop,
  Pilcrow,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { analizarVariables, variablesDesconocidas, type Formato } from "@/lib/comunicaciones/render";
import { VARIABLES } from "@/lib/comunicaciones/esquemas";
import type { Encabezado } from "@/lib/comunicaciones/molde";
import { Switch } from "@/components/ui/switch";
import { Campo, claseControl } from "./ui";

export type VariableEditor = { clave: string; etiqueta: string; lista?: boolean };

const BOTON_HTML = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
  <tr>
    <td align="center" style="background:#730d32;border-radius:8px;">
      <a href="https://" target="_blank" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Texto del botón</a>
    </td>
  </tr>
</table>`;

const PARRAFO_HTML = `<p style="margin:0 0 16px;font-size:14px;color:#1f1f1f;">Texto</p>`;

/**
 * Asunto + cuerpo con selector de variables. Dos formatos: texto con
 * formato simple, o HTML (dentro del molde del club o completo). El
 * selector inserta en el último campo que tuvo el foco.
 */
export function EditorCuerpo({
  asunto,
  cuerpo,
  onAsunto,
  onCuerpo,
  errorAsunto,
  errorCuerpo,
  deshabilitado,
  formato = "texto",
  onFormato,
  usaMolde = true,
  onUsaMolde,
  variables = VARIABLES,
  encabezado,
  onEncabezado,
}: {
  asunto: string;
  cuerpo: string;
  onAsunto: (v: string) => void;
  onCuerpo: (v: string) => void;
  errorAsunto?: string | null;
  errorCuerpo?: string | null;
  deshabilitado?: boolean;
  formato?: Formato;
  /** Sin esto, el formato es fijo. */
  onFormato?: (f: Formato) => void;
  usaMolde?: boolean;
  onUsaMolde?: (v: boolean) => void;
  variables?: readonly VariableEditor[];
  /** Título, subtítulo, vista previa y firma del molde. */
  encabezado?: Encabezado;
  onEncabezado?: (e: Encabezado) => void;
}) {
  const refAsunto = useRef<HTMLInputElement>(null);
  const refCuerpo = useRef<HTMLTextAreaElement>(null);
  const ultimo = useRef<"asunto" | "cuerpo">("cuerpo");
  const html = formato === "html";
  const textosEncabezado = Object.values(encabezado ?? {}).map((v) => v ?? "");
  const { error: errorVariables } = analizarVariables(asunto, cuerpo, ...textosEncabezado);
  const desconocidas = errorVariables
    ? []
    : variablesDesconocidas(variables.map((v) => v.clave), asunto, cuerpo, ...textosEncabezado);
  const conMolde = !html || usaMolde;
  const campoEnc = (k: keyof Encabezado, v: string) => onEncabezado?.({ ...(encabezado ?? {}), [k]: v });

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
      return html ? { texto: `<strong>${t}</strong>`, cursor: [8, 8 + t.length] } : { texto: `**${t}**`, cursor: [2, 2 + t.length] };
    });
  }

  function enlace() {
    editarCuerpo((sel) => {
      const t = sel || "texto del enlace";
      const url = "https://";
      if (html) {
        const pre = `<a href="`;
        return { texto: `${pre}${url}" style="color:#730d32;font-weight:600;">${t}</a>`, cursor: [pre.length, pre.length + url.length] };
      }
      return { texto: `[${t}](${url})`, cursor: [t.length + 3, t.length + 3 + url.length] };
    });
  }

  function lista() {
    editarCuerpo((sel) => {
      const lineas = (sel || "Primer punto\nSegundo punto").split("\n");
      if (html) {
        const texto = `<ul style="margin:0 0 16px;padding-left:20px;">\n${lineas.map((l) => `  <li>${l}</li>`).join("\n")}\n</ul>`;
        return { texto };
      }
      const texto = lineas.map((l) => (l.startsWith("- ") ? l : `- ${l}`)).join("\n");
      return { texto: `\n${texto}\n`, cursor: [1, 1 + texto.length] };
    });
  }

  function insertar(texto: string) {
    editarCuerpo(() => ({ texto }));
  }

  function siHayDato() {
    const v = variables.find((x) => !x.clave.includes("."))?.clave ?? "dato";
    editarCuerpo((sel) => {
      const adentro = sel || "Esto se muestra solo si hay dato";
      const ini = `{{#${v}}}`;
      return { texto: `${ini}${adentro}{{/${v}}}`, cursor: [2, 3 + v.length] };
    });
  }

  function insertarVariable(v: VariableEditor) {
    if (v.lista) {
      const campos = variables.filter((x) => x.clave.startsWith(`${v.clave}.`)).map((x) => x.clave.split(".")[1]);
      const fila = campos.map((c) => `{{${c}}}`).join(" — ") || "…";
      editarCuerpo(() => ({ texto: `{{#${v.clave}}}\n  ${html ? `<p>${fila}</p>` : fila}\n{{/${v.clave}}}` }));
      return;
    }
    const nombre = v.clave.includes(".") ? v.clave.split(".")[1] : v.clave;
    const t = `{{${nombre}}}`;
    if (ultimo.current === "asunto" && refAsunto.current) {
      const el = refAsunto.current;
      const ini = el.selectionStart ?? asunto.length;
      const fin = el.selectionEnd ?? asunto.length;
      onAsunto(asunto.slice(0, ini) + t + asunto.slice(fin));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(ini + t.length, ini + t.length);
      });
    } else {
      insertar(t);
    }
  }

  /** Tab inserta dos espacios en el HTML (en vez de saltar de campo). */
  function teclas(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!html || e.key !== "Tab" || e.shiftKey) return;
    e.preventDefault();
    insertar("  ");
  }

  const herramienta =
    "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-superficie hover:text-foreground disabled:opacity-50";
  const errorMostrado = errorCuerpo ?? (errorVariables ? `Revisá las variables: ${errorVariables}` : null);

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

      {onFormato && (
        <div className="space-y-1.5">
          <span className="px-0.5 text-[10px] uppercase tracking-editorial text-muted-foreground">Formato</span>
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-linea bg-superficie/50 p-1">
            {(
              [
                { f: "texto", icono: Type, nombre: "Texto con formato", ayuda: "Negrita, enlaces y listas" },
                { f: "html", icono: FileCode2, nombre: "HTML", ayuda: "Diseño libre" },
              ] as const
            ).map(({ f, icono: Icono, nombre, ayuda }) => (
              <motion.button
                key={f}
                type="button"
                whileTap={{ scale: 0.97 }}
                disabled={deshabilitado}
                onClick={() => onFormato(f)}
                className={cn(
                  "relative flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors",
                  formato === f ? "text-bordo-900" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {formato === f && (
                  <motion.span
                    layoutId="formato-activo"
                    className="absolute inset-0 rounded-lg bg-white shadow-sm ring-1 ring-bordo-800/10"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <Icono className="relative size-4 shrink-0" />
                <span className="relative min-w-0">
                  <span className="block text-sm font-medium">{nombre}</span>
                  <span className="block truncate text-[11px] opacity-70">{ayuda}</span>
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence initial={false}>
        {html && onUsaMolde && (
          <motion.label
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-linea px-3 py-2.5"
          >
            <span>
              <span className="block text-sm font-medium">Usar el molde del club</span>
              <span className="block text-xs text-muted-foreground">
                {usaMolde
                  ? "Tu HTML va en el cuerpo, entre el encabezado bordó con el escudo y el pie con los datos del club."
                  : "Tu HTML es el correo completo (con <html> y <body>), sin el encabezado ni el pie del club. En difusión, usá {{enlace_baja}} o se agrega un pie de baja."}
              </span>
            </span>
            <Switch checked={usaMolde} onCheckedChange={onUsaMolde} disabled={deshabilitado} />
          </motion.label>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {onEncabezado && conMolde && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 rounded-xl border border-bordo-100 bg-bordo-50/30 p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-editorial text-bordo-800">
                <PanelTop className="size-3.5" />
                Encabezado del correo
                <span className="normal-case tracking-normal text-muted-foreground">· admite datos como {"{{nombre}}"}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo etiqueta="Título" ayuda="Va grande sobre el bordó. Vacío = el asunto.">
                  <input
                    value={encabezado?.titulo ?? ""}
                    disabled={deshabilitado}
                    onChange={(e) => campoEnc("titulo", e.target.value)}
                    maxLength={300}
                    placeholder={asunto || "¡Feliz cumpleaños, {{nombre}}!"}
                    className={claseControl}
                  />
                </Campo>
                <Campo etiqueta="Subtítulo" ayuda="Línea dorada bajo el título (opcional).">
                  <input
                    value={encabezado?.subtitulo ?? ""}
                    disabled={deshabilitado}
                    onChange={(e) => campoEnc("subtitulo", e.target.value)}
                    maxLength={300}
                    placeholder="Socio/a N.º {{numero_socio}}"
                    className={claseControl}
                  />
                </Campo>
              </div>
              <Campo etiqueta="Texto de vista previa" ayuda="Lo que muestra la bandeja de entrada junto al asunto (opcional).">
                <input
                  value={encabezado?.preencabezado ?? ""}
                  disabled={deshabilitado}
                  onChange={(e) => campoEnc("preencabezado", e.target.value)}
                  maxLength={300}
                  placeholder="Todo Club Seminario te desea un muy feliz cumpleaños 🎉"
                  className={claseControl}
                />
              </Campo>
              <Campo etiqueta="Firma" ayuda="Una o dos líneas; la última va destacada en bordó. Vacía = sin firma.">
                <textarea
                  value={encabezado?.firma ?? ""}
                  disabled={deshabilitado}
                  onChange={(e) => campoEnc("firma", e.target.value)}
                  rows={2}
                  maxLength={300}
                  placeholder={"Un abrazo grande,\nComisión Directiva de Club Seminario"}
                  className={cn(claseControl, "h-auto py-2")}
                />
              </Campo>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-1">
        <span className="px-0.5 text-[10px] uppercase tracking-editorial text-muted-foreground">
          {html ? "HTML del mensaje" : "Mensaje"}
        </span>
        <div
          className={cn(
            "overflow-hidden rounded-lg border bg-white transition-all focus-within:border-bordo-700 focus-within:ring-3 focus-within:ring-bordo-800/10",
            errorMostrado ? "border-rose-300" : "border-linea hover:border-bordo-200"
          )}
        >
          <div className="flex flex-wrap items-center gap-0.5 border-b border-linea bg-superficie/50 px-1.5 py-1">
            <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={negrita} disabled={deshabilitado} className={herramienta} title="Negrita" aria-label="Negrita">
              <Bold className="size-3.5" />
              <span className="hidden sm:inline">Negrita</span>
            </motion.button>
            <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={enlace} disabled={deshabilitado} className={herramienta} title="Enlace" aria-label="Enlace">
              <Link2 className="size-3.5" />
              <span className="hidden sm:inline">Enlace</span>
            </motion.button>
            <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={lista} disabled={deshabilitado} className={herramienta} title="Lista" aria-label="Lista">
              <List className="size-3.5" />
              <span className="hidden sm:inline">Lista</span>
            </motion.button>
            {html && (
              <>
                <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={() => insertar(PARRAFO_HTML)} disabled={deshabilitado} className={herramienta} title="Párrafo" aria-label="Párrafo">
                  <Pilcrow className="size-3.5" />
                  <span className="hidden sm:inline">Párrafo</span>
                </motion.button>
                <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={() => insertar(BOTON_HTML)} disabled={deshabilitado} className={herramienta} title="Botón" aria-label="Botón">
                  <MousePointerClick className="size-3.5" />
                  <span className="hidden sm:inline">Botón</span>
                </motion.button>
              </>
            )}
            <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={siHayDato} disabled={deshabilitado} className={herramienta} title="Mostrar solo si hay dato" aria-label="Mostrar solo si hay dato">
              <Eye className="size-3.5" />
              <span className="hidden sm:inline">Si hay dato</span>
            </motion.button>
            <span className="ml-auto hidden px-2 text-[11px] text-muted-foreground md:inline">
              {html ? (
                <span className="inline-flex items-center gap-1">
                  <Code2 className="size-3" /> Estilos en línea (style=&quot;…&quot;) para que se vean en todos los correos
                </span>
              ) : (
                "Línea en blanco = párrafo nuevo"
              )}
            </span>
          </div>
          <textarea
            ref={refCuerpo}
            value={cuerpo}
            disabled={deshabilitado}
            onFocus={() => (ultimo.current = "cuerpo")}
            onChange={(e) => onCuerpo(e.target.value)}
            onKeyDown={teclas}
            rows={html ? 20 : 12}
            spellCheck={!html}
            placeholder={html ? '<h2 style="color:#730d32;">Hola {{nombre}}</h2>\n<p>…</p>' : "Hola {{nombre}}:\n\nEscribí acá el mensaje…"}
            className={cn(
              "block w-full resize-y bg-white px-3 py-2.5 font-mono leading-relaxed outline-none placeholder:text-muted-foreground/70",
              html ? "min-h-96 text-[12px] whitespace-pre" : "min-h-56 text-[13px]"
            )}
          />
        </div>
        <AnimatePresence initial={false}>
          {errorMostrado && (
            <motion.span
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="block px-0.5 text-xs text-rose-700"
            >
              {errorMostrado}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 px-0.5 text-[11px] text-muted-foreground">
          <Braces className="size-3.5" />
          Insertar un dato (en el asunto o el mensaje, donde esté el cursor):
        </div>
        <div className="flex flex-wrap gap-1.5">
          {variables.map((v) => (
            <motion.button
              key={v.clave}
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.94 }}
              disabled={deshabilitado}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertarVariable(v)}
              className={cn(
                "rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors",
                v.lista
                  ? "border-dorado-300 bg-dorado-100/60 text-dorado-900 hover:bg-dorado-100"
                  : "border-bordo-100 bg-bordo-50/60 text-bordo-800 hover:bg-bordo-100"
              )}
              title={"ejemplo" in v ? `Ej: ${(v as { ejemplo?: string }).ejemplo}` : v.etiqueta}
            >
              {v.lista ? <ListTree className="mr-1 inline size-3" /> : null}
              {v.lista ? `{{#${v.clave}}}` : `{{${v.clave.includes(".") ? v.clave.split(".")[1] : v.clave}}}`}
              <span className="ml-1 font-sans opacity-60">{v.etiqueta}</span>
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
