"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, History, Lock, Search, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha } from "@/lib/contabilidad/formato";
import { nombreSocio, type CambioDisciplina, type SocioDisciplina } from "@/lib/socios/panel-disciplina";
import { Explicacion, Filtros, Panel, Vacio, claseControl } from "@/components/socios/cuotas/ui";
import { BadgeOrigen, BadgeTipoCambio, EstadoDebito, diferencias, etiquetaCampo, valorCambio } from "./ui";

type Filtro = "todos" | "pendientes" | "representante" | "club";

const PAGINA = 50;

function fechaHora(iso: string) {
  try {
    return new Intl.DateTimeFormat("es-UY", {
      timeZone: "America/Montevideo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return formatFecha(iso.slice(0, 10));
  }
}

export function CambiosPanel({ cambios, socios }: { cambios: CambioDisciplina[]; socios: SocioDisciplina[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [texto, setTexto] = useState("");
  const [mostrar, setMostrar] = useState(PAGINA);
  const nombres = useMemo(() => new Map(socios.map((s) => [s.persona_id, nombreSocio(s)])), [socios]);

  const cuenta = {
    todos: cambios.length,
    pendientes: cambios.filter((c) => c.estado_debito === "pendiente").length,
    representante: cambios.filter((c) => c.origen === "representante").length,
    club: cambios.filter((c) => c.origen === "club").length,
  };
  const q = texto.trim().toLowerCase();
  const filtrados = cambios.filter((c) => {
    if (filtro === "pendientes" && c.estado_debito !== "pendiente") return false;
    if ((filtro === "representante" || filtro === "club") && c.origen !== filtro) return false;
    if (!q) return true;
    const quien = c.persona_id ? (nombres.get(c.persona_id) ?? "") : "";
    return `${c.descripcion} ${quien} ${c.hecho_por_nombre ?? ""}`.toLowerCase().includes(q);
  });
  const visibles = filtrados.slice(0, mostrar);

  return (
    <Panel titulo="Registro de cambios" icono={History}>
      <div className="space-y-3 border-b border-linea p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setMostrar(PAGINA);
            }}
            placeholder="Buscar por socio, cambio o quién lo hizo…"
            className={cn(claseControl, "pl-9")}
            aria-label="Buscar cambio"
          />
        </div>
        <Filtros<Filtro>
          id="cambios-disc"
          valor={filtro}
          onChange={(v) => {
            setFiltro(v);
            setMostrar(PAGINA);
          }}
          opciones={[
            { valor: "todos", etiqueta: "Todos", cantidad: cuenta.todos },
            { valor: "pendientes", etiqueta: "Pendientes en Visa", cantidad: cuenta.pendientes },
            { valor: "representante", etiqueta: "De la disciplina", cantidad: cuenta.representante },
            { valor: "club", etiqueta: "Del club", cantidad: cuenta.club },
          ]}
        />
      </div>

      {filtrados.length === 0 ? (
        <div className="p-4">
          <Vacio icono={History} titulo={cambios.length ? "Ningún cambio con ese filtro" : "Todavía no hay cambios registrados"} />
        </div>
      ) : (
        <ol className="relative">
          <AnimatePresence initial={false}>
            {visibles.map((c, i) => {
              const difs = diferencias(c.antes, c.despues);
              const socio = c.persona_id ? nombres.get(c.persona_id) : null;
              return (
                <motion.li
                  key={c.id}
                  layout="position"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(i, 15) * 0.02 }}
                  className="relative border-b border-linea py-3 pr-4 pl-9 last:border-0"
                >
                  <span
                    className={cn(
                      "absolute top-4 left-4 size-2.5 rounded-full ring-4 ring-white",
                      c.estado_debito === "pendiente" ? "bg-amber-500" : c.origen === "representante" ? "bg-bordo-700" : "bg-slate-400"
                    )}
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <BadgeTipoCambio tipo={c.tipo} />
                    <BadgeOrigen origen={c.origen} />
                    <EstadoDebito c={c} />
                    {c.tarjeta_pendiente && (
                      <span className="inline-flex h-5 items-center gap-1 rounded-full border border-linea bg-white px-2 text-[11px] text-muted-foreground">
                        <Lock className="size-3" />
                        Número guardado para tesorería
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-foreground">{c.descripcion}</div>
                  {socio && (
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <UserRound className="size-3" />
                      {socio}
                    </div>
                  )}
                  {difs.length > 0 && (
                    <dl className="mt-2 space-y-1 rounded-lg bg-superficie/60 px-3 py-2 text-xs">
                      {difs.map((d) => (
                        <div key={d.campo} className="flex flex-wrap items-center gap-x-1.5">
                          <dt className="text-muted-foreground">{etiquetaCampo(d.campo)}:</dt>
                          <dd className="flex min-w-0 flex-wrap items-center gap-1.5">
                            {d.antes !== undefined && (
                              <>
                                <span className="break-all text-muted-foreground line-through decoration-rose-300">{valorCambio(d.antes)}</span>
                                <ArrowRight className="size-3 text-muted-foreground" />
                              </>
                            )}
                            <span className="break-all font-medium">{valorCambio(d.despues)}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <div className="mt-1.5 text-[11px] text-muted-foreground">
                    {fechaHora(c.created_at)}
                    {c.hecho_por_nombre ? ` · ${c.hecho_por_nombre}` : ""}
                    {c.vigencia ? ` · rige desde ${formatFecha(c.vigencia)}` : ""}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
      {filtrados.length > visibles.length && (
        <div className="border-t border-linea px-4 py-3 text-center">
          <button type="button" onClick={() => setMostrar((n) => n + PAGINA)} className="text-xs font-medium text-bordo-800 hover:underline">
            Ver {Math.min(PAGINA, filtrados.length - visibles.length)} cambios más
          </button>
        </div>
      )}
      <div className="border-t border-linea px-4 py-2">
        <Explicacion>
          Todo lo que se cambia en la disciplina queda registrado. Lo que afecta al débito (altas, bajas, tarjetas, planes y precios) queda
          &quot;Pendiente de cargar en Visa&quot; hasta que tesorería lo carga en el portal.
        </Explicacion>
      </div>
    </Panel>
  );
}
