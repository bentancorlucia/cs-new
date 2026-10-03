"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowRight, FileCode2, FileText, Lock, Plus, Search, Send, ShoppingBag, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { easeSmooth } from "@/lib/motion";
import { formatCorta } from "@/lib/comunicaciones/esquemas";
import { Aviso, BadgeCategoria, BotonLink, EncabezadoPagina, Filtros, Vacio, claseControl, pill } from "./ui";
import type { PlantillaFila } from "./tipos";

type Filtro = "activas" | "todas" | "inactivas" | "sistema" | "automaticos";

export function PlantillasLista({
  plantillas,
  usos,
  puedeGestionar,
  error,
}: {
  plantillas: PlantillaFila[];
  usos: Record<string, string[]>;
  puedeGestionar: boolean;
  error: string | null;
}) {
  const [filtro, setFiltro] = useState<Filtro>("activas");
  const [texto, setTexto] = useState("");
  const q = useDeferredValue(texto.trim().toLowerCase());
  const lista = useMemo(
    () =>
      plantillas.filter((p) => {
        if (filtro === "activas" && !p.activa) return false;
        if (filtro === "inactivas" && p.activa) return false;
        if (filtro === "sistema" && !p.sistema) return false;
        if (filtro === "automaticos" && !p.transaccional) return false;
        return !q || `${p.nombre} ${p.clave} ${p.asunto}`.toLowerCase().includes(q);
      }),
    [plantillas, filtro, q]
  );

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Comunicaciones"
        titulo="Plantillas"
        descripcion="Textos reutilizables con datos del destinatario, en texto con formato o en HTML. Las del sistema (automatizaciones y los mails de la tienda y eventos) se editan y se pueden restaurar, pero no se borran."
      >
        {puedeGestionar && (
          <BotonLink href="/comunicaciones/plantillas/nueva">
            <Plus className="size-4" />
            Nueva plantilla
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
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscá por nombre, clave o asunto…" className={cn(claseControl, "pl-9")} />
        </div>
        <Filtros<Filtro>
          id="plantillas"
          valor={filtro}
          onChange={setFiltro}
          opciones={[
            { valor: "activas", etiqueta: "Activas", cantidad: plantillas.filter((p) => p.activa).length },
            { valor: "inactivas", etiqueta: "Desactivadas", cantidad: plantillas.filter((p) => !p.activa).length },
            { valor: "automaticos", etiqueta: "Mails de tienda y eventos", cantidad: plantillas.filter((p) => p.transaccional).length },
            { valor: "sistema", etiqueta: "Del sistema", cantidad: plantillas.filter((p) => p.sistema).length },
            { valor: "todas", etiqueta: "Todas", cantidad: plantillas.length },
          ]}
        />
      </motion.div>

      {lista.length === 0 ? (
        <Vacio icono={FileText} titulo="No hay plantillas con ese filtro" />
      ) : (
        <motion.ul layout className="grid gap-3 md:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {lista.map((p, i) => (
              <motion.li
                key={p.id}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0, transition: { ...easeSmooth, delay: Math.min(i, 12) * 0.035 } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
              >
                <motion.div
                  whileHover={{ y: -2 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  className={cn(
                    "group flex h-full flex-col rounded-2xl border bg-white p-4 transition-shadow hover:shadow-card-hover",
                    p.activa ? "border-linea" : "border-dashed border-linea opacity-70"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-heading text-base text-foreground">{p.nombre}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{p.clave}</div>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      <BadgeCategoria categoria={p.categoria} />
                      {p.formato === "html" && (
                        <span className={cn(pill, "border-bordo-100 bg-bordo-50/60 text-bordo-800")}>
                          <FileCode2 className="size-3" />
                          HTML
                        </span>
                      )}
                      {p.transaccional && (
                        <span className={cn(pill, "border-dorado-300 bg-dorado-100/60 text-dorado-900")}>
                          <ShoppingBag className="size-3" />
                          Automático
                        </span>
                      )}
                      {p.sistema && !p.transaccional && (
                        <span className={cn(pill, "border-linea bg-superficie text-muted-foreground")}>
                          <Lock className="size-3" />
                          Sistema
                        </span>
                      )}
                      {!p.activa && <span className={cn(pill, "border-slate-200 bg-slate-100 text-slate-600")}>Desactivada</span>}
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-1 text-sm text-foreground/80">{p.asunto}</p>
                  <p className="mt-1 line-clamp-2 text-xs whitespace-pre-line text-muted-foreground">
                    {p.formato === "html"
                      ? p.cuerpo.replace(/<[^>]+>/g, " ").replace(/\{\{[#/^][^}]*\}\}/g, " ").replace(/\s+/g, " ").trim()
                      : p.cuerpo}
                  </p>
                  {usos[p.clave] && (
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-violet-800">
                      <Workflow className="size-3" />
                      La usa: {usos[p.clave].join(", ")}
                    </p>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <span className="text-[11px] text-muted-foreground">Editada {formatCorta(p.updated_at)}</span>
                    <div className="flex items-center gap-1">
                      {puedeGestionar && p.activa && !p.transaccional && (
                        <Link
                          href={`/comunicaciones/envios/nuevo?plantilla=${p.id}`}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-bordo-800 transition-colors hover:bg-bordo-50"
                        >
                          <Send className="size-3.5" />
                          Usar
                        </Link>
                      )}
                      <Link
                        href={`/comunicaciones/plantillas/${p.id}`}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-foreground/80 transition-colors hover:bg-superficie"
                      >
                        {puedeGestionar ? "Editar" : "Ver"}
                        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </div>
                  </div>
                </motion.div>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}
    </div>
  );
}
