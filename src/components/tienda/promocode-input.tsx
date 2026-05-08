"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tag, X, Loader2, Check, AlertCircle } from "lucide-react";
import { useCart, type CartPromocode } from "@/hooks/use-cart";
import { springSmooth } from "@/lib/motion";

export function PromocodeInput() {
  const { items, promocode, setPromocode } = useCart();
  const [open, setOpen] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function aplicar() {
    const trimmed = codigo.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/promocodes/validar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: trimmed,
          items: items.map((i) => ({
            precio: i.precio,
            precioSocio: i.precioSocio ?? null,
            precioExtra: i.precioExtra ?? 0,
            cantidad: i.cantidad,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo aplicar el código");
        return;
      }
      const p = data.promocode as CartPromocode;
      setPromocode(p);
      setCodigo("");
      setOpen(false);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  if (promocode) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springSmooth}
        className="flex items-center justify-between gap-2 border border-bordo-800/15 bg-bordo-800/5 px-3 py-2.5"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Tag className="size-4 text-bordo-800 shrink-0" />
          <div className="min-w-0">
            <p className="font-mono text-sm font-bold text-bordo-950 truncate">
              {promocode.codigo}
            </p>
            <p className="text-[10px] text-bordo-800/60 leading-tight">
              {promocode.tipo_descuento === "porcentaje"
                ? `${promocode.valor}% de descuento`
                : `$${promocode.valor.toLocaleString("es-UY")} de descuento`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPromocode(null)}
          className="flex size-7 items-center justify-center rounded-full text-bordo-800/40 transition-colors hover:bg-bordo-800/10 hover:text-bordo-950"
          aria-label="Quitar código"
        >
          <X className="size-3.5" />
        </button>
      </motion.div>
    );
  }

  return (
    <div>
      <AnimatePresence mode="wait" initial={false}>
        {!open ? (
          <motion.button
            key="trigger"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            type="button"
            onClick={() => setOpen(true)}
            className="flex w-full items-center gap-2 border border-dashed border-bordo-800/20 bg-transparent px-3 py-2.5 font-heading text-[11px] uppercase tracking-editorial text-bordo-800/70 transition-colors hover:border-bordo-800/40 hover:text-bordo-950"
          >
            <Tag className="size-3.5" />
            ¿Tenés un código de descuento?
          </motion.button>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={springSmooth}
            className="overflow-hidden"
          >
            <div className="flex items-stretch gap-2">
              <input
                type="text"
                value={codigo}
                onChange={(e) => {
                  setCodigo(e.target.value.toUpperCase());
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    aplicar();
                  }
                }}
                placeholder="CÓDIGO"
                autoFocus
                disabled={loading}
                maxLength={40}
                className="flex-1 border border-bordo-800/15 bg-white px-3 py-2 font-mono text-sm uppercase text-bordo-950 placeholder:text-bordo-800/30 focus:border-bordo-800 focus:outline-none disabled:opacity-50"
              />
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={aplicar}
                disabled={loading || codigo.trim().length === 0}
                className="flex items-center gap-1.5 bg-bordo-800 px-4 py-2 font-heading text-[10px] uppercase tracking-editorial text-white transition-colors hover:bg-bordo-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Aplicar
              </motion.button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setCodigo("");
                  setError(null);
                }}
                className="flex size-9 shrink-0 items-center justify-center text-bordo-800/40 transition-colors hover:text-bordo-950"
                aria-label="Cancelar"
              >
                <X className="size-4" />
              </button>
            </div>
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-1.5 flex items-center gap-1.5 text-[11px] text-red-700"
                >
                  <AlertCircle className="size-3" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
