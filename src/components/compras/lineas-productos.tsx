"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatImporte } from "@/lib/contabilidad/formato";
import type { ProductoOpcion } from "@/lib/comercial/compras";
import { ProductoCombobox } from "./comboboxes";
import { ImporteAnimado, claseControl, claseEtiqueta } from "./ui";

export type LineaProducto = { uid: string; clave: string | null; cantidad: string; costo: string };

export const nuevaLinea = (): LineaProducto => ({ uid: crypto.randomUUID(), clave: null, cantidad: "1", costo: "" });

export const aNumero = (s: string) => {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return s.trim() === "" ? NaN : n;
};

/** Acepta "1234,5" o "1234.5" (sin separador de miles). */
export const aImporte = (s: string) => {
  const t = s.trim();
  if (!t) return NaN;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
};

export function totalLineas(lineas: LineaProducto[]): number {
  return lineas.reduce((s, l) => {
    const c = aNumero(l.cantidad);
    const k = aImporte(l.costo);
    return Number.isFinite(c) && Number.isFinite(k) ? s + c * k : s;
  }, 0);
}

/** Editor de líneas producto/variante + cantidad + costo unitario, con total en vivo. */
export function LineasProductos({
  productos,
  lineas,
  onChange,
  moneda,
  errores,
}: {
  productos: ProductoOpcion[];
  lineas: LineaProducto[];
  onChange: (l: LineaProducto[]) => void;
  moneda: string;
  errores?: Record<string, string>;
}) {
  const set = (uid: string, cambios: Partial<LineaProducto>) =>
    onChange(lineas.map((l) => (l.uid === uid ? { ...l, ...cambios } : l)));

  return (
    <div className="space-y-2">
      <div className={cn("hidden gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_6rem_8rem_8rem_2.5rem]", claseEtiqueta)}>
        <span>Producto</span>
        <span className="text-right">Cantidad</span>
        <span className="text-right">Costo unitario</span>
        <span className="text-right">Subtotal</span>
        <span />
      </div>
      <motion.ul layout className="space-y-2">
        <AnimatePresence initial={false}>
          {lineas.map((l) => {
            const c = aNumero(l.cantidad);
            const k = aImporte(l.costo);
            const sub = Number.isFinite(c) && Number.isFinite(k) ? c * k : 0;
            const err = errores?.[l.uid];
            return (
              <motion.li
                key={l.uid}
                layout
                initial={{ opacity: 0, height: 0, y: -6 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_2.5rem] gap-2 rounded-xl border border-linea bg-white p-2 sm:grid-cols-[minmax(0,1fr)_6rem_8rem_8rem_2.5rem] sm:items-center sm:border-0 sm:p-0">
                  <div className="col-span-1 min-w-0">
                    <ProductoCombobox
                      productos={productos}
                      value={l.clave}
                      onChange={(p) => set(l.uid, { clave: p.clave })}
                      invalid={!!err && !l.clave}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => onChange(lineas.filter((x) => x.uid !== l.uid))}
                    disabled={lineas.length === 1}
                    aria-label="Quitar línea"
                    className="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30 sm:order-last"
                  >
                    <Trash2 className="size-4" />
                  </button>
                  <div className="col-span-2 grid grid-cols-3 gap-2 sm:col-span-3 sm:grid-cols-[6rem_8rem_8rem]">
                    <input
                      inputMode="numeric"
                      value={l.cantidad}
                      onChange={(e) => set(l.uid, { cantidad: e.target.value })}
                      aria-label="Cantidad"
                      aria-invalid={!!err && !(c > 0) ? true : undefined}
                      className={cn(claseControl, "text-right tabular-nums")}
                    />
                    <input
                      inputMode="decimal"
                      value={l.costo}
                      onChange={(e) => set(l.uid, { costo: e.target.value })}
                      aria-label="Costo unitario"
                      placeholder="0,00"
                      aria-invalid={!!err && !(k >= 0) ? true : undefined}
                      className={cn(claseControl, "text-right tabular-nums")}
                    />
                    <div className="flex h-10 items-center justify-end px-1 text-sm tabular-nums text-foreground">
                      {formatImporte(sub)}
                    </div>
                  </div>
                </div>
                {err && <div className="px-1 pt-1 text-xs text-rose-700">{err}</div>}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </motion.ul>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={() => onChange([...lineas, nuevaLinea()])}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-bordo-200 px-3 text-sm font-medium text-bordo-800 transition-colors hover:bg-bordo-50"
        >
          <Plus className="size-4" />
          Agregar producto
        </motion.button>
        <div className="text-right">
          <div className={claseEtiqueta}>Total</div>
          <ImporteAnimado valor={totalLineas(lineas)} moneda={moneda} className="font-heading text-xl text-foreground" />
        </div>
      </div>
    </div>
  );
}
