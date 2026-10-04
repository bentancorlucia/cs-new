"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Ban, BookOpen, Download, FilterX, HandCoins, History, Receipt, Sigma } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { r2 } from "@/lib/socios/cuotas";
import {
  AYUDA_TIPO_MOVIMIENTO,
  NOMBRE_CUENTA_MOVIMIENTO,
  NOMBRE_TIPO_MOVIMIENTO,
  type MovimientoCuenta,
  type PagoDisciplina,
  type TipoMovimiento,
} from "@/lib/socios/disciplinas";
import { ListaLiquidaciones } from "@/components/socios/cuotas/liquidaciones";
import {
  BadgeEstado,
  Boton,
  BotonLink,
  Pastilla,
  Campo,
  DialogoAccion,
  DialogoAnular,
  Explicacion,
  Filtros,
  LinkAsiento,
  Panel,
  Vacio,
  claseControl,
} from "@/components/socios/cuotas/ui";
import { anularPagoDisciplina, registrarPagoDisciplina } from "@/app/(dashboard)/secretaria/disciplinas/actions";
import type { DatosDisciplina } from "./form-disciplina";
import type { DatosTesoreria } from "./detalle";
import { BadgeTipoMovimiento, CLASE_CUENTA, Cifra, ImporteContador, SaldoNeto, aNumero, claseSaldo, exportarExcel } from "./ui";

/** Efecto del movimiento en su cuenta: + aumenta lo que debe la disciplina (1.1.04.03) o lo que le debe el club (2.1.07.02). */
export function importeEnCuenta(m: Pick<MovimientoCuenta, "cuenta" | "debe" | "haber">) {
  return r2(m.cuenta === "club_debe" ? m.haber - m.debe : m.debe - m.haber);
}

/** Saldos por cuenta a partir de los movimientos. */
export function saldosCuenta(movimientos: MovimientoCuenta[]) {
  let debeDisciplina = 0;
  let debeClub = 0;
  for (const m of movimientos) {
    if (m.cuenta === "club_debe") debeClub += m.haber - m.debe;
    else debeDisciplina += m.debe - m.haber;
  }
  return { debeDisciplina: r2(debeDisciplina), debeClub: r2(debeClub), neto: r2(debeDisciplina - debeClub) };
}

function Monto({ valor, className }: { valor: number; className?: string }) {
  if (Math.abs(valor) < 0.005) return <span className={className} />;
  return (
    <span className={cn("tabular-nums", className)}>
      {valor > 0 ? "+" : "−"}
      {formatImporte(Math.abs(valor))}
    </span>
  );
}

/** Saldo neto corto para las filas: "Debe 1.000,00" / "Le deben 1.000,00". */
function NetoFila({ neto, className }: { neto: number; className?: string }) {
  const abs = Math.abs(neto);
  return (
    <span className={cn("tabular-nums", claseSaldo(neto), className)}>
      {abs < 0.005 ? "0,00" : `${neto > 0 ? "Debe" : "Le deben"} ${formatImporte(abs)}`}
    </span>
  );
}

const PAGINA = 60;

