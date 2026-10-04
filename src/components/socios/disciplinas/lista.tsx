"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowUpRight, CalendarClock, Dumbbell, Mail, Pencil, Phone, Plus, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import type { DisciplinaLista } from "@/lib/socios/disciplinas";
import { Boton, EncabezadoPagina, Explicacion, Filtros, NumeroAnimado, Pastilla, Vacio, claseControl } from "@/components/socios/cuotas/ui";
import { DialogoDisciplina, type DatosDisciplina } from "./form-disciplina";
import { Cifra, ImporteContador, claseSaldo } from "./ui";

type Filtro = "activas" | "todas";

export function ListaDisciplinas({
  disciplinas,
  puedeGestionar,
  verTesoreria,
}: {
  disciplinas: DisciplinaLista[];
  puedeGestionar: boolean;
  verTesoreria: boolean;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("activas");
  const [texto, setTexto] = useState("");
  const [nueva, setNueva] = useState(false);
  const [editar, setEditar] = useState<DatosDisciplina | null>(null);

  const visibles = useMemo(() => {
    const q = texto
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    return disciplinas.filter(
      (d) =>
        (filtro === "todas" || d.activa) &&
        (!q ||
          d.nombre
            .toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .includes(q))
    );
  }, [disciplinas, filtro, texto]);

  const activas = disciplinas.filter((d) => d.activa);
  const totalSocios = activas.reduce((s, d) => s + d.socios, 0);
  const totalPlanes = disciplinas.reduce((s, d) => s + d.planesVigentes, 0);
  const deudaTotal = disciplinas.reduce((s, d) => s + Math.max(0, d.saldo ?? 0), 0);
  const vencidoPlanes = disciplinas.reduce((s, d) => s + d.saldoVencidoPlanes, 0);

  return (
    <div className="min-w-0 space-y-5 pb-8">
      <EncabezadoPagina
        eyebrow={verTesoreria && !puedeGestionar ? "Tesorería" : "Secretaría"}
        titulo="Disciplinas"
        descripcion="Socios de cada disciplina, su cuenta corriente con el club y los planes de pago."
      >
        {puedeGestionar && (
          <Boton onClick={() => setNueva(true)} className="w-full sm:w-auto">
            <Plus className="size-4" />
            Nueva disciplina
          </Boton>
        )}
      </EncabezadoPagina>

      <div className={cn("grid gap-3", verTesoreria ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2")}>
        <Cifra etiqueta="Disciplinas activas" icono={Dumbbell} delay={0.02}>
          <NumeroAnimado valor={activas.length} />
        </Cifra>
        <Cifra etiqueta="Socios en disciplinas" icono={Users} delay={0.05} detalle="Inscripciones vigentes hoy">
          <NumeroAnimado valor={totalSocios} />
        </Cifra>
        {verTesoreria && (
          <>
            <Cifra etiqueta="Deuda con el club" tono={deudaTotal > 0 ? "alerta" : "neutro"} delay={0.08} detalle="Suma de lo que deben las disciplinas">
              <ImporteContador valor={deudaTotal} moneda="UYU" />
            </Cifra>
            <Cifra
              etiqueta="Planes de pago"
              icono={CalendarClock}
              tono={vencidoPlanes > 0 ? "alerta" : "neutro"}
              delay={0.11}
              detalle={vencidoPlanes > 0 ? `${formatImporte(vencidoPlanes, "UYU")} vencido` : "Sin cuotas vencidas"}
            >
              <NumeroAnimado valor={totalPlanes} />
            </Cifra>
          </>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <Filtros<Filtro>
          id="disciplinas"
          valor={filtro}
          onChange={setFiltro}
          opciones={[
            { valor: "activas", etiqueta: "Activas", cantidad: activas.length },
            { valor: "todas", etiqueta: "Todas", cantidad: disciplinas.length },
          ]}
        />
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar disciplina…" className={cn(claseControl, "pl-9")} />
        </div>
      </motion.div>

      {visibles.length === 0 ? (
        <Vacio icono={Dumbbell} titulo={disciplinas.length ? "Ninguna disciplina coincide" : "No hay disciplinas"} />
      ) : (
        <motion.ul layout className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {visibles.map((d, i) => (
              <motion.li
                key={d.id}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94], delay: Math.min(i, 12) * 0.035 }}
                whileHover={{ y: -3 }}
                className={cn("group relative flex min-w-0 flex-col rounded-2xl border border-linea bg-white transition-shadow hover:shadow-card-hover", !d.activa && "opacity-70")}
              >
                <Link href={`/secretaria/disciplinas/${d.id}`} className="flex flex-1 flex-col gap-3 p-4" aria-label={`Ver ${d.nombre}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-bordo-50 text-bordo-800">
                        {d.imagen_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={d.imagen_url} alt="" className="size-full object-cover" />
                        ) : (
                          <Dumbbell className="size-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate font-heading text-base text-foreground">{d.nombre}</h3>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {!d.activa && <Pastilla>Inactiva</Pastilla>}
                          {d.planesVigentes > 0 && (
                            <Pastilla tono={d.saldoVencidoPlanes > 0 ? "alerta" : "info"}>
                              {d.planesVigentes} plan{d.planesVigentes === 1 ? "" : "es"} de pago
                            </Pastilla>
                          )}
                        </div>
                      </div>
                    </div>
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-bordo-800" />
                  </div>

                  <div className={cn("grid gap-2", d.saldo !== null ? "grid-cols-2" : "grid-cols-1")}>
                    <div className="rounded-xl bg-superficie/70 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">Socios vigentes</div>
                      <div className="font-heading text-lg">
                        <NumeroAnimado valor={d.socios} />
                      </div>
                    </div>
                    {d.saldo !== null && (
                      <div className={cn("rounded-xl px-3 py-2", d.saldo > 0 ? "bg-rose-50/70" : "bg-superficie/70")}>
                        <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">{d.saldo < 0 ? "A favor" : "Debe al club"}</div>
                        <div className={cn("truncate font-heading text-lg", claseSaldo(d.saldo))}>
                          <ImporteContador valor={Math.abs(d.saldo)} />
                        </div>
                      </div>
                    )}
                  </div>

                  {d.saldoVencidoPlanes > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-rose-700">
                      <AlertTriangle className="size-3.5" />
                      {formatImporte(d.saldoVencidoPlanes, "UYU")} vencido en planes de pago
                    </div>
                  )}

                  {(d.contacto_nombre || d.contacto_telefono || d.contacto_email) && (
                    <div className="mt-auto space-y-1 border-t border-linea pt-2.5 text-xs text-muted-foreground">
                      {d.contacto_nombre && <div className="truncate text-foreground">{d.contacto_nombre}</div>}
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {d.contacto_telefono && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="size-3" />
                            {d.contacto_telefono}
                          </span>
                        )}
                        {d.contacto_email && (
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <Mail className="size-3 shrink-0" />
                            <span className="truncate">{d.contacto_email}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {d.ultimoMovimiento && <div className="text-[11px] text-muted-foreground">Último movimiento de cuenta: {formatFecha(d.ultimoMovimiento)}</div>}
                </Link>
                {puedeGestionar && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setEditar(d)}
                    className="absolute top-3 right-10 rounded-lg p-1.5 text-muted-foreground opacity-100 transition-all hover:bg-superficie hover:text-bordo-800 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                    aria-label={`Editar ${d.nombre}`}
                  >
                    <Pencil className="size-4" />
                  </motion.button>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      {verTesoreria && (
        <Explicacion>
          Debe al club: saldo de Fondos en poder de disciplinas (compras de la tienda a cuenta y cuotas cobradas en la cuenta de la disciplina, menos
          pagos y compensaciones).
        </Explicacion>
      )}

      {nueva && <DialogoDisciplina open onOpenChange={(o) => !o && setNueva(false)} alCrear={(id) => router.push(`/secretaria/disciplinas/${id}`)} />}
      {editar && <DialogoDisciplina key={editar.id} open disciplina={editar} onOpenChange={(o) => !o && setEditar(null)} />}
    </div>
  );
}
