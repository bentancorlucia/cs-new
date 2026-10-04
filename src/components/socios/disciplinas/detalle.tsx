"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CalendarClock,
  Dumbbell,
  History,
  LayoutDashboard,
  Mail,
  Pencil,
  Phone,
  Receipt,
  UserRound,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import type {
  LiquidacionDeDisciplina,
  MovimientoCuenta,
  PagoDisciplina,
  PedidoDisciplina,
  PlanPago,
  SociosDeDisciplina,
} from "@/lib/socios/disciplinas";
import type { CuentaDisponible } from "@/lib/socios/cuotas";
import { Aviso, Boton, Explicacion, NumeroAnimado, Panel, Pastilla } from "@/components/socios/cuotas/ui";
import { DialogoDisciplina, type DatosDisciplina } from "./form-disciplina";
import { BadgeSituacionCuota, BadgeTipoMovimiento, CLASE_CUENTA, Cifra, ImporteContador, Pestanas, SaldoNeto } from "./ui";
import { importeEnCuenta, saldosCuenta } from "./cuenta-corriente";
import { CuentaCorrienteVista } from "./cuenta-corriente";
import { PlanesPagoVista } from "./planes-pago";
import { SociosVista } from "./socios";

export type Pestana = "resumen" | "cuenta" | "planes" | "socios";

export interface DatosTesoreria {
  movimientos: MovimientoCuenta[];
  planes: PlanPago[];
  liquidaciones: LiquidacionDeDisciplina[];
  pedidos: PedidoDisciplina[];
  pagos: PagoDisciplina[];
  cuentas: CuentaDisponible[];
  cuentaDefecto: string | null;
}

export function DetalleDisciplina({
  disciplina,
  socios,
  errorSocios,
  tesoreria,
  errorTesoreria,
  pestanaInicial,
  hoy,
  puedeGestionar,
  verTesoreria,
  puedeTesoreria,
}: {
  disciplina: DatosDisciplina;
  socios: SociosDeDisciplina | null;
  errorSocios: string | null;
  tesoreria: DatosTesoreria | null;
  errorTesoreria: string | null;
  pestanaInicial: Pestana;
  hoy: string;
  puedeGestionar: boolean;
  verTesoreria: boolean;
  puedeTesoreria: boolean;
}) {
  const [pestana, setPestana] = useState<Pestana>(pestanaInicial);
  const [editar, setEditar] = useState(false);

  function cambiar(p: Pestana) {
    setPestana(p);
    try {
      const url = new URL(window.location.href);
      if (p === "resumen") url.searchParams.delete("tab");
      else url.searchParams.set("tab", p);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // sin historial (vista previa): la pestaña igual cambia
    }
  }

  const planesVigentes = tesoreria?.planes.filter((p) => p.estado === "vigente") ?? [];
  const opciones = [
    { valor: "resumen" as const, etiqueta: "Resumen", icono: LayoutDashboard },
    ...(verTesoreria
      ? [
          { valor: "cuenta" as const, etiqueta: "Cuenta corriente", icono: BookOpen },
          { valor: "planes" as const, etiqueta: "Planes de pago", icono: CalendarClock, cantidad: planesVigentes.length },
        ]
      : []),
    { valor: "socios" as const, etiqueta: "Socios", icono: Users, cantidad: socios?.vigentes.length },
  ];

  return (
    <div className="min-w-0 space-y-5 pb-8">
      <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
        <Link
          href="/secretaria/disciplinas"
          className="group inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-bordo-800"
        >
          <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
          Disciplinas
        </Link>
      </motion.div>

      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="flex min-w-0 items-center gap-3">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 22, delay: 0.05 }}
            className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-bordo-800 text-white shadow-sm"
          >
            {disciplina.imagen_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={disciplina.imagen_url} alt="" className="size-full object-cover" />
            ) : (
              <Dumbbell className="size-6" />
            )}
          </motion.div>
          <div className="min-w-0">
            <div className="font-heading text-[11px] uppercase tracking-editorial text-bordo-800/70">Disciplina</div>
            <h1 className="truncate font-display text-2xl uppercase tracking-tightest text-foreground sm:text-3xl">{disciplina.nombre}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Pastilla tono={disciplina.activa ? "bueno" : "neutro"}>{disciplina.activa ? "Activa" : "Inactiva"}</Pastilla>
              <span className="font-mono text-[11px] text-muted-foreground">/{disciplina.slug}</span>
            </div>
          </div>
        </div>
        {puedeGestionar && (
          <Boton variante="secundario" onClick={() => setEditar(true)} className="w-full sm:w-auto">
            <Pencil className="size-4" />
            Editar disciplina
          </Boton>
        )}
      </motion.header>

      <Pestanas opciones={opciones} valor={pestana} onChange={cambiar} />

      {errorTesoreria && verTesoreria && (pestana === "cuenta" || pestana === "planes" || pestana === "resumen") && (
        <Aviso titulo="No se pudo leer la cuenta de la disciplina">{errorTesoreria}</Aviso>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={pestana}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="min-w-0 space-y-5"
          role="tabpanel"
        >
          {pestana === "resumen" && (
            <Resumen disciplina={disciplina} socios={socios} tesoreria={tesoreria} hoy={hoy} irA={cambiar} verTesoreria={verTesoreria} />
          )}
          {pestana === "cuenta" && tesoreria && (
            <CuentaCorrienteVista disciplina={disciplina} datos={tesoreria} hoy={hoy} puedeTesoreria={puedeTesoreria} />
          )}
          {pestana === "planes" && tesoreria && (
            <PlanesPagoVista disciplina={disciplina} planes={tesoreria.planes} pedidos={tesoreria.pedidos} hoy={hoy} puedeTesoreria={puedeTesoreria} />
          )}
          {pestana === "socios" &&
            (socios ? (
              <SociosVista disciplina={disciplina} datos={socios} />
            ) : (
              <Aviso titulo="No se pudieron leer los socios">{errorSocios}</Aviso>
            ))}
        </motion.div>
      </AnimatePresence>

      {editar && <DialogoDisciplina open disciplina={disciplina} onOpenChange={(o) => !o && setEditar(false)} />}
    </div>
  );
}

