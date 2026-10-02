"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowRight, Pencil, Plus, Search, Truck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";
import type { CatalogoContable, DiferenciaControl, ProveedorListado } from "@/lib/comercial/compras";
import { ProveedorDialog } from "./proveedor-dialog";
import { Boton, EncabezadoPagina, Filtros, ImporteAnimado, Kpi, Vacio, claseControl } from "./ui";

type Filtro = "todos" | "deuda" | "vencidos" | "inactivos";

function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function ProveedoresLista({
  proveedores,
  diferencias,
  errorControl,
  catalogo,
  puedeOperar,
}: {
  proveedores: ProveedorListado[];
  diferencias: DiferenciaControl[];
  errorControl: string | null;
  catalogo: CatalogoContable;
  puedeOperar: boolean;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const q = useDeferredValue(texto);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [dialogo, setDialogo] = useState<{ open: boolean; proveedor: ProveedorListado | null }>({
    open: false,
    proveedor: null,
  });

  const conDeuda = (p: ProveedorListado) => p.saldos.some((s) => s.deuda > 0);
  const cuenta = {
    todos: proveedores.filter((p) => p.activo).length,
    deuda: proveedores.filter(conDeuda).length,
    vencidos: proveedores.filter((p) => p.documentosVencidos > 0).length,
    inactivos: proveedores.filter((p) => !p.activo).length,
  };

  const lista = useMemo(() => {
    const t = normalizar(q.trim());
    return proveedores.filter((p) => {
      if (filtro === "todos" && !p.activo) return false;
      if (filtro === "deuda" && !conDeuda(p)) return false;
      if (filtro === "vencidos" && p.documentosVencidos === 0) return false;
      if (filtro === "inactivos" && p.activo) return false;
      if (!t) return true;
      return normalizar(`${p.nombre} ${p.razon_social ?? ""} ${p.rut ?? ""} ${p.contacto_nombre ?? ""}`).includes(t);
    });
  }, [proveedores, q, filtro]);

  const totales = useMemo(() => {
    const vacio = () => ({ deuda: 0, aFavor: 0, vencido: 0 });
    const t: Record<string, { deuda: number; aFavor: number; vencido: number }> = { UYU: vacio(), USD: vacio() };
    for (const p of proveedores)
      for (const s of p.saldos) {
        t[s.moneda] ??= vacio();
        t[s.moneda].deuda += s.deuda;
        t[s.moneda].aFavor += s.aFavor;
        t[s.moneda].vencido += s.vencido;
      }
    return t;
  }, [proveedores]);

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Proveedores y compras"
        titulo="Proveedores"
        descripcion="Cuenta corriente de todo el club: saldo por moneda según facturas, notas y pagos."
      >
        {puedeOperar && (
          <Boton onClick={() => setDialogo({ open: true, proveedor: null })}>
            <Plus className="size-4" />
            Nuevo proveedor
          </Boton>
        )}
      </EncabezadoPagina>

      <AnimatePresence>
        {(diferencias.length > 0 || errorControl) && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={easeSmooth}
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50 p-4"
          >
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                <AlertTriangle className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-heading text-sm text-rose-900">
                  {errorControl ? "No se pudo correr el control de proveedores" : "Los documentos no coinciden con la contabilidad"}
                </div>
                <p className="text-xs text-rose-800">
                  {errorControl ??
                    "El saldo según facturas, notas y pagos difiere del mayor de Proveedores y Anticipos. Avisale al tesorero antes de cerrar el mes."}
                </p>
                {diferencias.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-rose-900">
                    {diferencias.map((d) => (
                      <li key={`${d.proveedor_id}-${d.moneda}`} className="flex flex-wrap gap-x-3">
                        <Link href={`/admin/proveedores/${d.proveedor_id}`} className="font-medium underline-offset-2 hover:underline">
                          {d.proveedor}
                        </Link>
                        <span className="tabular-nums">
                          documentos {formatImporte(d.saldo_documentos, d.moneda)} · mayor {formatImporte(d.saldo_contable, d.moneda)} ·
                          diferencia <b>{formatImporte(d.diferencia, d.moneda)}</b>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          etiqueta="Deuda en pesos"
          delay={0.05}
          detalle={totales.UYU.aFavor > 0 ? `A favor del club ${formatImporte(totales.UYU.aFavor, "UYU")}` : undefined}
        >
          <ImporteAnimado valor={totales.UYU.deuda} moneda="UYU" />
        </Kpi>
        <Kpi
          etiqueta="Deuda en dólares"
          delay={0.1}
          detalle={totales.USD.aFavor > 0 ? `A favor del club ${formatImporte(totales.USD.aFavor, "USD")}` : undefined}
        >
          <ImporteAnimado valor={totales.USD.deuda} moneda="USD" />
        </Kpi>
        <Kpi etiqueta="Vencido en pesos" tono={totales.UYU.vencido > 0 ? "alerta" : "neutro"} delay={0.15}>
          <ImporteAnimado valor={totales.UYU.vencido} moneda="UYU" />
        </Kpi>
        <Kpi etiqueta="Vencido en dólares" tono={totales.USD.vencido > 0 ? "alerta" : "neutro"} delay={0.2}>
          <ImporteAnimado valor={totales.USD.vencido} moneda="USD" />
        </Kpi>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...easeSmooth, delay: 0.1 }}
        className="space-y-3 rounded-2xl border border-linea bg-white p-3"
      >
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscá por nombre, razón social, RUT o contacto…"
            className={cn(claseControl, "pr-9 pl-9")}
          />
          {texto && (
            <button
              type="button"
              aria-label="Limpiar búsqueda"
              onClick={() => setTexto("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-superficie hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Filtros<Filtro>
          id="proveedores"
          valor={filtro}
          onChange={setFiltro}
          opciones={[
            { valor: "todos", etiqueta: "Activos", cantidad: cuenta.todos },
            { valor: "deuda", etiqueta: "Con deuda", cantidad: cuenta.deuda },
            { valor: "vencidos", etiqueta: "Con vencidos", cantidad: cuenta.vencidos },
            { valor: "inactivos", etiqueta: "Inactivos", cantidad: cuenta.inactivos },
          ]}
        />
      </motion.div>

      {lista.length === 0 ? (
        <Vacio
          icono={Truck}
          titulo={proveedores.length === 0 ? "Todavía no hay proveedores" : "No hay proveedores con ese filtro"}
          texto={proveedores.length === 0 ? "Creá el primero para cargarle órdenes, facturas y pagos." : "Probá con otro texto o filtro."}
        >
          {puedeOperar && proveedores.length === 0 && (
            <Boton onClick={() => setDialogo({ open: true, proveedor: null })}>
              <Plus className="size-4" />
              Nuevo proveedor
            </Boton>
          )}
        </Vacio>
      ) : (
        <motion.ul layout className="grid gap-3 lg:grid-cols-2">
          <AnimatePresence initial={true} mode="popLayout">
            {lista.map((p, i) => (
              <motion.li
                key={p.id}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 12) * 0.03, ...easeSmooth } }}
                exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                className="min-w-0"
              >
                <TarjetaProveedor
                  p={p}
                  puedeOperar={puedeOperar}
                  onEditar={() => setDialogo({ open: true, proveedor: p })}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      <ProveedorDialog
        open={dialogo.open}
        onOpenChange={(o) => setDialogo((d) => ({ ...d, open: o }))}
        proveedor={dialogo.proveedor}
        catalogo={catalogo}
        onGuardado={(id) => {
          if (dialogo.proveedor) router.refresh();
          else router.push(`/admin/proveedores/${id}`);
        }}
      />
    </div>
  );
}

function TarjetaProveedor({
  p,
  puedeOperar,
  onEditar,
}: {
  p: ProveedorListado;
  puedeOperar: boolean;
  onEditar: () => void;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={cn(
        "group relative flex h-full flex-col rounded-2xl border bg-white transition-shadow hover:shadow-card-hover",
        p.documentosVencidos > 0 ? "border-rose-200" : "border-linea",
        !p.activo && "opacity-70"
      )}
    >
      <Link href={`/admin/proveedores/${p.id}`} className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3 pr-8">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-bordo-50 font-heading text-sm text-bordo-800 uppercase">
            {p.nombre.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="truncate font-heading text-base text-foreground">{p.nombre}</div>
            <div className="truncate text-xs text-muted-foreground">
              {[p.rut && `RUT ${p.rut}`, p.contacto_nombre, p.condiciones && `${p.condiciones.plazo_dias} días · ${p.condiciones.moneda}`]
                .filter(Boolean)
                .join(" · ") || "Sin datos de contacto"}
            </div>
          </div>
        </div>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {p.saldos.length === 0 ? (
              <span className="text-sm text-muted-foreground">Sin saldo</span>
            ) : (
              p.saldos.map((s) => (
                <div key={s.moneda}>
                  <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">
                    {s.neto >= 0 ? "Le debemos" : "A favor del club"} · {s.moneda}
                  </div>
                  <div className={cn("font-heading text-lg tabular-nums", s.neto < 0 ? "text-emerald-700" : "text-foreground")}>
                    {formatImporte(Math.abs(s.neto), s.moneda)}
                  </div>
                  {s.vencido > 0 && (
                    <div className="text-[11px] text-rose-700 tabular-nums">Vencido {formatImporte(s.vencido, s.moneda)}</div>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {p.documentosVencidos > 0 ? (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-700">
                {p.documentosVencidos} vencido{p.documentosVencidos === 1 ? "" : "s"}
              </span>
            ) : p.proximoVencimiento ? (
              <span>Próx. venc. {formatFecha(p.proximoVencimiento)}</span>
            ) : null}
            {!p.activo && <span className="rounded-full bg-superficie px-2 py-0.5">Inactivo</span>}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:text-bordo-800" />
          </div>
        </div>
      </Link>
      {puedeOperar && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={onEditar}
          aria-label={`Editar ${p.nombre}`}
          className="absolute top-3 right-3 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-superficie hover:text-bordo-800"
        >
          <Pencil className="size-4" />
        </motion.button>
      )}
    </motion.div>
  );
}
