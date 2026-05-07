"use client";

import { useEffect, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { RefreshCw, TrendingUp } from "lucide-react";
import { springBouncy } from "@/lib/motion";

type Cotizacion = {
  fecha: string;
  moneda: string;
  compra: number;
  venta: number;
  fuente: string;
};

export function CotizacionBadge() {
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetch("/api/tesoreria/cotizacion")
      .then((r) => r.json())
      .then((d) => {
        if (d.cotizacion) setCotizacion(d.cotizacion);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const refrescar = () => {
    setRefreshing(true);
    startTransition(async () => {
      const res = await fetch("/api/tesoreria/cotizacion", { method: "POST" });
      const data = await res.json();
      if (data.cotizacion) setCotizacion(data.cotizacion);
      setRefreshing(false);
    });
  };

  if (loading) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-superficie px-3 py-1.5 text-xs text-muted-foreground animate-pulse">
        <TrendingUp className="size-3.5" />
        <span>Cargando cotización…</span>
      </div>
    );
  }

  if (!cotizacion) {
    return (
      <button
        onClick={refrescar}
        className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-100"
      >
        <RefreshCw className="size-3.5" />
        Cotización no disponible
      </button>
    );
  }

  const mid = (cotizacion.compra + cotizacion.venta) / 2;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springBouncy}
      className="inline-flex items-center gap-2 rounded-full bg-bordo-50 border border-bordo-100 px-3 py-1.5 text-xs"
    >
      <TrendingUp className="size-3.5 text-bordo-700" />
      <span className="font-heading text-bordo-800">USD</span>
      <span className="text-muted-foreground tabular-nums">
        compra <strong className="text-foreground">{cotizacion.compra.toFixed(2)}</strong>
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="text-muted-foreground tabular-nums">
        venta <strong className="text-foreground">{cotizacion.venta.toFixed(2)}</strong>
      </span>
      <span className="text-muted-foreground hidden sm:inline">
        · mid <span className="tabular-nums">{mid.toFixed(2)}</span>
      </span>
      <button
        onClick={refrescar}
        disabled={refreshing}
        className="ml-1 rounded-full p-1 text-bordo-700 hover:bg-bordo-100 transition-colors disabled:opacity-50"
        title={`Actualizado ${cotizacion.fecha}`}
      >
        <motion.span animate={{ rotate: refreshing ? 360 : 0 }} transition={{ duration: 0.6 }}>
          <RefreshCw className="size-3.5" />
        </motion.span>
      </button>
    </motion.div>
  );
}