export function CuentaCorrienteVista({
  disciplina,
  datos,
  hoy,
  puedeTesoreria,
}: {
  disciplina: DatosDisciplina;
  datos: DatosTesoreria;
  hoy: string;
  puedeTesoreria: boolean;
}) {
  const { movimientos, pagos, liquidaciones, cuentas, pedidos } = datos;
  const [tipo, setTipo] = useState<TipoMovimiento | "todos">("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [mostrar, setMostrar] = useState(PAGINA);
  const [pagar, setPagar] = useState(false);
  const [anular, setAnular] = useState<PagoDisciplina | null>(null);

  const planesVigentes = datos.planes
    .filter((p) => p.estado === "vigente" && p.saldo > 0)
    .map((p) => ({
      id: p.id,
      disciplina_id: disciplina.id,
      descripcion: p.descripcion,
      saldo: p.saldo,
      saldo_vencido: p.saldo_vencido,
      proximo_vencimiento: p.proximo_vencimiento,
    }));
  const pendienteLiq = r2(liquidaciones.filter((l) => l.estado === "vigente").reduce((s, l) => s + l.saldo, 0));
  const numeroPedido = useMemo(() => new Map(pedidos.map((p) => [p.id, p.numero])), [pedidos]);
  const nombreCuenta = useMemo(() => new Map(cuentas.map((c) => [c.id, `${c.codigo} · ${c.nombre}`])), [cuentas]);

  const { debeDisciplina, debeClub, neto: saldo } = saldosCuenta(movimientos);
  const enRango = movimientos.filter((m) => (!desde || m.fecha >= desde) && (!hasta || m.fecha <= hasta));
  const filtrados = enRango.filter((m) => tipo === "todos" || m.tipo === tipo);
  const saldoInicial = desde ? ([...movimientos].reverse().find((m) => m.fecha < desde)?.saldo ?? 0) : null;
  const totalDisciplina = r2(filtrados.filter((m) => m.cuenta === "disciplina_debe").reduce((s, m) => s + importeEnCuenta(m), 0));
  const totalClub = r2(filtrados.filter((m) => m.cuenta === "club_debe").reduce((s, m) => s + importeEnCuenta(m), 0));
  const visibles = filtrados.slice(Math.max(0, filtrados.length - mostrar));
  const hayFiltro = tipo !== "todos" || !!desde || !!hasta;

  const tipos = (Object.keys(NOMBRE_TIPO_MOVIMIENTO) as TipoMovimiento[]).filter((t) => enRango.some((m) => m.tipo === t));

  async function exportar() {
    try {
      await exportarExcel(
        `cuenta-corriente-${disciplina.slug}-${hoy}.xlsx`,
        "Cuenta corriente",
        ["Fecha", "Asiento", "Tipo", "Cuenta", "Descripción", "Pedido", "Debe la disciplina", "Le debe el club", "Saldo neto (+ debe la disciplina)"],
        [
          ...(saldoInicial !== null ? [[formatFecha(desde), "", "Saldo anterior", "", "", "", null, null, saldoInicial]] : []),
          ...filtrados.map((m) => [
            formatFecha(m.fecha),
            m.numero ?? "",
            NOMBRE_TIPO_MOVIMIENTO[m.tipo],
            NOMBRE_CUENTA_MOVIMIENTO[m.cuenta],
            m.descripcion,
            m.pedido_id ? (numeroPedido.get(m.pedido_id) ?? m.pedido_id) : "",
            m.cuenta === "disciplina_debe" ? importeEnCuenta(m) : null,
            m.cuenta === "club_debe" ? importeEnCuenta(m) : null,
            m.saldo,
          ]),
          [],
          ["", "", "", "", "Totales", "", totalDisciplina, totalClub, filtrados.at(-1)?.saldo ?? saldo],
        ],
        [11, 9, 20, 18, 48, 12, 16, 16, 18]
      );
    } catch {
      toast.error("No se pudo armar el Excel");
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Cifra etiqueta="Debe la disciplina" tono={debeDisciplina > 0 ? "alerta" : "neutro"} icono={BookOpen} detalle="Compras, cuotas cobradas en su cuenta y préstamos (1.1.04.03)">
          <ImporteContador valor={debeDisciplina} moneda="UYU" />
        </Cifra>
        <Cifra etiqueta="Le debe el club" tono={debeClub > 0 ? "dorado" : "neutro"} delay={0.04} detalle="Liquidaciones pendientes de pago (2.1.07.02)">
          <ImporteContador valor={debeClub} moneda="UYU" className={debeClub > 0 ? "text-amber-700" : undefined} />
        </Cifra>
        <Cifra etiqueta="Neto" delay={0.08} detalle="Lo que debe la disciplina menos lo que le debe el club">
          <SaldoNeto neto={saldo} />
        </Cifra>
      </div>

      <Panel
        titulo="Estado de cuenta"
        icono={BookOpen}
        delay={0.06}
        accion={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Boton variante="secundario" className="h-9 flex-1 px-3 text-xs sm:flex-none" onClick={exportar} disabled={filtrados.length === 0}>
              <Download className="size-3.5" />
              Excel
            </Boton>
            {puedeTesoreria && (
              <Boton className="h-9 flex-1 px-3 text-xs sm:flex-none" onClick={() => setPagar(true)}>
                <HandCoins className="size-3.5" />
                Registrar pago de la disciplina
              </Boton>
            )}
          </div>
        }
      >
        <div className="space-y-3 border-b border-linea p-4">
          <Filtros<TipoMovimiento | "todos">
            id="tipo-mov"
            valor={tipo}
            onChange={(v) => {
              setTipo(v);
              setMostrar(PAGINA);
            }}
            opciones={[
              { valor: "todos", etiqueta: "Todos", cantidad: enRango.length },
              ...tipos.map((t) => ({ valor: t, etiqueta: NOMBRE_TIPO_MOVIMIENTO[t], cantidad: enRango.filter((m) => m.tipo === t).length })),
            ]}
          />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
            <Campo etiqueta="Desde" className="sm:w-40">
              <input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} className={claseControl} />
            </Campo>
            <Campo etiqueta="Hasta" className="sm:w-40">
              <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} className={claseControl} />
            </Campo>
            <AnimatePresence>
              {hayFiltro && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="col-span-2 sm:col-span-1">
                  <Boton
                    variante="secundario"
                    className="h-10 w-full px-3 text-xs sm:w-auto"
                    onClick={() => {
                      setTipo("todos");
                      setDesde("");
                      setHasta("");
                    }}
                  >
                    <FilterX className="size-3.5" />
                    Limpiar
                  </Boton>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {tipo !== "todos" && <Explicacion>{AYUDA_TIPO_MOVIMIENTO[tipo]}</Explicacion>}
        </div>

        {filtrados.length === 0 ? (
          <div className="p-4">
            <Vacio icono={BookOpen} titulo={movimientos.length ? "Ningún movimiento con ese filtro" : "La disciplina no tiene movimientos con el club"} />
          </div>
        ) : (
          <div>
            <div className="hidden grid-cols-[6rem_minmax(0,1fr)_8rem_8rem_9.5rem] gap-3 border-b border-linea bg-superficie/50 px-4 py-2 text-[10px] font-medium uppercase tracking-editorial text-muted-foreground md:grid">
              <span>Fecha</span>
              <span>Movimiento</span>
              <span className="text-right text-rose-700">Debe la disciplina</span>
              <span className="text-right text-amber-700">Le debe el club</span>
              <span className="text-right">Saldo neto</span>
            </div>
            {filtrados.length > visibles.length && (
              <div className="border-b border-linea px-4 py-2 text-center">
                <button type="button" onClick={() => setMostrar((n) => n + PAGINA)} className="text-xs font-medium text-bordo-800 hover:underline">
                  Ver {Math.min(PAGINA, filtrados.length - visibles.length)} movimientos anteriores
                </button>
              </div>
            )}
            {saldoInicial !== null && visibles.length === filtrados.length && (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-linea bg-superficie/40 px-4 py-2 text-xs text-muted-foreground md:grid-cols-[6rem_minmax(0,1fr)_8rem_8rem_9.5rem]">
                <span className="md:col-span-4">Saldo al {formatFecha(desde)}</span>
                <NetoFila neto={saldoInicial} className="text-right font-medium" />
              </div>
            )}
            <ul className="divide-y divide-linea">
              <AnimatePresence initial={false}>
                {visibles.map((m, i) => (
                  <motion.li
                    key={m.clave}
                    layout="position"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(i, 20) * 0.015 }}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-2.5 text-sm transition-colors hover:bg-superficie/40 md:grid-cols-[6rem_minmax(0,1fr)_8rem_8rem_9.5rem] md:items-center"
                  >
                    <div className="text-xs tabular-nums text-muted-foreground md:text-sm md:text-foreground">
                      {formatFecha(m.fecha)}
                      {m.numero != null && (
                        <Link href={`/contabilidad/asientos/${m.asiento_id}`} className="ml-2 text-[11px] text-bordo-800 hover:underline md:ml-0 md:block">
                          Asiento {m.numero}
                        </Link>
                      )}
                    </div>
                    <div className="row-start-2 min-w-0 space-y-0.5 md:row-start-auto">
                      <BadgeTipoMovimiento tipo={m.tipo} />
                      <div className="truncate text-xs text-muted-foreground md:text-sm md:text-foreground">
                        {m.pedido_id ? (
                          <Link href={`/admin/pedidos/${m.pedido_id}`} className="group inline-flex max-w-full items-center gap-1 hover:text-bordo-800 hover:underline">
                            <span className="truncate">{m.descripcion}</span>
                            <ArrowUpRight className="size-3 shrink-0 opacity-60 group-hover:opacity-100" />
                          </Link>
                        ) : (
                          m.descripcion
                        )}
                      </div>
                    </div>
                    <div className="col-start-2 row-span-2 row-start-1 flex flex-col items-end justify-center gap-0.5 md:hidden">
                      <span className={cn("text-[10px]", CLASE_CUENTA[m.cuenta])}>{NOMBRE_CUENTA_MOVIMIENTO[m.cuenta]}</span>
                      <Monto valor={importeEnCuenta(m)} className={CLASE_CUENTA[m.cuenta]} />
                      <NetoFila neto={m.saldo} className="text-[11px]" />
                    </div>
                    <span className="hidden text-right md:block">
                      {m.cuenta === "disciplina_debe" && <Monto valor={importeEnCuenta(m)} className="text-rose-700" />}
                    </span>
                    <span className="hidden text-right md:block">
                      {m.cuenta === "club_debe" && <Monto valor={importeEnCuenta(m)} className="text-amber-700" />}
                    </span>
                    <NetoFila neto={m.saldo} className="hidden text-right font-medium md:block" />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        )}
        <div className="border-t border-linea px-4 py-2">
          <Explicacion>
            Dos cuentas con el auxiliar de la disciplina: lo que ella le debe al club (Fondos en poder de disciplinas, 1.1.04.03) y lo que el club le debe
            por liquidaciones (2.1.07.02). El saldo neto las compensa: &quot;Debe&quot; = la disciplina le debe al club; &quot;Le deben&quot; = el club le
            debe a la disciplina.
          </Explicacion>
        </div>
      </Panel>

      <Panel titulo="Pagos de la disciplina al club" icono={HandCoins} delay={0.1}>
        {pagos.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">Todavía no se registraron pagos de la disciplina.</p>
        ) : (
          <ul className="divide-y divide-linea">
            <AnimatePresence initial={false}>
              {pagos.map((p, i) => (
                <motion.li
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(i, 10) * 0.03 }}
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1.5 px-4 py-3 sm:grid-cols-[7rem_minmax(0,1fr)_9rem_auto] sm:items-center",
                    p.estado === "anulado" && "opacity-60"
                  )}
                >
                  <div className="text-sm tabular-nums">{formatFecha(p.fecha)}</div>
                  <div className="col-span-2 row-start-2 min-w-0 text-xs text-muted-foreground sm:col-span-1 sm:row-start-auto">
                    <div className="truncate text-foreground">{nombreCuenta.get(p.cuenta_id) ?? "Caja o banco"}</div>
                    {p.referencia && <div className="truncate">Ref. {p.referencia}</div>}
                    {p.notas && <div className="truncate">{p.notas}</div>}
                    {p.imputaciones.length > 0 && (
                      <div className={cn("truncate", p.estado === "vigente" ? "text-sky-800" : "line-through")}>
                        Imputado a {p.imputaciones[0].plan}: {p.imputaciones.map((a) => `cuota ${a.cuota} ${formatImporte(a.importe)}`).join(", ")}
                      </div>
                    )}
                    {p.motivo_anulacion && <div className="text-rose-700">Anulado: {p.motivo_anulacion}</div>}
                  </div>
                  <div className={cn("text-right font-heading tabular-nums", p.estado === "anulado" && "line-through")}>{formatImporte(p.importe, "UYU")}</div>
                  <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 sm:col-span-1">
                    <BadgeEstado estado={p.estado} />
                    <LinkAsiento id={p.asiento_id} />
                    {puedeTesoreria && p.estado === "vigente" && (
                      <Boton variante="peligro" className="h-8 px-3 text-xs" onClick={() => setAnular(p)}>
                        <Ban className="size-3.5" />
                        Anular
                      </Boton>
                    )}
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </Panel>

      <Panel
        titulo="Liquidaciones"
        icono={Sigma}
        delay={0.14}
        accion={
          <div className="flex flex-wrap items-center gap-2">
            {pendienteLiq > 0 && <Pastilla tono="info">Pendiente de pago {formatImporte(pendienteLiq)}</Pastilla>}
            <BotonLink href="/cuotas/disciplinas" variante="secundario" className="h-8 px-3 text-xs">
              <Receipt className="size-3.5" />
              Liquidar
            </BotonLink>
          </div>
        }
      >
        <ListaLiquidaciones
          liquidaciones={liquidaciones}
          cuentas={cuentas}
          cuentaDefecto={datos.cuentaDefecto}
          planes={planesVigentes}
          deudas={{ [disciplina.id]: debeDisciplina }}
          hoy={hoy}
          puedeOperar={puedeTesoreria}
          conDisciplina={false}
        />
      </Panel>

      {pagar && (
        <DialogoPago
          disciplina={disciplina}
          datos={datos}
          hoy={hoy}
          deuda={debeDisciplina}
          onClose={() => setPagar(false)}
        />
      )}

      <DialogoAnular
        open={!!anular}
        onOpenChange={(o) => !o && setAnular(null)}
        titulo={`Anular el pago del ${anular ? formatFecha(anular.fecha) : ""}`}
        descripcion={
          <span>
            Se hace el contra-asiento: vuelven los {anular ? formatImporte(anular.importe, "UYU") : ""} a la deuda de la disciplina
            {anular?.imputaciones.length ? " y se deshace lo imputado a las cuotas del plan de pago" : ""}.
          </span>
        }
        anular={(motivo) => anularPagoDisciplina({ disciplina_id: disciplina.id, id: anular!.id, motivo })}
      />
    </>
  );
}

// ------------------------------------------------------------
// Registrar pago
// ------------------------------------------------------------

function DialogoPago({
  disciplina,
  datos,
  hoy,
  deuda,
  onClose,
}: {
  disciplina: DatosDisciplina;
  datos: DatosTesoreria;
  hoy: string;
  deuda: number;
  onClose: () => void;
}) {
  const planes = datos.planes.filter((p) => p.estado === "vigente" && p.saldo > 0);
  const [fecha, setFecha] = useState(hoy);
  const [importe, setImporte] = useState("");
  const [cuentaId, setCuentaId] = useState(datos.cuentaDefecto ?? datos.cuentas[0]?.id ?? "");
  const [referencia, setReferencia] = useState("");
  const [notas, setNotas] = useState("");
  const [planId, setPlanId] = useState<number | "">(planes.length === 1 ? planes[0].id : "");

  const plan = planes.find((p) => p.id === planId);
  const monto = aNumero(importe);
  const excede = plan ? r2(monto - plan.saldo) : 0;
  const proxima = plan?.detalle.find((c) => c.saldo > 0);

  const errores: string[] = [];
  if (!(monto > 0)) errores.push("Indicá el importe");
  if (!fecha || fecha > hoy) errores.push("La fecha no puede ser futura");
  if (!cuentaId) errores.push("Elegí la cuenta");

  const sugerencias = [
    ...(plan && plan.saldo_vencido > 0 ? [{ etiqueta: "Vencido del plan", valor: plan.saldo_vencido }] : []),
    ...(proxima ? [{ etiqueta: `Cuota ${proxima.numero}`, valor: proxima.saldo }] : []),
    ...(plan ? [{ etiqueta: "Saldo del plan", valor: plan.saldo }] : []),
    ...(deuda > 0 ? [{ etiqueta: "Toda la deuda", valor: deuda }] : []),
  ].filter((s, i, a) => a.findIndex((x) => x.valor === s.valor) === i);

  return (
    <DialogoAccion
      open
      onOpenChange={(o) => !o && onClose()}
      icono={HandCoins}
      titulo={`Pago de ${disciplina.nombre} al club`}
      descripcion="Entra a una caja o banco y baja la deuda de la disciplina (Debe caja/banco · Haber Fondos en poder de disciplinas)."
      textoAccion="Registrar pago"
      mensaje="Pago registrado"
      ancho="sm:max-w-lg"
      deshabilitado={errores.length > 0}
      ejecutar={async () => {
        const r = await registrarPagoDisciplina({
          disciplina_id: disciplina.id,
          fecha,
          importe: r2(monto),
          cuenta_id: cuentaId,
          referencia: referencia.trim() || null,
          notas: notas.trim() || null,
          plan_id: planId || null,
        });
        return r.ok ? { ok: true } : r;
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Fecha">
          <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={claseControl} />
        </Campo>
        <Campo etiqueta="Importe ($)" ayuda={deuda > 0 ? `Deuda actual ${formatImporte(deuda)}` : undefined}>
          <input
            inputMode="decimal"
            value={importe}
            onChange={(e) => setImporte(e.target.value.replace(/[^\d.,]/g, ""))}
            placeholder="0,00"
            className={cn(claseControl, "text-right tabular-nums")}
            autoFocus
          />
        </Campo>
      </div>
      {sugerencias.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sugerencias.map((s) => (
            <motion.button
              key={s.etiqueta}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => setImporte(String(s.valor).replace(".", ","))}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                Math.abs(monto - s.valor) < 0.005 ? "border-bordo-200 bg-bordo-50 text-bordo-800" : "border-linea text-muted-foreground hover:bg-superficie"
              )}
            >
              {s.etiqueta}: {formatImporte(s.valor)}
            </motion.button>
          ))}
        </div>
      )}
      <Campo etiqueta="Entra a">
        <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className={claseControl}>
          {datos.cuentas.length === 0 && <option value="">No hay cajas ni bancos en pesos</option>}
          {datos.cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} · {c.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Referencia" ayuda="Nº de transferencia o recibo (no se repite).">
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)} className={claseControl} maxLength={120} />
        </Campo>
        <Campo etiqueta="Notas">
          <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" className={claseControl} maxLength={500} />
        </Campo>
      </div>
      <Campo
        etiqueta="Imputar a un plan de pago"
        ayuda={planes.length === 0 ? "La disciplina no tiene planes vigentes con saldo." : "Se aplica a las cuotas más viejas del plan."}
      >
        <select value={planId} onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : "")} className={claseControl} disabled={planes.length === 0}>
          <option value="">No imputar (a cuenta de la deuda general)</option>
          {planes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.descripcion} · saldo {formatImporte(p.saldo)}
            </option>
          ))}
        </select>
      </Campo>
      <AnimatePresence initial={false}>
        {plan && monto > 0 && (
          <motion.div
            key="imputacion"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
              {imputacionPrevia(plan.detalle, monto).map((c) => (
                <div key={c.numero} className="flex justify-between gap-2">
                  <span>
                    Cuota {c.numero} · vence {formatFecha(c.vencimiento)}
                  </span>
                  <span className="tabular-nums">
                    {formatImporte(c.aplica)}
                    {c.cubre ? " (la cancela)" : ""}
                  </span>
                </div>
              ))}
              {excede > 0 && <div className="mt-1 border-t border-sky-200 pt-1">{formatImporte(excede)} exceden al plan y quedan a cuenta de la deuda general.</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {datos.cuentas.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs text-rose-700">
          <History className="size-3.5" />
          Configurá una caja o banco en pesos en el plan de cuentas.
        </p>
      )}
    </DialogoAccion>
  );
}

function imputacionPrevia(cuotas: DatosTesoreria["planes"][number]["detalle"], monto: number) {
  let resto = r2(monto);
  const out: { numero: number; vencimiento: string; aplica: number; cubre: boolean }[] = [];
  for (const c of cuotas) {
    if (resto <= 0) break;
    if (c.saldo <= 0) continue;
    const aplica = r2(Math.min(c.saldo, resto));
    out.push({ numero: c.numero, vencimiento: c.vencimiento, aplica, cubre: aplica >= c.saldo });
    resto = r2(resto - aplica);
  }
  return out;
}
