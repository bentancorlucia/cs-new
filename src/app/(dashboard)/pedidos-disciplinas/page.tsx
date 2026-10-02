"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Plus,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TituloReporte } from "@/components/contabilidad/reportes/titulo-reporte";
import { ImporteAnimado } from "@/components/contabilidad/reportes/importe-animado";
import { NumeroAsiento } from "@/components/pedidos/asiento-link";
import {
  ESTILO_ESTADO,
  NOMBRE_ESTADO,
  pesos,
  type CuentaCorrienteDisciplinas,
  type PedidoDisciplinaFila,
} from "@/components/pedidos/tipos";
import { formatFecha, formatImporte, mensajeError } from "@/lib/contabilidad/formato";
import { fadeInUp, springSmooth, staggerContainerFast } from "@/lib/motion";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/hooks/use-document-title";

const POR_PAGINA = 20;

export default function PedidosDisciplinasPage() {
  useDocumentTitle("Pedidos de disciplinas");
  const [disciplinas, setDisciplinas] = useState<{ id: number; nombre: string }[]>([]);
  const [filtro, setFiltro] = useState<string>("all");
  const [pedidos, setPedidos] = useState<PedidoDisciplinaFila[]>([]);
  const [cc, setCc] = useState<CuentaCorrienteDisciplinas | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [cargandoPedidos, setCargandoPedidos] = useState(true);
  const [cargandoCc, setCargandoCc] = useState(true);

  useEffect(() => {
    createBrowserClient()
      .from("disciplinas")
      .select("id, nombre")
      .eq("activa", true)
      .order("nombre")
      .then(({ data }) => setDisciplinas(data ?? []));
  }, []);

  const cargarPedidos = useCallback(async () => {
    setCargandoPedidos(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(POR_PAGINA) });
      if (filtro !== "all") params.set("disciplina_id", filtro);
      const res = await fetch(`/api/admin/pedidos-disciplina?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setPedidos(json.data ?? []);
      setTotal(json.pagination?.total ?? 0);
      setTotalPages(json.pagination?.totalPages ?? 1);
    } catch (e) {
      toast.error(mensajeError({ message: (e as Error).message }));
      setPedidos([]);
    } finally {
      setCargandoPedidos(false);
    }
  }, [filtro, page]);

  const cargarCc = useCallback(async () => {
    setCargandoCc(true);
    try {
      const q = filtro !== "all" ? `?disciplina_id=${filtro}` : "";
      const res = await fetch(`/api/admin/pedidos-disciplina/cuenta-corriente${q}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setCc(json);
    } catch (e) {
      toast.error(mensajeError({ message: (e as Error).message }));
    } finally {
      setCargandoCc(false);
    }
  }, [filtro]);

  useEffect(() => {
    cargarPedidos();
  }, [cargarPedidos]);
  useEffect(() => {
    cargarCc();
  }, [cargarCc]);

  const elegir = (v: string) => {
    setFiltro(v);
    setPage(1);
  };
  const disciplinaElegida = disciplinas.find((d) => String(d.id) === filtro);
  const saldoElegida = cc?.saldos.find((s) => String(s.disciplina_id) === filtro);
  const conLink = !!cc?.permisos.puedeVerContabilidad;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <TituloReporte
        etiqueta="Tienda"
        titulo="Pedidos de disciplinas"
        descripcion="Pedidos mayoristas a cuenta corriente, contabilizados en Fondos en poder de disciplinas."
      >
        <Link href="/pedidos-disciplinas/nuevo">
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
            <Button className="gap-1.5">
              <Plus className="size-4" />
              Nuevo pedido
            </Button>
          </motion.div>
        </Link>
      </TituloReporte>

      {/* Cuenta corriente contable */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springSmooth, delay: 0.05 }}
        className="overflow-hidden rounded-xl border border-linea bg-white"
      >
        <div className="flex flex-col gap-3 border-b border-linea p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
          <div>
            <h2 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <BookOpen className="size-3.5" />
              Cuenta corriente {disciplinaElegida ? `· ${disciplinaElegida.nombre}` : ""}
            </h2>
            {cargandoCc && !cc ? (
              <Skeleton className="mt-2 h-8 w-40" />
            ) : (
              <>
                <ImporteAnimado
                  valor={disciplinaElegida ? saldoElegida?.saldo ?? 0 : cc?.total ?? 0}
                  moneda="UYU"
                  className="mt-1 block font-display text-3xl tracking-tight text-bordo-950"
                />
                <p className="text-xs text-muted-foreground">
                  {disciplinaElegida ? "Saldo a cobrar a la disciplina" : "Total a cobrar a las disciplinas"}
                  {cc?.cuenta && (
                    <>
                      {" · "}
                      {cc.cuenta.nombre} <span className="font-mono">({cc.cuenta.codigo})</span>
                    </>
                  )}
                  {cc?.ejercicio && ` · ${cc.ejercicio.nombre}`}
                </p>
              </>
            )}
          </div>
          <div className="flex flex-col gap-1.5 sm:items-end">
            {cc?.permisos.puedeEscribirContabilidad ? (
              <Link href="/contabilidad/asientos/nuevo">
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    Registrar cobro o compensación
                    <ArrowUpRight className="size-3.5" />
                  </Button>
                </motion.div>
              </Link>
            ) : (
              <p className="max-w-60 text-[11px] text-muted-foreground sm:text-right">
                Los cobros y compensaciones con la disciplina los registra tesorería con un asiento en contabilidad.
              </p>
            )}
            {conLink && cc?.cuenta && (
              <Link
                href={`/contabilidad/mayor?cuenta=${cc.cuenta.id}`}
                className="text-[11px] text-bordo-800 underline-offset-2 hover:underline"
              >
                Ver en el libro mayor
              </Link>
            )}
          </div>
        </div>

        {cc?.error && (
          <div className="flex items-start gap-2 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 sm:px-5">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {cc.error}
          </div>
        )}

        {/* Saldos por disciplina */}
        {!disciplinaElegida && cc && cc.saldos.length > 0 && (
          <motion.div
            variants={staggerContainerFast}
            initial="hidden"
            animate="visible"
            className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3"
          >
            {cc.saldos.map((s) => (
              <motion.button
                key={s.disciplina_id}
                variants={fadeInUp}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => elegir(String(s.disciplina_id))}
                className="flex items-center justify-between gap-2 rounded-lg border border-linea px-3 py-2.5 text-left transition-colors hover:border-bordo-800/30"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Users className="size-4 shrink-0 text-bordo-800" />
                  <span className="truncate text-sm font-medium">{s.nombre}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-sm font-semibold tabular-nums",
                    s.saldo > 0 ? "text-amber-700" : s.saldo < 0 ? "text-emerald-700" : "text-muted-foreground"
                  )}
                >
                  {formatImporte(s.saldo, "UYU")}
                </span>
              </motion.button>
            ))}
          </motion.div>
        )}
        {!disciplinaElegida && cc && cc.saldos.length === 0 && !cc.error && (
          <p className="p-4 text-sm text-muted-foreground sm:p-5">Ninguna disciplina tiene movimientos en el ejercicio.</p>
        )}

        {/* Movimientos de la disciplina elegida */}
        {disciplinaElegida && cc && (
          <div className="p-4 sm:p-5">
            {cc.movimientos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin movimientos en el ejercicio.</p>
            ) : (
              <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[560px] text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="pb-2 font-medium">Fecha</th>
                      <th className="pb-2 font-medium">Asiento</th>
                      <th className="pb-2 font-medium">Concepto</th>
                      <th className="pb-2 text-right font-medium">Debe</th>
                      <th className="pb-2 text-right font-medium">Haber</th>
                      <th className="pb-2 text-right font-medium">Saldo</th>
                    </tr>
                  </thead>
                  <motion.tbody
                    variants={staggerContainerFast}
                    initial="hidden"
                    animate="visible"
                    className="divide-y divide-linea/60"
                  >
                    {cc.movimientos.map((m) => (
                      <motion.tr key={m.linea_id} variants={fadeInUp}>
                        <td className="py-2 pr-2 tabular-nums">{formatFecha(m.fecha)}</td>
                        <td className="py-2 pr-2">
                          <NumeroAsiento asiento={{ id: m.asiento_id, numero: m.numero }} conLink={conLink} />
                        </td>
                        <td className="max-w-[240px] truncate py-2 pr-2">
                          {m.pedido_id ? (
                            <Link href={`/admin/pedidos/${m.pedido_id}`} className="hover:underline">
                              {m.descripcion}
                            </Link>
                          ) : (
                            m.descripcion
                          )}
                        </td>
                        <td className="py-2 text-right tabular-nums">{m.debe ? formatImporte(m.debe) : ""}</td>
                        <td className="py-2 text-right tabular-nums">{m.haber ? formatImporte(m.haber) : ""}</td>
                        <td className="py-2 text-right font-medium tabular-nums">{formatImporte(m.saldo)}</td>
                      </motion.tr>
                    ))}
                  </motion.tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </motion.section>

      {/* Filtro */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex flex-wrap items-center gap-2"
      >
        <Select value={filtro} onValueChange={(v) => elegir(v || "all")}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Filtrar por disciplina">
              {disciplinaElegida?.nombre ?? "Todas las disciplinas"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las disciplinas</SelectItem>
            {disciplinas.map((d) => (
              <SelectItem key={d.id} value={d.id.toString()}>
                {d.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <AnimatePresence>
          {disciplinaElegida && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={() => elegir("all")}
              className="inline-flex items-center gap-1 rounded-full bg-superficie px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
              Quitar filtro
            </motion.button>
          )}
        </AnimatePresence>
        <span className="ml-auto text-xs text-muted-foreground">{total} pedidos</span>
      </motion.div>

      {/* Pedidos */}
      {cargandoPedidos ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : pedidos.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-dashed border-linea py-12 text-center"
        >
          <ShoppingBag className="mx-auto mb-3 size-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No hay pedidos</p>
        </motion.div>
      ) : (
        <motion.ul variants={staggerContainerFast} initial="hidden" animate="visible" className="space-y-2">
          <AnimatePresence mode="popLayout">
            {pedidos.map((p) => (
              <motion.li key={p.id} variants={fadeInUp} layout exit={{ opacity: 0, scale: 0.97 }}>
                <Link
                  href={`/admin/pedidos/${p.id}`}
                  className="block rounded-xl border border-linea bg-white p-3 transition-shadow hover:shadow-sm sm:p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{p.numero_pedido}</span>
                      <span className="rounded bg-bordo-50 px-1.5 py-0.5 text-[10px] font-medium text-bordo-800">
                        {p.disciplina?.nombre}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none",
                          ESTILO_ESTADO[p.estado]
                        )}
                      >
                        {p.estado === "pagado" ? "A cuenta corriente" : NOMBRE_ESTADO[p.estado]}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {p.created_at && formatFecha(p.created_at.slice(0, 10))}
                      </span>
                      <span
                        className={cn(
                          "text-base font-bold tabular-nums",
                          p.estado === "cancelado" && "text-muted-foreground line-through"
                        )}
                      >
                        {pesos(p.total)}
                      </span>
                    </div>
                  </div>
                  {p.items.length > 0 && (
                    <p className="mt-1.5 truncate text-xs text-muted-foreground">
                      {p.items
                        .map((i) => `${i.cantidad} × ${i.nombre}${i.variante ? ` (${i.variante})` : ""}`)
                        .join(" · ")}
                    </p>
                  )}
                  {(p.notas || p.vendedor) && (
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {p.vendedor && `por ${p.vendedor}`}
                      {p.vendedor && p.notas && " · "}
                      {p.notas}
                    </p>
                  )}
                </Link>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pb-6">
          <Button variant="outline" size="sm" className="h-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="px-1 text-xs tabular-nums text-muted-foreground">
            {page}/{totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
