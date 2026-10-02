"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, PackageMinus, Plus, Search, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatImporte } from "@/lib/contabilidad/formato";
import { costoPromedio, NOMBRE_TIPO_BAJA, TIPOS_BAJA, type TipoBaja } from "@/lib/comercial/stock";
import { springSmooth } from "@/lib/motion";
import type { ItemVista, ProductoVista } from "./tipos";

export interface CentroCosto {
  id: string;
  codigo: string;
  nombre: string;
}

interface Opcion {
  item: ItemVista;
  etiqueta: string;
}

const AYUDA_TIPO: Record<TipoBaja, string> = {
  rotura: "Mercadería dañada que no se puede vender",
  vencimiento: "Productos vencidos",
  robo_extravio: "Faltante identificado por robo o pérdida",
  uso_interno: "Consumo del club o de una disciplina",
  donacion: "Entregado sin cobro",
  muestra: "Muestras o exhibición",
  otro: "Cualquier otro motivo (explicalo)",
};

/**
 * Baja tipificada de mercadería: documento con número, salida valorizada
 * del kardex y asiento contra "Ajustes y mermas" (centro de costo
 * opcional, p. ej. el de la disciplina en un uso interno).
 */
export function BajaDialog({
  open,
  onOpenChange,
  productos,
  inicial,
  verCostos,
  centros,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productos: ProductoVista[];
  inicial?: string | null;
  verCostos: boolean;
  centros: CentroCosto[];
}) {
  const router = useRouter();
  const opciones = useMemo<Opcion[]>(
    () =>
      productos.flatMap((p) =>
        p.items.map((item) => ({ item, etiqueta: p.tieneVariantes ? `${p.nombre} — ${item.nombre}` : p.nombre }))
      ),
    [productos]
  );
  const porClave = useMemo(() => new Map(opciones.map((o) => [o.item.clave, o])), [opciones]);

  const [tipo, setTipo] = useState<TipoBaja | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [centro, setCentro] = useState<string>("tienda");
  const [lineas, setLineas] = useState<{ clave: string; cantidad: string }[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecha, setHecha] = useState<{ id: number } | null>(null);

  // Se reinicia solo al abrir (el refresh posterior a registrar trae productos nuevos).
  const [abiertoAntes, setAbiertoAntes] = useState(false);
  useEffect(() => {
    if (open === abiertoAntes) return;
    setAbiertoAntes(open);
    if (!open) return;
    setTipo(null);
    setDescripcion("");
    setCentro("tienda");
    setBusqueda("");
    setError(null);
    setHecha(null);
    setLineas(inicial && porClave.has(inicial) ? [{ clave: inicial, cantidad: "1" }] : []);
  }, [open, abiertoAntes, inicial, porClave]);

  const sugerencias = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (!t) return [];
    const enLista = new Set(lineas.map((l) => l.clave));
    return opciones
      .filter((o) => o.item.stock > 0 && !enLista.has(o.item.clave))
      .filter((o) => o.etiqueta.toLowerCase().includes(t) || (o.item.sku ?? "").toLowerCase().includes(t))
      .slice(0, 6);
  }, [busqueda, opciones, lineas]);

  const filas = lineas.map((l) => {
    const o = porClave.get(l.clave);
    const n = Number.parseInt(l.cantidad, 10);
    const valida = Number.isInteger(n) && n > 0 && String(n) === l.cantidad.trim();
    const stock = o?.item.stock ?? 0;
    const prom = o ? costoPromedio(o.item.stock, o.item.valor) : null;
    return {
      ...l,
      o,
      n: valida ? n : 0,
      problema: !valida ? "Cantidad inválida" : n > stock ? `Hay ${stock}` : null,
      valor: valida && prom !== null ? n * prom : 0,
      fifo: o?.item.metodo === "fifo",
    };
  });
  const total = filas.reduce((s, f) => s + f.valor, 0);
  const hayFifo = filas.some((f) => f.fifo);
  const puede =
    !!tipo && descripcion.trim().length >= 5 && filas.length > 0 && filas.every((f) => !f.problema) && !enviando;

  function agregar(clave: string) {
    setLineas((ls) => [...ls, { clave, cantidad: "1" }]);
    setBusqueda("");
  }

  async function confirmar() {
    if (!puede || !tipo) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stock/bajas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          descripcion: descripcion.trim(),
          centro_costo_id: centro === "tienda" ? null : centro,
          items: filas.map((f) => ({ producto_id: f.o!.item.productoId, variante_id: f.o!.item.varianteId, cantidad: f.n })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo registrar la baja");
      toast.success("Baja registrada");
      setHecha({ id: json.id });
      router.refresh();
    } catch (e) {
      const m = e instanceof Error ? e.message : "No se pudo registrar la baja";
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
            <PackageMinus className="size-4 text-bordo-700" />
            Dar de baja mercadería
          </DialogTitle>
          <DialogDescription>
            Sale del stock a su costo, queda como documento en el kardex y genera el asiento (Ajustes y mermas / Mercadería).
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait" initial={false}>
          {hecha ? (
            <motion.div
              key="hecha"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={springSmooth}
              className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
            >
              <p className="font-heading">Baja registrada</p>
              <p className="text-xs">El stock y la contabilidad ya están actualizados.</p>
              <div className="flex gap-2">
                <Link
                  href={`/admin/stock/bajas/${hecha.id}`}
                  className="rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
                >
                  Ver la baja
                </Link>
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => onOpenChange(false)}>
                  Cerrar
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              {/* Tipo */}
              <div className="space-y-1.5">
                <Label>Tipo de baja</Label>
                <div className="flex flex-wrap gap-1.5">
                  {TIPOS_BAJA.map((t) => (
                    <motion.button
                      key={t}
                      type="button"
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setTipo(t)}
                      aria-pressed={tipo === t}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        tipo === t ? "border-bordo-700 bg-bordo-800 text-white" : "border-linea text-muted-foreground hover:border-bordo-300"
                      )}
                    >
                      {NOMBRE_TIPO_BAJA[t]}
                    </motion.button>
                  ))}
                </div>
                {tipo && <p className="text-[11px] text-muted-foreground">{AYUDA_TIPO[tipo]}</p>}
              </div>

              {/* Productos */}
              <div className="space-y-2">
                <Label>Productos</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && sugerencias.length > 0) {
                        e.preventDefault();
                        agregar(sugerencias[0].item.clave);
                      }
                    }}
                    placeholder="Agregar por nombre o SKU…"
                    className="pl-9"
                    aria-label="Buscar producto para dar de baja"
                  />
                </div>
                <AnimatePresence>
                  {sugerencias.length > 0 && (
                    <motion.ul
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="overflow-hidden rounded-xl border border-linea"
                    >
                      {sugerencias.map((o) => (
                        <li key={o.item.clave}>
                          <button
                            type="button"
                            onClick={() => agregar(o.item.clave)}
                            className="flex w-full items-center justify-between gap-2 border-b border-linea/60 px-3 py-2 text-left text-sm last:border-0 hover:bg-superficie/60"
                          >
                            <span className="min-w-0 truncate">{o.etiqueta}</span>
                            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                              {o.item.stock} u. <Plus className="size-3" />
                            </span>
                          </button>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>

                {filas.length > 0 && (
                  <ul className="divide-y divide-linea/60 rounded-xl border border-linea">
                    <AnimatePresence initial={false}>
                      {filas.map((f, i) => (
                        <motion.li
                          key={f.clave}
                          layout
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={springSmooth}
                          className="flex items-center gap-2 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate">{f.o?.etiqueta}</p>
                            <p className={cn("text-[11px]", f.problema ? "text-red-600" : "text-muted-foreground")}>
                              {f.problema ?? `Stock ${f.o?.item.stock ?? 0}`}
                              {verCostos && !f.problema && f.valor > 0 && ` · ${f.fifo ? "≈ " : ""}$ ${formatImporte(f.valor)}`}
                            </p>
                          </div>
                          <Input
                            aria-label={`Cantidad a dar de baja de ${f.o?.etiqueta}`}
                            inputMode="numeric"
                            value={f.cantidad}
                            onChange={(e) =>
                              setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, cantidad: e.target.value.replace(/[^\d]/g, "") } : l)))
                            }
                            className={cn("h-8 w-16 text-right tabular-nums", f.problema && "border-red-400")}
                          />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Quitar"
                            onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
              </div>

              <div>
                <Label htmlFor="baja-descripcion">Descripción</Label>
                <Textarea
                  id="baja-descripcion"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={2}
                  placeholder="Qué pasó y quién lo informó (obligatorio)"
                  className="mt-1.5"
                />
              </div>

              {centros.length > 0 && (
                <div>
                  <Label>Centro de costo</Label>
                  <Select value={centro} onValueChange={(v) => setCentro(v ?? "tienda")}>
                    <SelectTrigger className="mt-1.5 w-full">
                      <SelectValue>
                        {centro === "tienda" ? "Tienda (por defecto)" : centros.find((c) => c.id === centro)?.nombre ?? "Tienda"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tienda">Tienda (por defecto)</SelectItem>
                      {centros
                        .filter((c) => c.codigo !== "TIENDA")
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nombre}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-[11px] text-muted-foreground">Por ejemplo, el de la disciplina en un uso interno.</p>
                </div>
              )}

              {verCostos && filas.length > 0 && (
                <motion.div
                  layout
                  className="flex items-center justify-between rounded-xl bg-superficie/60 px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">Valor que se da de baja{hayFifo ? " (aprox., FIFO)" : ""}</span>
                  <span className="font-heading tabular-nums text-bordo-900">$ {formatImporte(total)}</span>
                </motion.div>
              )}

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
            </motion.div>
          )}
        </AnimatePresence>

        {!hecha && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando} className="rounded-full">
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={!puede} className="rounded-full">
              {enviando && <Loader2 className="size-3.5 animate-spin" />}
              {enviando ? "Registrando…" : "Registrar baja"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
