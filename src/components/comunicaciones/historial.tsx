"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ChevronLeft, ChevronRight, History, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { easeSmooth } from "@/lib/motion";
import { CATEGORIAS, ESTADOS_MENSAJE, NOMBRE_ESTADO_MENSAJE, NOMBRE_ORIGEN, formatCorta } from "@/lib/comunicaciones/esquemas";
import { Aviso, BadgeCategoria, BadgeEstadoMensaje, BadgeOrigen, Boton, Campo, EncabezadoPagina, NumeroAnimado, Vacio, claseControl } from "./ui";
import { MensajeDialogo, type MensajeResumen } from "./mensaje-dialogo";

export type FiltrosHistorial = {
  estado: string;
  categoria: string;
  origen: string;
  q: string;
  persona: string;
  desde: string;
  hasta: string;
};

export type FilaHistorial = MensajeResumen & {
  categoria: string;
  persona_id: number | null;
  envio_id: string;
  envio_nombre: string;
  origen: string;
};

export function Historial({
  filas,
  total,
  pagina,
  porPagina,
  filtros,
  error,
}: {
  filas: FilaHistorial[];
  total: number;
  pagina: number;
  porPagina: number;
  filtros: FiltrosHistorial;
  error: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [cargando, start] = useTransition();
  const [f, setF] = useState(filtros);
  const [abierto, setAbierto] = useState<MensajeResumen | null>(null);
  const paginas = Math.max(1, Math.ceil(total / porPagina));

  function navegar(nuevos: FiltrosHistorial, nuevaPagina = 1) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(nuevos)) if (v) sp.set(k, v);
    if (nuevaPagina > 1) sp.set("pagina", String(nuevaPagina));
    start(() => router.push(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false }));
  }

  // La búsqueda por texto se aplica sola al dejar de escribir.
  useEffect(() => {
    if (f.q === filtros.q) return;
    const t = setTimeout(() => navegar(f), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.q]);

  function cambiar<K extends keyof FiltrosHistorial>(k: K, v: string) {
    const nuevos = { ...f, [k]: v };
    setF(nuevos);
    if (k !== "q") navegar(nuevos);
  }

  const hayFiltros = Object.values(filtros).some(Boolean);

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Comunicaciones"
        titulo="Historial"
        descripcion="Cada correo, uno por destinatario: qué se mandó, cuándo y cómo terminó."
      />

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
            value={f.q}
            onChange={(e) => setF({ ...f, q: e.target.value })}
            placeholder="Buscá por correo o nombre…"
            className={cn(claseControl, "pl-9")}
          />
          {cargando && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-bordo-700" />}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Campo etiqueta="Estado">
            <select value={f.estado} onChange={(e) => cambiar("estado", e.target.value)} className={claseControl}>
              <option value="">Todos</option>
              {ESTADOS_MENSAJE.map((e) => (
                <option key={e} value={e}>
                  {NOMBRE_ESTADO_MENSAJE[e]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Categoría">
            <select value={f.categoria} onChange={(e) => cambiar("categoria", e.target.value)} className={claseControl}>
              <option value="">Todas</option>
              {Object.entries(CATEGORIAS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Origen">
            <select value={f.origen} onChange={(e) => cambiar("origen", e.target.value)} className={claseControl}>
              <option value="">Todos</option>
              {Object.entries(NOMBRE_ORIGEN).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Desde">
            <input type="date" value={f.desde} onChange={(e) => cambiar("desde", e.target.value)} className={claseControl} />
          </Campo>
          <Campo etiqueta="Hasta">
            <input type="date" value={f.hasta} onChange={(e) => cambiar("hasta", e.target.value)} className={claseControl} />
          </Campo>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 text-xs text-muted-foreground">
          <span>
            <NumeroAnimado valor={total} className="font-medium text-foreground" /> mensaje{total === 1 ? "" : "s"}
            {filtros.persona && <span> · de la persona #{filtros.persona}</span>}
          </span>
          {hayFiltros && (
            <button
              type="button"
              onClick={() => {
                const vacios = { estado: "", categoria: "", origen: "", q: "", persona: "", desde: "", hasta: "" };
                setF(vacios);
                navegar(vacios);
              }}
              className="inline-flex items-center gap-1 text-bordo-800 hover:underline"
            >
              <X className="size-3" />
              Limpiar filtros
            </button>
          )}
        </div>
      </motion.div>

      {filas.length === 0 ? (
        <Vacio
          icono={History}
          titulo={hayFiltros ? "No hay mensajes con esos filtros" : "Todavía no hay mensajes"}
          texto={hayFiltros ? undefined : "Cada correo que se prepara queda registrado acá, se envíe o no."}
        />
      ) : (
        <div className={cn("transition-opacity", cargando && "opacity-60")}>
          <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-white">
            <AnimatePresence initial={false}>
              {filas.map((m, i) => (
                <motion.li
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 20) * 0.015 } }}
                  exit={{ opacity: 0 }}
                >
                  <button
                    type="button"
                    onClick={() => setAbierto(m)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-superficie/60 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{m.email}</span>
                      <span className="block truncate text-xs text-muted-foreground">{m.nombre ?? "—"}</span>
                    </span>
                    <span className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:row-start-auto">
                      <span className="block truncate text-xs text-foreground/80">{m.envio_nombre}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1">
                        <BadgeCategoria categoria={m.categoria} />
                        <BadgeOrigen origen={m.origen} />
                        {(m.motivo_omision || m.error) && (
                          <span className={cn("truncate text-[11px]", m.error ? "text-rose-700" : "text-muted-foreground")}>
                            {m.motivo_omision ?? m.error}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="col-start-2 row-start-1 flex flex-col items-end gap-0.5 md:col-start-auto md:row-start-auto">
                      <BadgeEstadoMensaje estado={m.estado} />
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {formatCorta(m.enviado_at ?? m.created_at)}
                      </span>
                    </span>
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {paginas > 1 && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <Boton variante="secundario" disabled={pagina <= 1 || cargando} onClick={() => navegar(filtros, pagina - 1)}>
                <ChevronLeft className="size-4" />
                Anterior
              </Boton>
              <span className="text-xs tabular-nums text-muted-foreground">
                Página {pagina} de {paginas}
              </span>
              <Boton variante="secundario" disabled={pagina >= paginas || cargando} onClick={() => navegar(filtros, pagina + 1)}>
                Siguiente
                <ChevronRight className="size-4" />
              </Boton>
            </div>
          )}
        </div>
      )}

      <MensajeDialogo mensaje={abierto} onClose={() => setAbierto(null)} />
    </div>
  );
}
