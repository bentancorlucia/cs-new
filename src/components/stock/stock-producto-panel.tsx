"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardCheck, ClipboardList, History, Loader2, Lock, PackageMinus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatImporte } from "@/lib/contabilidad/formato";
import { AYUDA_STOCK, costoPromedio, type MetodoCosteo } from "@/lib/comercial/stock";
import { springSmooth } from "@/lib/motion";
import { EnteroAnimado, ImporteAnimado } from "@/components/contabilidad/reportes/importe-animado";
import type { ProductoVista } from "./tipos";

const METODOS: { id: MetodoCosteo; label: string; desc: string }[] = [
  { id: "promedio", label: "Promedio", desc: "Cada salida al costo promedio vigente" },
  { id: "fifo", label: "FIFO", desc: "Sale primero lo que entró primero" },
];

/**
 * Stock del producto en la ficha: solo lectura (se mueve con compras,
 * ventas, devoluciones, bajas y recuentos), con link al kardex y el método de costeo.
 */
export function StockProductoPanel({
  stock,
  verCostos,
  puedeOperar,
  puedeInventario,
}: {
  stock: ProductoVista;
  verCostos: boolean;
  puedeOperar: boolean;
  puedeInventario: boolean;
}) {
  const router = useRouter();
  const [metodo, setMetodo] = useState<MetodoCosteo | "mixto">(stock.metodo);
  const [cambiando, setCambiando] = useState<MetodoCosteo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prom = costoPromedio(stock.stock, stock.valor);
  const sinMovimientos = stock.items.every((i) => !i.conMovimientos);
  const unico = !stock.tieneVariantes ? stock.items[0] : null;

  async function cambiar(m: MetodoCosteo) {
    if (m === metodo || cambiando) return;
    setCambiando(m);
    setError(null);
    try {
      const res = await fetch(`/api/admin/productos/${stock.id}/costeo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metodo: m }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo cambiar el método");
      setMetodo(m);
      toast.success(`Método de costeo: ${m === "fifo" ? "FIFO" : "promedio ponderado"}`);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo cambiar el método";
      setError(msg);
      toast.error(msg);
    } finally {
      setCambiando(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-superficie/50 p-3">
          <p className="text-[11px] text-muted-foreground">Stock</p>
          <p className={cn("font-display text-2xl tracking-tightest", stock.stock === 0 ? "text-red-600" : "text-bordo-900")}>
            <EnteroAnimado valor={stock.stock} />
          </p>
          <p className="text-[10px] text-muted-foreground">
            {stock.reservado > 0 ? `${stock.reservado} reservadas · ${stock.disponible} disp.` : "Sin reservas"}
          </p>
        </div>
        {verCostos ? (
          <div className="rounded-xl bg-superficie/50 p-3">
            <p className="text-[11px] text-muted-foreground">Valor a costo</p>
            <p className="font-display text-lg tracking-tightest text-bordo-900">
              <ImporteAnimado valor={stock.valor} moneda="UYU" />
            </p>
            <p className="text-[10px] text-muted-foreground">
              {prom !== null ? `Costo prom. $ ${formatImporte(prom)}` : "Sin costo todavía"}
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-superficie/50 p-3">
            <p className="text-[11px] text-muted-foreground">Disponible</p>
            <p className="font-display text-2xl tracking-tightest">
              <EnteroAnimado valor={stock.disponible} />
            </p>
          </div>
        )}
      </div>

      {stock.tieneVariantes && (
        <ul className="max-h-48 divide-y divide-linea/60 overflow-y-auto rounded-xl border border-linea text-xs">
          {stock.items.map((i) => (
            <li key={i.clave} className={cn("flex items-center justify-between gap-2 px-3 py-1.5", !i.activo && "opacity-60")}>
              <span className="truncate">
                {i.nombre}
                {!i.activo && <span className="ml-1 text-[10px] text-muted-foreground">(inactiva)</span>}
              </span>
              <span className="shrink-0 tabular-nums">
                {i.stock}
                {i.reservado > 0 && <span className="text-orange-600"> ({i.reservado} res.)</span>}
                {verCostos && <span className="ml-2 text-muted-foreground">$ {formatImporte(i.valor)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="mt-0.5 size-3 shrink-0" />
        El stock no se edita en la ficha. {AYUDA_STOCK}
      </p>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/admin/stock/kardex/${stock.id}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-linea px-3 py-1.5 text-xs font-medium transition-colors hover:border-bordo-300 hover:text-bordo-800"
        >
          <History className="size-3.5" />
          Ver kardex
        </Link>
        {puedeOperar && stock.stock > 0 && (
          <Link
            href={unico ? `/admin/stock?baja=${unico.clave}` : "/admin/stock"}
            className="inline-flex items-center gap-1.5 rounded-full border border-linea px-3 py-1.5 text-xs font-medium transition-colors hover:border-bordo-300 hover:text-bordo-800"
          >
            <PackageMinus className="size-3.5" />
            Dar de baja
          </Link>
        )}
        {puedeOperar && (
          <Link
            href="/admin/stock/recuentos"
            className="inline-flex items-center gap-1.5 rounded-full border border-linea px-3 py-1.5 text-xs font-medium transition-colors hover:border-bordo-300 hover:text-bordo-800"
          >
            <ClipboardCheck className="size-3.5" />
            Recuento
          </Link>
        )}
        {puedeInventario && sinMovimientos && stock.items.length > 0 && (
          <Link
            href="/admin/stock/inventario-inicial"
            className="inline-flex items-center gap-1.5 rounded-full border border-linea px-3 py-1.5 text-xs font-medium transition-colors hover:border-bordo-300 hover:text-bordo-800"
          >
            <ClipboardList className="size-3.5" />
            Inventario inicial
          </Link>
        )}
      </div>

      {puedeOperar && (
        <div className="space-y-2 border-t border-linea/60 pt-4">
          <p className="text-xs font-medium">Método de costeo</p>
          <div className="grid grid-cols-2 gap-2">
            {METODOS.map((m) => {
              const activo = metodo === m.id;
              return (
                <motion.button
                  key={m.id}
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => cambiar(m.id)}
                  disabled={!!cambiando}
                  aria-pressed={activo}
                  className={cn(
                    "relative overflow-hidden rounded-xl border p-2.5 text-left transition-colors",
                    activo ? "border-bordo-300 text-bordo-900" : "border-linea text-muted-foreground hover:border-bordo-200"
                  )}
                >
                  {activo && (
                    <motion.span layoutId="metodo-costeo" className="absolute inset-0 bg-bordo-50" transition={springSmooth} />
                  )}
                  <span className="relative flex items-center gap-1.5 text-sm font-medium">
                    {cambiando === m.id && <Loader2 className="size-3 animate-spin" />}
                    {m.label}
                  </span>
                  <span className="relative block text-[10px] leading-tight">{m.desc}</span>
                </motion.button>
              );
            })}
          </div>
          {metodo === "mixto" && (
            <p className="text-[11px] text-amber-700">Las variantes tienen métodos distintos: elegí uno para todas.</p>
          )}
          <p className="text-[11px] text-muted-foreground">Solo se puede cambiar cuando el producto no tiene stock.</p>
          <AnimatePresence>
            {error && (
              <motion.p
                key={error}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, x: [0, -5, 5, -3, 3, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-700"
                role="alert"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
