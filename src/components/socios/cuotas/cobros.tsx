"use client";

import { useDeferredValue, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, ChevronDown, HandCoins, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";
import { MEDIOS, NOMBRE_MEDIO, nombrePersona, r2, type CobroLista, type Persona } from "@/lib/socios/cuotas";
import { anularCobro } from "@/app/(dashboard)/cuotas/actions";
import {
  Aviso,
  BadgeEstado,
  BadgeMedio,
  Boton,
  BotonLink,
  Campo,
  DialogoAnular,
  EncabezadoPagina,
  ImporteAnimado,
  Kpi,
  LinkAsiento,
  NumeroAnimado,
  Pastilla,
  Vacio,
  claseControl,
} from "./ui";

export function CobrosLista({
  cobros,
  error,
  filtros,
  puedeCobrar,
  puedeAnular,
  verAsientos,
}: {
  cobros: CobroLista[];
  error: string | null;
  filtros: { desde: string; hasta: string; medio: string | null; persona: Persona | null };
  puedeCobrar: boolean;
  puedeAnular: boolean;
  verAsientos: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [texto, setTexto] = useState("");
  const [verAnulados, setVerAnulados] = useState(false);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [anular, setAnular] = useState<CobroLista | null>(null);
  const q = useDeferredValue(texto.trim().toLowerCase());

  function navegar(cambios: Record<string, string | null>) {
    const sp = new URLSearchParams();
    const base = { desde: filtros.desde, hasta: filtros.hasta, medio: filtros.medio, persona: filtros.persona ? String(filtros.persona.id) : null };
    for (const [k, v] of Object.entries({ ...base, ...cambios })) if (v) sp.set(k, v);
    router.push(`${pathname}?${sp.toString()}`);
  }

  const vigentes = cobros.filter((c) => c.estado === "vigente");
  const lista = cobros
    .filter((c) => verAnulados || c.estado === "vigente")
    .filter((c) => !q || `${c.persona} ${c.cedula} ${c.referencia ?? ""}`.toLowerCase().includes(q));
  const total = r2(vigentes.reduce((s, c) => s + c.importe, 0));
  const aFavor = r2(vigentes.reduce((s, c) => s + c.saldo_a_favor, 0));

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Cuotas y cobranza"
        titulo="Cobros"
        descripcion="Transferencias, efectivo y débito Visa aplicados a las cuotas de cada persona."
      >
        {puedeCobrar && (
          <BotonLink href={filtros.persona ? `/cuotas/cobros/nuevo?persona=${filtros.persona.id}` : "/cuotas/cobros/nuevo"}>
            <Plus className="size-4" />
            Registrar cobro
          </BotonLink>
        )}
      </EncabezadoPagina>

      {error && <Aviso titulo="No se pudieron leer los cobros">{error}</Aviso>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi etiqueta="Cobrado en el período" delay={0.03}>
          <ImporteAnimado valor={total} moneda="UYU" />
        </Kpi>
        <Kpi etiqueta="Cobros vigentes" delay={0.06}>
          <NumeroAnimado valor={vigentes.length} />
        </Kpi>
        <Kpi etiqueta="Quedó como saldo a favor" delay={0.09} detalle="De estos cobros, sin aplicar todavía">
          <ImporteAnimado valor={aFavor} moneda="UYU" />
        </Kpi>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...easeSmooth, delay: 0.05 }}
        className="space-y-3 rounded-2xl border border-linea bg-white p-3"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[10rem_10rem_minmax(0,14rem)_minmax(0,1fr)]">
          <Campo etiqueta="Desde">
            <input type="date" value={filtros.desde} max={filtros.hasta} onChange={(e) => e.target.value && navegar({ desde: e.target.value })} className={claseControl} />
          </Campo>
          <Campo etiqueta="Hasta">
            <input type="date" value={filtros.hasta} min={filtros.desde} onChange={(e) => e.target.value && navegar({ hasta: e.target.value })} className={claseControl} />
          </Campo>
          <Campo etiqueta="Medio" className="col-span-2 sm:col-span-1">
            <select value={filtros.medio ?? ""} onChange={(e) => navegar({ medio: e.target.value || null })} className={claseControl}>
              <option value="">Todos</option>
              {MEDIOS.map((m) => (
                <option key={m} value={m}>
                  {NOMBRE_MEDIO[m]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Persona" className="col-span-2 sm:col-span-1">
            {filtros.persona ? (
              <div className="flex h-10 items-center justify-between gap-2 rounded-lg border border-bordo-100 bg-bordo-50/50 px-3 text-sm">
                <span className="truncate">{nombrePersona(filtros.persona)}</span>
                <button type="button" onClick={() => navegar({ persona: null })} className="rounded-full p-0.5 text-muted-foreground hover:text-foreground" aria-label="Quitar filtro de persona">
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre, cédula o referencia…" className={cn(claseControl, "pl-9")} />
              </div>
            )}
          </Campo>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={verAnulados} onChange={(e) => setVerAnulados(e.target.checked)} className="size-4 accent-bordo-800" />
          Mostrar anulados ({cobros.length - vigentes.length})
        </label>
      </motion.div>

      {lista.length === 0 ? (
        <Vacio icono={HandCoins} titulo="No hay cobros con esos filtros" texto="Probá ampliar las fechas o quitar el medio." />
      ) : (
        <ul className="space-y-2">
          {lista.map((c, i) => {
            const open = abierto === c.id;
            return (
              <motion.li
                key={c.id}
                layout="position"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...easeSmooth, delay: Math.min(i, 12) * 0.03 }}
                className={cn("rounded-2xl border bg-white transition-shadow hover:shadow-card-hover", c.estado === "anulado" ? "border-linea opacity-60" : "border-linea")}
              >
                <button
                  type="button"
                  onClick={() => setAbierto(open ? null : c.id)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left sm:grid-cols-[6.5rem_minmax(0,1fr)_12rem_9rem_auto]"
                  aria-expanded={open}
                >
                  <div className="text-xs text-muted-foreground tabular-nums sm:text-sm sm:text-foreground">{formatFecha(c.fecha)}</div>
                  <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:row-start-auto">
                    <div className="truncate text-sm font-medium">{c.persona}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      CI {c.cedula}
                      {c.referencia && ` · ${c.referencia}`}
                    </div>
                  </div>
                  <div className="hidden sm:block">
                    <BadgeMedio medio={c.medio} detalle={c.disciplina} />
                  </div>
                  <div className="row-start-1 text-right sm:row-start-auto">
                    <div className="font-heading tabular-nums">{formatImporte(c.importe)}</div>
                    {c.saldo_a_favor > 0 && <div className="text-[11px] text-sky-700 tabular-nums">a favor {formatImporte(c.saldo_a_favor)}</div>}
                  </div>
                  <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
                    <span className="sm:hidden">
                      <BadgeMedio medio={c.medio} detalle={c.disciplina} />
                    </span>
                    <span className="flex items-center gap-2">
                      {c.estado === "anulado" && <BadgeEstado estado="anulado" />}
                      <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
                    </span>
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-3 border-t border-linea px-4 py-3">
                        {c.aplicaciones.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No se aplicó a ninguna cuota: todo quedó como saldo a favor.</p>
                        ) : (
                          <ul className="space-y-1 text-sm">
                            {c.aplicaciones.map((a, j) => (
                              <li key={`${a.cuota_id}-${j}`} className={cn("flex items-baseline justify-between gap-3", a.anulada && "line-through opacity-60")}>
                                <span className="min-w-0 truncate">
                                  {a.concepto}
                                  {a.saldoAFavor && (
                                    <span className="ml-1.5 text-[11px] text-sky-700">saldo a favor aplicado el {formatFecha(a.fecha)}</span>
                                  )}
                                </span>
                                <span className="shrink-0 tabular-nums">{formatImporte(a.importe)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {c.motivo_anulacion && <p className="text-xs text-rose-700">Anulado: {c.motivo_anulacion}</p>}
                        <div className="flex flex-wrap items-center gap-2">
                          {verAsientos && <LinkAsiento id={c.asiento_id} />}
                          {c.liquidacion_visa_id && <Pastilla tono="info">Liquidación Visa {c.liquidacion_visa_id}</Pastilla>}
                          <div className="flex-1" />
                          {puedeAnular && c.estado === "vigente" && c.medio !== "debito_visa" && (
                            <Boton variante="peligro" className="h-8 px-3 text-xs" onClick={() => setAnular(c)}>
                              <Ban className="size-3.5" />
                              Anular cobro
                            </Boton>
                          )}
                          {puedeAnular && c.estado === "vigente" && c.medio === "debito_visa" && (
                            <span className="text-[11px] text-muted-foreground">Se anula con su liquidación en Débito Visa.</span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </ul>
      )}

      <DialogoAnular
        open={!!anular}
        onOpenChange={(o) => !o && setAnular(null)}
        titulo={`Anular el cobro de ${anular?.persona ?? ""}`}
        descripcion={
          <span>
            {formatImporte(anular?.importe ?? 0, "UYU")} del {formatFecha(anular?.fecha)}. Se hace el contra-asiento y las cuotas
            vuelven a quedar con saldo. Si parte de este cobro ya se había aplicado como saldo a favor, eso también se revierte.
          </span>
        }
        anular={(motivo) => anularCobro({ id: anular!.id, motivo })}
      />
    </div>
  );
}