// ------------------------------------------------------------
// Resumen
// ------------------------------------------------------------

function Resumen({
  disciplina,
  socios,
  tesoreria,
  hoy,
  irA,
  verTesoreria,
}: {
  disciplina: DatosDisciplina;
  socios: SociosDeDisciplina | null;
  tesoreria: DatosTesoreria | null;
  hoy: string;
  irA: (p: Pestana) => void;
  verTesoreria: boolean;
}) {
  const vigentes = socios?.vigentes.length ?? 0;
  const conDeuda = socios?.vigentes.filter((s) => s.alDia === false).length ?? 0;
  const mesActual = socios?.porMes.at(-1);
  const { debeDisciplina, debeClub, neto } = saldosCuenta(tesoreria?.movimientos ?? []);
  const planes = tesoreria?.planes.filter((p) => p.estado === "vigente") ?? [];
  const vencido = planes.reduce((s, p) => s + p.saldo_vencido, 0);
  const ultimaLiq = tesoreria?.liquidaciones.find((l) => l.estado === "vigente") ?? null;

  const proximas = planes
    .flatMap((p) => p.detalle.filter((c) => c.saldo > 0).map((c) => ({ ...c, plan: p.descripcion, planId: p.id })))
    .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento))
    .slice(0, 5);
  const ultimos = (tesoreria?.movimientos ?? []).slice(-5).reverse();

  return (
    <>
      {verTesoreria && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Cifra etiqueta="Debe al club" icono={BookOpen} tono={debeDisciplina > 0 ? "alerta" : "neutro"} detalle="Compras, cuotas cobradas en su cuenta y préstamos">
            <ImporteContador valor={debeDisciplina} moneda="UYU" />
          </Cifra>
          <Cifra etiqueta="El club le debe" tono={debeClub > 0 ? "dorado" : "neutro"} delay={0.03} detalle="Liquidaciones pendientes de pago">
            <ImporteContador valor={debeClub} moneda="UYU" className={debeClub > 0 ? "text-amber-700" : undefined} />
          </Cifra>
          <div className="col-span-2 lg:col-span-1">
            <Cifra etiqueta="Neto" delay={0.06} detalle="Lo que debe la disciplina menos lo que le debe el club">
              <SaldoNeto neto={neto} />
            </Cifra>
          </div>
        </div>
      )}
      <div className={cn("grid grid-cols-2 gap-3", verTesoreria ? "lg:grid-cols-3" : "lg:grid-cols-4")}>
        <Cifra etiqueta="Socios vigentes" icono={Users} delay={0.02} detalle={mesActual ? `${mesActual.altas} alta${mesActual.altas === 1 ? "" : "s"} y ${mesActual.bajas} baja${mesActual.bajas === 1 ? "" : "s"} este mes` : undefined}>
          <NumeroAnimado valor={vigentes} />
        </Cifra>
        {verTesoreria ? (
          <>
            <Cifra
              etiqueta="Vencido en planes"
              icono={CalendarClock}
              tono={vencido > 0 ? "alerta" : "neutro"}
              delay={0.08}
              detalle={planes.length ? `${planes.length} plan${planes.length === 1 ? "" : "es"} vigente${planes.length === 1 ? "" : "s"}` : "Sin planes vigentes"}
            >
              <ImporteContador valor={vencido} moneda="UYU" />
            </Cifra>
            <Cifra
              etiqueta="Última liquidación"
              icono={Receipt}
              delay={0.11}
              detalle={
                ultimaLiq
                  ? `Hasta el ${formatFecha(ultimaLiq.hasta)} · ${ultimaLiq.saldo > 0 ? `pendiente ${formatImporte(ultimaLiq.saldo, "UYU")}` : "pagada"}`
                  : "Todavía no se le liquidó"
              }
            >
              {ultimaLiq ? <ImporteContador valor={ultimaLiq.importe} moneda="UYU" /> : <span className="text-muted-foreground">—</span>}
            </Cifra>
          </>
        ) : (
          <>
            <Cifra etiqueta="Con cuotas atrasadas" tono={conDeuda > 0 ? "alerta" : "bueno"} delay={0.05} detalle="Socios vigentes morosos">
              <NumeroAnimado valor={conDeuda} />
            </Cifra>
            <Cifra etiqueta="Categorías" delay={0.08} detalle="Planes de la disciplina">
              <NumeroAnimado valor={socios?.categorias.length ?? 0} />
            </Cifra>
            <Cifra etiqueta="Altas" delay={0.11} detalle="Últimos 12 meses">
              <NumeroAnimado valor={socios?.porMes.reduce((s, m) => s + m.altas, 0) ?? 0} />
            </Cifra>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <Panel titulo="Contacto" icono={UserRound} delay={0.1}>
          <div className="space-y-3 p-4 text-sm">
            {disciplina.descripcion && <p className="text-muted-foreground">{disciplina.descripcion}</p>}
            {disciplina.contacto_nombre || disciplina.contacto_telefono || disciplina.contacto_email ? (
              <div className="space-y-2">
                {disciplina.contacto_nombre && <div className="font-medium">{disciplina.contacto_nombre}</div>}
                {disciplina.contacto_telefono && (
                  <a href={`tel:${disciplina.contacto_telefono.replace(/\s/g, "")}`} className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-bordo-800">
                    <Phone className="size-4" />
                    {disciplina.contacto_telefono}
                  </a>
                )}
                {disciplina.contacto_email && (
                  <a href={`mailto:${disciplina.contacto_email}`} className="flex min-w-0 items-center gap-2 text-muted-foreground transition-colors hover:text-bordo-800">
                    <Mail className="size-4 shrink-0" />
                    <span className="truncate">{disciplina.contacto_email}</span>
                  </a>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Sin datos de contacto.</p>
            )}
          </div>
        </Panel>

        {verTesoreria && tesoreria ? (
          <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-2">
            <Panel
              titulo="Próximos vencimientos"
              icono={CalendarClock}
              delay={0.14}
              accion={
                <button type="button" onClick={() => irA("planes")} className="text-xs font-medium text-bordo-800 hover:underline">
                  Ver planes
                </button>
              }
            >
              {proximas.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">No hay cuotas de planes de pago pendientes.</p>
              ) : (
                <ul className="divide-y divide-linea">
                  {proximas.map((c, i) => (
                    <motion.li
                      key={c.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + i * 0.04 }}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate">
                          Cuota {c.numero} · <span className="text-muted-foreground">{c.plan}</span>
                        </div>
                        <div className={cn("text-[11px]", c.vencimiento < hoy ? "text-rose-700" : "text-muted-foreground")}>Vence el {formatFecha(c.vencimiento)}</div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="tabular-nums">{formatImporte(c.saldo)}</span>
                        <BadgeSituacionCuota situacion={c.situacion} />
                      </div>
                    </motion.li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel
              titulo="Últimos movimientos"
              icono={History}
              delay={0.18}
              accion={
                <button type="button" onClick={() => irA("cuenta")} className="text-xs font-medium text-bordo-800 hover:underline">
                  Cuenta corriente
                </button>
              }
            >
              {ultimos.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">La disciplina no tiene movimientos con el club.</p>
              ) : (
                <ul className="divide-y divide-linea">
                  {ultimos.map((m, i) => (
                    <motion.li
                      key={m.clave}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + i * 0.04 }}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <BadgeTipoMovimiento tipo={m.tipo} />
                        <div className="truncate text-[11px] text-muted-foreground">
                          {formatFecha(m.fecha)} · {m.descripcion}
                        </div>
                      </div>
                      <span className={cn("flex shrink-0 flex-col items-end tabular-nums", CLASE_CUENTA[m.cuenta])}>
                        <span>
                          {importeEnCuenta(m) >= 0 ? "+" : "−"}
                          {formatImporte(Math.abs(importeEnCuenta(m)))}
                        </span>
                        <span className="text-[10px] opacity-80">{m.cuenta === "club_debe" ? "le debe el club" : "debe la disciplina"}</span>
                      </span>
                    </motion.li>
                  ))}
                </ul>
              )}
              {ultimos.length > 0 && (
                <div className="flex items-center justify-between border-t border-linea px-4 py-2 text-xs">
                  <span className="text-muted-foreground">Saldo neto</span>
                  <SaldoNeto neto={neto} className="font-medium" />
                </div>
              )}
            </Panel>
          </div>
        ) : (
          <Panel titulo="Socios por categoría" icono={Users} delay={0.14}>
            <PorCategoria socios={socios} />
          </Panel>
        )}
      </div>

      {verTesoreria && planes.some((p) => p.situacion === "atrasado") && (
        <Aviso titulo="Hay planes de pago atrasados">
          {formatImporte(vencido, "UYU")} vencido sin pagar. Se imputa al registrar un pago de la disciplina o al compensar su deuda cuando se le paga una liquidación.
        </Aviso>
      )}
      {!verTesoreria && (
        <Explicacion>La cuenta corriente con el club y los planes de pago los ven tesorería y la Comisión Fiscal.</Explicacion>
      )}
    </>
  );
}

function PorCategoria({ socios }: { socios: SociosDeDisciplina | null }) {
  if (!socios || socios.categorias.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
        <AlertTriangle className="size-4" />
        La disciplina no tiene planes (categorías) cargados.
      </div>
    );
  }
  const total = Math.max(1, socios.vigentes.length);
  return (
    <ul className="space-y-3 p-4">
      {socios.categorias.map((c, i) => {
        const n = socios.vigentes.filter((s) => s.plan_ids.includes(c.id)).length;
        return (
          <li key={c.id} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className={cn(!c.activo && "text-muted-foreground")}>{c.nombre}</span>
              <span className="tabular-nums text-muted-foreground">{n}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-superficie">
              <motion.div
                className="h-full rounded-full bg-bordo-700"
                initial={{ width: 0 }}
                animate={{ width: `${(n / total) * 100}%` }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 + i * 0.05 }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
