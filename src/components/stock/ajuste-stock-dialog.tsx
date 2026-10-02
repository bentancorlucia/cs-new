"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownUp, Loader2, Minus, Plus, Search } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { formatImporte } from "@/lib/contabilidad/formato";
import { costoPromedio, parseNumeroUY } from "@/lib/comercial/stock";
import { springSmooth } from "@/lib/motion";
import type { ItemVista, ProductoVista } from "./tipos";

const MOTIVOS_RAPIDOS = {
  merma: ["Rotura", "Faltante en conteo", "Robo", "Regalo o promoción", "Uso interno"],
  sobrante: ["Sobrante en conteo", "Devolución sin pedido", "Error de carga anterior"],
};

interface Opcion {
  producto: ProductoVista;
  item: ItemVista;
  etiqueta: string;
}

export function AjusteStockDialog({
  open,
  onOpenChange,
  productos,
  inicial,
  verCostos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productos: ProductoVista[];
  /** Clave del ítem preseleccionado (producto:variante). */
  inicial?: string | null;
  verCostos: boolean;
}) {
  const router = useRouter();
  const opciones = useMemo<Opcion[]>(
    () =>
      productos.flatMap((p) =>
        p.items.map((item) => ({
          producto: p,
          item,
          etiqueta: p.tieneVariantes ? `${p.nombre} — ${item.nombre}` : p.nombre,
        }))
      ),
    [productos]
  );

  const [clave, setClave] = useState<string | null>(inicial ?? null);
  const [busqueda, setBusqueda] = useState("");
  const [sentido, setSentido] = useState<"merma" | "sobrante">("merma");
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setClave(inicial ?? (opciones.length === 1 ? opciones[0].item.clave : null));
      setBusqueda("");
      setSentido("merma");
      setCantidad("");
      setCosto("");
      setMotivo("");
      setError(null);
    }
  }, [open, inicial, opciones]);

  const elegida = opciones.find((o) => o.item.clave === clave) ?? null;
  const filtradas = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    const xs = t
      ? opciones.filter(
          (o) => o.etiqueta.toLowerCase().includes(t) || (o.item.sku ?? "").toLowerCase().includes(t)
        )
      : opciones;
    return xs.slice(0, 8);
  }, [busqueda, opciones]);

  const n = Number.parseInt(cantidad, 10);
  const cantidadValida = Number.isInteger(n) && n > 0 && String(n) === cantidad.trim();
  const delta = cantidadValida ? (sentido === "merma" ? -n : n) : 0;
  const stockActual = elegida?.item.stock ?? 0;
  const nuevoStock = stockActual + delta;
  const promedio = elegida ? costoPromedio(elegida.item.stock, elegida.item.valor) : null;
  const costoNum = costo.trim() ? parseNumeroUY(costo) : null;
  const costoInvalido = costo.trim() !== "" && (costoNum === null || costoNum < 0);
  const motivoValido = motivo.trim().length >= 3;
  const excede = sentido === "merma" && cantidadValida && n > stockActual;
  const puedeEnviar = !!elegida && cantidadValida && motivoValido && !excede && !costoInvalido && !enviando;

  const valorEstimado =
    cantidadValida && verCostos
      ? sentido === "sobrante"
        ? n * (costoNum ?? promedio ?? 0)
        : promedio !== null && elegida?.item.metodo === "promedio"
          ? n * promedio
          : null
      : null;

  async function confirmar() {
    if (!elegida || !puedeEnviar) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stock/ajuste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          producto_id: elegida.item.productoId,
          variante_id: elegida.item.varianteId,
          cantidad: delta,
          motivo: motivo.trim(),
          costo_unitario: sentido === "sobrante" ? costoNum : null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo ajustar el stock");
      toast.success(
        `${sentido === "merma" ? "Merma registrada" : "Sobrante registrado"}: ${elegida.etiqueta} ${delta > 0 ? "+" : ""}${delta}`
      );
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      const m = e instanceof Error ? e.message : "No se pudo ajustar el stock";
      setError(m);
      toast.error(m);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !enviando && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-lg text-bordo-950">
            <ArrowDownUp className="size-4 text-bordo-700" />
            Ajustar stock
          </DialogTitle>
          <DialogDescription>
            Queda en el kardex con su costo y genera el asiento contra &quot;Ajustes y mermas&quot;.
          </DialogDescription>
        </DialogHeader>

        {/* Ítem */}
        <div className="space-y-2">
          <Label>Producto / variante</Label>
          {elegida && (inicial || opciones.length === 1) ? (
            <div className="rounded-xl border border-linea bg-superficie/40 px-3 py-2 text-sm font-medium">
              {elegida.etiqueta}
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre o SKU…"
                  className="pl-9"
                />
              </div>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-linea">
                {filtradas.length === 0 ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">Sin resultados</p>
                ) : (
                  filtradas.map((o) => (
                    <button
                      key={o.item.clave}
                      type="button"
                      onClick={() => setClave(o.item.clave)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 border-b border-linea/60 px-3 py-2 text-left text-sm transition-colors last:border-0 hover:bg-superficie/60",
                        clave === o.item.clave && "bg-bordo-50 text-bordo-900"
                      )}
                    >
                      <span className="min-w-0 truncate">
                        {o.etiqueta}
                        {!o.item.activo && <span className="ml-1 text-[10px] text-muted-foreground">(inactiva)</span>}
                      </span>
                      <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{o.item.stock} u.</span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        <AnimatePresence initial={false}>
          {elegida && (
            <motion.div
              key="form"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={springSmooth}
              className="space-y-4 overflow-hidden"
            >
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-superficie/50 p-3 text-center text-xs">
                <div>
                  <div className="text-muted-foreground">Stock</div>
                  <div className="font-heading text-base tabular-nums">{stockActual}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Costo prom.</div>
                  <div className="font-heading text-base tabular-nums">
                    {verCostos ? (promedio !== null ? formatImporte(promedio) : "—") : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Método</div>
                  <div className="font-heading text-base">{elegida.item.metodo === "fifo" ? "FIFO" : "Promedio"}</div>
                </div>
              </div>

              {/* Sentido */}
              <div className="grid grid-cols-2 gap-2">
                {(["merma", "sobrante"] as const).map((s) => (
                  <motion.button
                    key={s}
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setSentido(s)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                      sentido === s
                        ? s === "merma"
                          ? "border-red-300 bg-red-50 text-red-700"
                          : "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-linea text-muted-foreground hover:bg-superficie/60"
                    )}
                  >
                    {s === "merma" ? <Minus className="size-4" /> : <Plus className="size-4" />}
                    {s === "merma" ? "Merma (sale)" : "Sobrante (entra)"}
                  </motion.button>
                ))}
              </div>

              <div className={cn("grid gap-3", sentido === "sobrante" && "sm:grid-cols-2")}>
                <div>
                  <Label htmlFor="ajuste-cantidad">Cantidad</Label>
                  <Input
                    id="ajuste-cantidad"
                    inputMode="numeric"
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="Unidades"
                    className="mt-1.5"
                  />
                </div>
                {sentido === "sobrante" && (
                  <div>
                    <Label htmlFor="ajuste-costo">Costo unitario (opcional)</Label>
                    <Input
                      id="ajuste-costo"
                      inputMode="decimal"
                      value={costo}
                      onChange={(e) => setCosto(e.target.value)}
                      placeholder={verCostos && promedio !== null ? formatImporte(promedio) : "Costo vigente"}
                      className={cn("mt-1.5", costoInvalido && "border-red-400")}
                    />
                  </div>
                )}
              </div>
              {sentido === "sobrante" && (
                <p className="-mt-2 text-[11px] text-muted-foreground">
                  Si lo dejás vacío entra al costo promedio vigente (o al último costo del kardex).
                </p>
              )}

              <div>
                <Label htmlFor="ajuste-motivo">Motivo</Label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {MOTIVOS_RAPIDOS[sentido].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMotivo(m)}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                        motivo === m ? "border-bordo-300 bg-bordo-50 text-bordo-800" : "border-linea text-muted-foreground hover:border-bordo-200"
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <Textarea
                  id="ajuste-motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={2}
                  placeholder="Contá qué pasó (obligatorio)"
                  className="mt-2"
                />
              </div>

              {/* Resultado */}
              <AnimatePresence>
                {cantidadValida && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className={cn(
                      "rounded-xl border p-3 text-xs",
                      excede ? "border-red-200 bg-red-50 text-red-700" : "border-linea bg-white"
                    )}
                  >
                    {excede ? (
                      <>No hay tanto stock: hay {stockActual} unidades.</>
                    ) : (
                      <div className="space-y-1">
                        <div>
                          Stock: <span className="tabular-nums">{stockActual}</span> →{" "}
                          <strong className="tabular-nums">{nuevoStock}</strong>
                        </div>
                        {verCostos && (
                          <div className="text-muted-foreground">
                            {valorEstimado !== null
                              ? `Valor del ajuste ≈ $ ${formatImporte(valorEstimado)} · `
                              : "Valor según las capas FIFO · "}
                            {sentido === "merma" ? "Debe Ajustes y mermas / Haber Mercadería" : "Debe Mercadería / Haber Ajustes y mermas"}
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {error && (
            <motion.div
              key={error}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
              role="alert"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando} className="rounded-full">
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!puedeEnviar} className="rounded-full">
            {enviando && <Loader2 className="size-3.5 animate-spin" />}
            {enviando ? "Registrando…" : "Confirmar ajuste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
