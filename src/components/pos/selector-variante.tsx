"use client";

import { motion } from "framer-motion";
import { Plus, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { precioListaUnitario } from "@/lib/tienda/precios";
import { fadeInUp, springSmooth, staggerContainerFast } from "@/lib/motion";
import type { ProductoPos, VariantePos } from "./tipos";
import { pesos } from "./formato";

/** Elegir variante del stock o tomar un encargue. */
export function SelectorVariante({
  producto,
  onCerrar,
  onElegir,
  onEncargar,
}: {
  producto: ProductoPos | null;
  onCerrar: () => void;
  onElegir: (p: ProductoPos, v: VariantePos | null) => void;
  onEncargar: (p: ProductoPos) => void;
}) {
  return (
    <Dialog open={!!producto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{producto?.nombre}</DialogTitle>
          <DialogDescription>
            {producto?.mto_disponible
              ? "Vendé del stock o tomá un encargue personalizado."
              : "Elegí la variante para agregar al carrito."}
          </DialogDescription>
        </DialogHeader>
        {producto && (
          <motion.div
            variants={staggerContainerFast}
            initial="hidden"
            animate="visible"
            className="grid gap-2 py-2 max-h-[60vh] overflow-y-auto"
          >
            {producto.variantes.length === 0 && !producto.mto_solo && (
              <Opcion
                titulo="Del stock"
                disponible={producto.disponible}
                precio={producto.precio}
                onClick={() => onElegir(producto, null)}
              />
            )}
            {producto.variantes.map((v) => (
              <Opcion
                key={v.id}
                titulo={Object.values(v.atributos || {}).join(" / ") || v.nombre}
                sku={v.sku}
                disponible={v.disponible}
                precio={precioListaUnitario(producto, v.precio_override)}
                onClick={() => onElegir(producto, v)}
              />
            ))}
          </motion.div>
        )}
        {producto?.mto_disponible && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springSmooth}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onEncargar(producto)}
            className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-dorado-300 bg-dorado-300/10 p-4 text-left transition-colors hover:border-bordo-300 hover:bg-dorado-300/20"
          >
            <span className="flex items-center gap-2 font-body font-medium text-sm text-bordo-800">
              <Sparkles className="size-4" />
              Encargar personalizado
            </span>
            <span className="text-xs text-muted-foreground">No descuenta stock</span>
          </motion.button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Opcion({
  titulo,
  sku,
  disponible,
  precio,
  onClick,
}: {
  titulo: string;
  sku?: string | null;
  disponible: number;
  precio: number;
  onClick: () => void;
}) {
  const sinStock = disponible <= 0;
  return (
    <motion.button
      type="button"
      variants={fadeInUp}
      whileHover={sinStock ? {} : { scale: 1.01 }}
      whileTap={sinStock ? {} : { scale: 0.98 }}
      disabled={sinStock}
      onClick={onClick}
      className={`flex items-center justify-between gap-3 rounded-xl border p-4 text-left transition-all
        ${sinStock
          ? "opacity-40 cursor-not-allowed border-gray-200 bg-gray-50"
          : "border-linea hover:border-bordo-300 hover:bg-bordo-50/50 cursor-pointer"}`}
    >
      <div className="flex-1 min-w-0">
        <p className="font-body font-medium text-sm">{titulo}</p>
        {sku && <p className="text-[11px] text-muted-foreground font-mono">{sku}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-muted-foreground">Disp.: {disponible}</span>
        <span className="font-heading font-bold text-sm text-bordo-700 tabular-nums">{pesos(precio)}</span>
        {!sinStock && (
          <div className="size-8 rounded-lg bg-bordo-800 text-white flex items-center justify-center">
            <Plus className="size-4" />
          </div>
        )}
      </div>
    </motion.button>
  );
}
