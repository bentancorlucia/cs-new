"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Banknote, Wallet, CreditCard, ArrowRight, Pencil } from "lucide-react";
import { staggerContainer, fadeInUp, springSmooth } from "@/lib/motion";
import { convertir, formatearMoneda, type Moneda } from "@/lib/tesoreria/conversion";
import type { Cotizacion } from "@/lib/tesoreria/bcu";
import { CuentaEditModal } from "./cuenta-edit-modal";

type Cuenta = {
  id: number;
  nombre: string;
  tipo: "bancaria" | "mercadopago" | "caja_chica" | "virtual";
  moneda: Moneda;
  banco: string | null;
  numero_cuenta: string | null;
  titular?: string | null;
  descripcion?: string | null;
  saldo_actual: number | string;
  saldo_inicial?: number | string | null;
  color: string | null;
  modulo: string | null;
};

const ICONS: Record<Cuenta["tipo"], React.ComponentType<{ className?: string }>> = {
  bancaria: Banknote,
  caja_chica: Wallet,
  mercadopago: CreditCard,
  virtual: CreditCard,
};

export function CuentasGrid({
  cuentas,
  cotizacion,
}: {
  cuentas: Cuenta[];
  cotizacion: Cotizacion | null;
}) {
  const [vista, setVista] = useState<Moneda>("UYU");
  const [editing, setEditing] = useState<Cuenta | null>(null);

  const totales = useMemo(() => {
    let totalUYU = 0;
    let totalUSD = 0;
    for (const c of cuentas) {
      const saldo = Number(c.saldo_actual);
      if (c.moneda === "UYU") {
        totalUYU += saldo;
        const enUSD = convertir(saldo, "UYU", "USD", cotizacion);
        if (enUSD !== null) totalUSD += enUSD;
      } else {
        totalUSD += saldo;
        const enUYU = convertir(saldo, "USD", "UYU", cotizacion);
        if (enUYU !== null) totalUYU += enUYU;
      }
    }
    return { totalUYU, totalUSD };
  }, [cuentas, cotizacion]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-linea bg-white p-4">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-xs uppercase tracking-editorial text-muted-foreground font-heading">
              Total consolidado
            </div>
            <motion.div
              key={vista}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={springSmooth}
              className="font-heading text-2xl text-bordo-900 tabular-nums"
            >
              {vista === "UYU"
                ? formatearMoneda(totales.totalUYU, "UYU")
                : formatearMoneda(totales.totalUSD, "USD")}
            </motion.div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {vista === "UYU"
                ? `≈ ${formatearMoneda(totales.totalUSD, "USD")}`
                : `≈ ${formatearMoneda(totales.totalUYU, "UYU")}`}
            </div>
          </div>
        </div>
        <div className="inline-flex rounded-full border border-linea bg-superficie p-1 text-xs">
          {(["UYU", "USD"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setVista(m)}
              className={`relative px-4 py-1.5 rounded-full font-heading transition-colors ${
                vista === m
                  ? "text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {vista === m && (
                <motion.span
                  layoutId="vista-moneda"
                  className="absolute inset-0 rounded-full bg-bordo-800"
                  transition={springSmooth}
                />
              )}
              <span className="relative">{m}</span>
            </button>
          ))}
        </div>
      </div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {cuentas.map((cuenta) => {
          const Icon = ICONS[cuenta.tipo];
          const saldo = Number(cuenta.saldo_actual);
          const equivalente =
            cuenta.moneda === vista
              ? null
              : convertir(saldo, cuenta.moneda, vista, cotizacion);

          return (
            <motion.div key={cuenta.id} variants={fadeInUp} className="h-full">
              <Link
                href={`/tesoreria/cuentas/${cuenta.id}`}
                className="flex h-full flex-col rounded-2xl border border-linea bg-white p-4 hover:border-bordo-200 hover:shadow-card transition-all group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="flex size-9 items-center justify-center rounded-full"
                    style={{ backgroundColor: (cuenta.color ?? "#730d32") + "1a", color: cuenta.color ?? "#730d32" }}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Editar cuenta"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditing(cuenta);
                      }}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-bordo-700 hover:bg-bordo-50 transition-colors"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <ArrowRight className="size-4 text-muted-foreground group-hover:text-bordo-700 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="font-heading text-base text-foreground">{cuenta.nombre}</div>
                  <div className="text-xs text-muted-foreground">
                    {cuenta.banco ?? cuenta.tipo}
                    {cuenta.numero_cuenta ? ` · ${cuenta.numero_cuenta}` : ""}
                    {cuenta.modulo === "tienda" ? " · Tienda" : ""}
                  </div>
                </div>
                <div className="mt-auto pt-4">
                  <div className="font-heading text-xl tabular-nums text-foreground">
                    {formatearMoneda(saldo, cuenta.moneda)}
                  </div>
                  <div className="min-h-[1rem] text-xs text-muted-foreground tabular-nums">
                    {equivalente !== null ? `≈ ${formatearMoneda(equivalente, vista)}` : ""}
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
        {cuentas.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-linea p-8 text-center text-sm text-muted-foreground">
            Todavía no hay cuentas. Creá tu primera cuenta.
          </div>
        )}
      </motion.div>

      {editing && (
        <CuentaEditModal
          cuenta={editing}
          open={!!editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
