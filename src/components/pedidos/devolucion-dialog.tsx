"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Banknote, Landmark, Loader2, Minus, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatImporte, mensajeError } from "@/lib/contabilidad/formato";
import { springSmooth } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { PedidoDetalle, ProductoCambio } from "./tipos";

function Stepper({
  valor,
  max,
  onChange,
}: {
  valor: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <motion.button
        type="button"
        whileTap={{ scale: 0.85 }}
        disabled={valor <= 0}
        onClick={() => onChange(Math.max(0, valor - 1))}
        className="flex size-7 items-center justify-center rounded-md bg-superficie text-foreground disabled:opacity-40"
        aria-label="Restar"
      >
        <Minus className="size-3" />
      </motion.button>
      <motion.span
        key={valor}
        initial={{ scale: 1.3, opacity: 0.5 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-6 text-center text-sm font-semibold tabular-nums"
      >
        {valor}
      </motion.span>
      <motion.button
        type="button"
        whileTap={{ scale: 0.85 }}
        disabled={valor >= max}
        onClick={() => onChange(Math.min(max, valor + 1))}
        className="flex size-7 items-center justify-center rounded-md bg-superficie text-foreground disabled:opacity-40"
        aria-label="Sumar"
      >
        <Plus className="size-3" />
      </motion.button>
    </div>
  );
}

interface Nuevo extends ProductoCambio {
  cantidad: number;
}

const clave = (p: { producto_id: number; variante_id: number | null }) => `${p.producto_id}-${p.variante_id ?? 0}`;

/**
 * Devolución y/o cambio de una venta cobrada. La base devuelve la
 * mercadería al costo con que salió, saca la nueva y asienta la diferencia
 * por caja o banco en una sola transacción.
 */
export function DevolucionDialog({
  pedido,
  open,
  onOpenChange,
  onHecho,
}: {
  pedido: PedidoDetalle;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onHecho: () => void;
}) {
  const [devolver, setDevolver] = useState<Record<number, number>>({});
  const [nuevos, setNuevos] = useState<Nuevo[]>([]);
  const [medio, setMedio] = useState<"caja" | "banco">(pedido.metodo_pago === "efectivo" ? "caja" : "banco");
  const [motivo, setMotivo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ProductoCambio[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Unidades ya devueltas por ítem
  const yaDevuelto = useMemo(() => {
    const m = new Map<number, number>();
    for (const d of pedido.contabilidad.devoluciones) {
      for (const i of d.items) {
        if (!i.es_nuevo && i.pedido_item_id != null) {
          m.set(i.pedido_item_id, (m.get(i.pedido_item_id) ?? 0) + i.cantidad);
        }
      }
    }
    return m;
  }, [pedido.contabilidad.devoluciones]);

  const itemsStock = pedido.items.filter((i) => !i.es_encargue);
  // Precio efectivo (con la parte del descuento del pedido), igual que la base
  const factor = useMemo(() => {
    const base = itemsStock.reduce((s, i) => s + i.subtotal, 0);
    const ventas = pedido.contabilidad.venta?.monto_ventas ?? base;
    return base > 0 ? ventas / base : 0;
  }, [itemsStock, pedido.contabilidad.venta]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await fetch(
          `/api/admin/pedidos/${pedido.id}/devolucion?q=${encodeURIComponent(busqueda.trim())}`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setResultados(json.data ?? []);
      } catch (e) {
        toast.error(mensajeError({ message: (e as Error).message }));
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda, open, pedido.id]);

  const importeDevuelto = itemsStock.reduce(
    (s, i) => s + Math.round((i.subtotal / i.cantidad) * (devolver[i.id] ?? 0) * factor * 100) / 100,
    0
  );
  const importeNuevo = nuevos.reduce((s, n) => s + Math.round(n.precio * n.cantidad * 100) / 100, 0);
  const neto = Math.round((importeNuevo - importeDevuelto) * 100) / 100;
  const hayAlgo = importeDevuelto > 0 || nuevos.length > 0 || Object.values(devolver).some((v) => v > 0);

  function agregar(p: ProductoCambio) {
    setNuevos((prev) => {
      const k = clave(p);
      const ex = prev.find((n) => clave(n) === k);
      if (ex) return prev.map((n) => (clave(n) === k ? { ...n, cantidad: Math.min(n.stock, n.cantidad + 1) } : n));
      return [...prev, { ...p, cantidad: 1 }];
    });
  }

  function reiniciar() {
    setDevolver({});
    setNuevos([]);
    setMotivo("");
    setBusqueda("");
  }

  async function confirmar() {
    setEnviando(true);
    try {
      const res = await fetch(`/api/admin/pedidos/${pedido.id}/devolucion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medio,
          motivo: motivo.trim(),
          devueltos: Object.entries(devolver)
            .filter(([, c]) => c > 0)
            .map(([id, cantidad]) => ({ pedido_item_id: Number(id), cantidad })),
          nuevos: nuevos.map((n) => ({ producto_id: n.producto_id, variante_id: n.variante_id, cantidad: n.cantidad })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(nuevos.length > 0 ? "Cambio registrado" : "Devolución registrada");
      reiniciar();
      onHecho();
    } catch (e) {
      toast.error(mensajeError({ message: (e as Error).message }));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reiniciar();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Devolución / cambio · {pedido.numero_pedido}</DialogTitle>
          <DialogDescription>
            Lo devuelto vuelve al stock al costo con que salió. Si se lleva otra cosa, sale del stock al precio
            {pedido.aplico_precio_socio ? " de socio" : " de lista"}. La diferencia se reintegra o se cobra por caja o
            banco.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Qué devuelve */}
          <section>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Qué devuelve</Label>
            <ul className="mt-2 divide-y divide-linea rounded-lg border border-linea">
              {itemsStock.map((i) => {
                const disponible = i.cantidad - (yaDevuelto.get(i.id) ?? 0);
                return (
                  <li key={i.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {i.producto.nombre}
                        {i.variante && <span className="text-muted-foreground"> — {i.variante.nombre}</span>}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatImporte((i.subtotal / i.cantidad) * factor, "UYU")} c/u ·{" "}
                        {disponible > 0 ? `${disponible} de ${i.cantidad} disponibles` : "ya devuelto"}
                      </p>
                    </div>
                    <Stepper
                      valor={devolver[i.id] ?? 0}
                      max={disponible}
                      onChange={(v) => setDevolver((p) => ({ ...p, [i.id]: v }))}
                    />
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Qué se lleva */}
          <section>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Qué se lleva a cambio (opcional)
            </Label>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar producto o SKU..."
                className="h-9 pl-9"
              />
              {buscando && (
                <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {resultados.length === 0 && !buscando ? (
                <p className="py-2 text-center text-xs text-muted-foreground">Sin resultados</p>
              ) : (
                resultados.map((p) => (
                  <motion.button
                    key={clave(p)}
                    type="button"
                    whileHover={{ x: 2 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={p.stock <= 0}
                    onClick={() => agregar(p)}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-superficie disabled:opacity-40"
                  >
                    <span className="truncate">
                      {p.nombre}
                      {p.variante && <span className="text-muted-foreground"> — {p.variante}</span>}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatImporte(p.precio, "UYU")} · stock {p.stock}
                    </span>
                  </motion.button>
                ))
              )}
            </div>
            <AnimatePresence initial={false}>
              {nuevos.length > 0 && (
                <motion.ul
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 divide-y divide-linea overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50/40"
                >
                  <AnimatePresence initial={false}>
                    {nuevos.map((n) => (
                      <motion.li
                        key={clave(n)}
                        layout
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        transition={springSmooth}
                        className="flex items-center gap-3 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">
                            {n.nombre}
                            {n.variante && <span className="text-muted-foreground"> — {n.variante}</span>}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{formatImporte(n.precio, "UYU")} c/u</p>
                        </div>
                        <Stepper
                          valor={n.cantidad}
                          max={n.stock}
                          onChange={(v) =>
                            setNuevos((prev) =>
                              v === 0
                                ? prev.filter((x) => clave(x) !== clave(n))
                                : prev.map((x) => (clave(x) === clave(n) ? { ...x, cantidad: v } : x))
                            )
                          }
                        />
                        <button
                          type="button"
                          onClick={() => setNuevos((prev) => prev.filter((x) => clave(x) !== clave(n)))}
                          className="text-muted-foreground hover:text-red-600"
                          aria-label="Quitar"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </motion.ul>
              )}
            </AnimatePresence>
          </section>

          {/* Medio */}
          <section>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">La diferencia va por</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(
                [
                  { v: "caja", label: "Caja (efectivo)", icon: Banknote },
                  { v: "banco", label: "Banco (transferencia)", icon: Landmark },
                ] as const
              ).map((o) => (
                <motion.button
                  key={o.v}
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setMedio(o.v)}
                  className={cn(
                    "relative flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                    medio === o.v ? "border-bordo-800 text-bordo-900" : "border-linea text-muted-foreground"
                  )}
                >
                  {medio === o.v && (
                    <motion.span
                      layoutId="medio-devolucion"
                      className="absolute inset-0 rounded-lg bg-bordo-50"
                      transition={springSmooth}
                    />
                  )}
                  <o.icon className="relative size-4" />
                  <span className="relative">{o.label}</span>
                </motion.button>
              ))}
            </div>
            {medio === "caja" && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">Requiere la caja del POS abierta.</p>
            )}
          </section>

          <section>
            <Label htmlFor="motivo-devolucion" className="text-xs uppercase tracking-wide text-muted-foreground">
              Motivo
            </Label>
            <Textarea
              id="motivo-devolucion"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: talle equivocado, cambia por un M"
              rows={2}
              className="mt-2"
            />
          </section>

          {/* Resumen */}
          <motion.div layout className="space-y-1 rounded-lg bg-superficie/60 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Devuelve</span>
              <span className="tabular-nums">− {formatImporte(importeDevuelto, "UYU")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Se lleva</span>
              <span className="tabular-nums">+ {formatImporte(importeNuevo, "UYU")}</span>
            </div>
            <div className="flex justify-between border-t border-linea pt-1 font-semibold">
              <span>
                {neto < 0 ? "Reintegrar al cliente" : neto > 0 ? "Cobrar al cliente" : "Sin diferencia"}
              </span>
              <span className={cn("tabular-nums", neto < 0 ? "text-red-600" : neto > 0 && "text-emerald-700")}>
                {formatImporte(Math.abs(neto), "UYU")}
              </span>
            </div>
          </motion.div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Volver
          </Button>
          <Button onClick={confirmar} disabled={enviando || !hayAlgo || motivo.trim().length < 3}>
            {enviando ? <Loader2 className="size-4 animate-spin" /> : nuevos.length > 0 ? "Registrar cambio" : "Registrar devolución"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
