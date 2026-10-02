"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Save, Loader2, Layers, Trash2, AlertTriangle, Archive, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { springSmooth, springBouncy, fadeInUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  type Eje,
  type VarianteCruda,
  type VarianteEditable,
  ejesDesdeVariantes,
  emparejar,
  generarCombinaciones,
  nombreCombinacion,
  particionar,
} from "./variantes-logica";

interface Props {
  productoId: number;
  productoSku: string | null;
  initialVariantes: VarianteCruda[];
  /** Stock por variante según el motor (solo lectura). */
  stockPorVariante: Record<number, { stock: number; conMovimientos: boolean }>;
  /** Stock del producto sin variante (impide crear las primeras variantes). */
  stockSinVariante: number;
  onGuardado?: () => void;
}

const PRESETS: { label: string; eje: string; valores: string[] }[] = [
  { label: "Talles ropa", eje: "Talle", valores: ["XS", "S", "M", "L", "XL", "XXL"] },
  { label: "Talles calzado", eje: "Talle", valores: ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45"] },
  { label: "Talles infantil", eje: "Talle", valores: ["2", "4", "6", "8", "10", "12", "14", "16"] },
];

function normalizar(v: VarianteCruda | VarianteEditable): VarianteEditable {
  return {
    id: v.id,
    nombre: v.nombre,
    sku: v.sku ?? null,
    precio_override: v.precio_override ?? null,
    atributos: (v.atributos ?? {}) as Record<string, string>,
    activo: v.activo !== false,
  };
}

export function VariantesSection({
  productoId,
  productoSku,
  initialVariantes,
  stockPorVariante,
  stockSinVariante,
  onGuardado,
}: Props) {
  const inicio = useMemo(() => {
    const todas = [...initialVariantes].sort((a, b) => a.id - b.id).map(normalizar);
    const ejes = ejesDesdeVariantes(todas);
    return { todas, ejes, dentro: particionar(todas, ejes).dentro };
  }, [initialVariantes]);

  const [todas, setTodas] = useState<VarianteEditable[]>(inicio.todas);
  const [ejes, setEjes] = useState<Eje[]>(inicio.ejes);
  const [variantes, setVariantes] = useState<VarianteEditable[]>(inicio.dentro);
  const [sucio, setSucio] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newEjeName, setNewEjeName] = useState("");
  const [newValueInputs, setNewValueInputs] = useState<Record<number, string>>({});

  const stockDe = (v: VarianteEditable) => (v.id ? stockPorVariante[v.id]?.stock ?? 0 : 0);
  const idsEnTabla = new Set(variantes.filter((v) => v.id).map((v) => v.id));
  const fuera = todas.filter((v) => v.id && !idsEnTabla.has(v.id));
  const seRetiran = fuera.filter((v) => v.activo);
  const discontinuadas = fuera.filter((v) => !v.activo);
  const retiroBloqueado = seRetiran.filter((v) => stockDe(v) > 0);
  const primerasConStockSuelto = todas.length === 0 && variantes.length > 0 && stockSinVariante > 0;

  function regenerar(nuevosEjes: Eje[]) {
    const pool = [...variantes, ...todas.filter((v) => !(v.id && idsEnTabla.has(v.id)))];
    setVariantes(emparejar(generarCombinaciones(nuevosEjes), pool, productoSku, stockDe));
    setSucio(true);
  }

  const addEje = () => {
    const name = newEjeName.trim();
    if (!name) return;
    if (ejes.some((e) => e.nombre.toLowerCase() === name.toLowerCase())) {
      toast.error("Ya existe un eje con ese nombre");
      return;
    }
    setEjes([...ejes, { nombre: name, valores: [] }]);
    setNewEjeName("");
  };

  const removeEje = (index: number) => {
    const updated = ejes.filter((_, i) => i !== index);
    setEjes(updated);
    regenerar(updated);
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    const i = ejes.findIndex((e) => e.nombre.toLowerCase() === preset.eje.toLowerCase());
    const updated =
      i >= 0
        ? ejes.map((e, j) => (j === i ? { ...e, valores: [...new Set([...e.valores, ...preset.valores])] } : e))
        : [...ejes, { nombre: preset.eje, valores: preset.valores }];
    setEjes(updated);
    regenerar(updated);
  };

  const quitarValor = (ejeIndex: number, valor: string) => {
    const updated = ejes.map((e, i) => (i === ejeIndex ? { ...e, valores: e.valores.filter((v) => v !== valor) } : e));
    setEjes(updated);
    regenerar(updated);
  };

  const addCustomValue = (ejeIndex: number) => {
    const val = (newValueInputs[ejeIndex] || "").trim();
    if (!val) return;
    if (ejes[ejeIndex].valores.some((v) => v.toLowerCase() === val.toLowerCase())) {
      toast.error("Ya existe ese valor");
      return;
    }
    const updated = ejes.map((e, i) => (i === ejeIndex ? { ...e, valores: [...e.valores, val] } : e));
    setEjes(updated);
    setNewValueInputs((prev) => ({ ...prev, [ejeIndex]: "" }));
    regenerar(updated);
  };

  const updateVariante = <K extends keyof VarianteEditable>(index: number, field: K, value: VarianteEditable[K]) => {
    setVariantes((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
    setSucio(true);
  };

  const handleSave = async () => {
    if (retiroBloqueado.length > 0) {
      const v = retiroBloqueado[0];
      toast.error(`"${v.nombre}" tiene ${stockDe(v)} unidades: ajustá su stock a 0 antes de quitar esa combinación`);
      return;
    }
    if (primerasConStockSuelto) {
      toast.error(`El producto tiene ${stockSinVariante} unidades sin variante: dejalas en 0 con un ajuste antes de crear variantes`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/productos/${productoId}/variantes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Las discontinuadas viajan igual para que no se toquen.
        body: JSON.stringify({ variantes: [...variantes, ...discontinuadas] }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Error al guardar variantes");

      const nuevas = (json.data as VarianteEditable[]).map(normalizar);
      const nuevosEjes = ejesDesdeVariantes(nuevas);
      const enCombinacion = particionar(nuevas, ejes.length ? ejes : nuevosEjes).dentro;
      setTodas(nuevas);
      setVariantes(enCombinacion);
      setSucio(false);
      toast.success(`${enCombinacion.length} variante${enCombinacion.length === 1 ? "" : "s"} guardada${enCombinacion.length === 1 ? "" : "s"}`);
      for (const a of (json.avisos as string[] | undefined) ?? []) toast.message(a);
      onGuardado?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar variantes");
    } finally {
      setSaving(false);
    }
  };

  const totalStock = variantes.reduce((s, v) => s + stockDe(v), 0);

  return (
    <div className="space-y-5">
      {/* Presets */}
      <div>
        <Label className="text-xs text-muted-foreground">Presets rápidos</Label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <motion.button
              key={preset.label}
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => applyPreset(preset)}
              className="rounded-lg border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
            >
              {preset.label}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Nuevo eje */}
      <div className="flex gap-2">
        <Input
          value={newEjeName}
          onChange={(e) => setNewEjeName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEje())}
          placeholder="Nuevo eje (ej: Color, Material...)"
          className="h-8 text-sm"
        />
        <Button type="button" variant="outline" size="sm" onClick={addEje} disabled={!newEjeName.trim()} className="h-8 shrink-0">
          <Plus className="size-3 mr-1" />
          Agregar
        </Button>
      </div>

      {/* Ejes */}
      <AnimatePresence mode="popLayout">
        {ejes.map((eje, ejeIndex) => (
          <motion.div
            key={eje.nombre}
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
            transition={springSmooth}
            className="rounded-xl border border-border/50 p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="size-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">{eje.nombre}</span>
                <Badge variant="secondary" className="text-[10px] h-4">
                  {eje.valores.length}
                </Badge>
              </div>
              <button
                type="button"
                onClick={() => removeEje(ejeIndex)}
                aria-label={`Quitar eje ${eje.nombre}`}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="size-3" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <AnimatePresence>
                {eje.valores.map((val) => (
                  <motion.button
                    key={val}
                    type="button"
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={springBouncy}
                    onClick={() => quitarValor(ejeIndex, val)}
                    title="Quitar valor"
                    className="group inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    {val}
                    <X className="size-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>

            <div className="flex gap-1.5">
              <Input
                value={newValueInputs[ejeIndex] || ""}
                onChange={(e) => setNewValueInputs((prev) => ({ ...prev, [ejeIndex]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomValue(ejeIndex))}
                placeholder={`Agregar ${eje.nombre.toLowerCase()}...`}
                className="h-7 text-xs"
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => addCustomValue(ejeIndex)} className="h-7 px-2 shrink-0">
                <Plus className="size-3" />
              </Button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Avisos */}
      <AnimatePresence>
        {primerasConStockSuelto && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex gap-2 overflow-hidden rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            El producto tiene {stockSinVariante} unidades sin variante. Para crear variantes, primero dejá ese stock en 0 con un ajuste
            y después cargalo en cada variante.
          </motion.div>
        )}
        {seRetiran.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className={cn(
              "overflow-hidden rounded-xl border p-3 text-xs",
              retiroBloqueado.length ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"
            )}
          >
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-3.5" />
              Al guardar dejan de existir {seRetiran.length} variante{seRetiran.length === 1 ? "" : "s"}:
            </p>
            <ul className="space-y-0.5 pl-5">
              {seRetiran.map((v) => (
                <li key={v.id}>
                  {v.nombre}
                  {stockDe(v) > 0
                    ? ` — tiene ${stockDe(v)} u.: ajustá su stock a 0 o volvé a agregar la combinación`
                    : v.id && stockPorVariante[v.id]?.conMovimientos
                      ? " — tiene historial: se desactiva"
                      : " — se elimina (o se desactiva si tiene ventas)"}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabla */}
      {variantes.length > 0 && (
        <motion.div variants={fadeInUp} initial="hidden" animate="visible" transition={springSmooth} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs font-semibold">
              {variantes.length} variante{variantes.length !== 1 ? "s" : ""}
            </Label>
            <Badge variant="outline" className="text-[10px] h-4">
              Stock total: {totalStock}
            </Badge>
            <AnimatePresence>
              {sucio && (
                <motion.span
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1 text-[11px] text-amber-600"
                >
                  <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
                  Sin guardar
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div className="max-h-[420px] overflow-auto rounded-xl border border-border/50">
            <table className="w-full min-w-[480px] text-xs">
              <thead className="bg-muted/40 sticky top-0 z-10">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Variante</th>
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground w-32">SKU</th>
                  <th className="text-right py-2 px-2 font-medium text-muted-foreground w-16">Stock</th>
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground w-24">Precio</th>
                  <th className="text-center py-2 px-2 font-medium text-muted-foreground w-12">Act.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                <AnimatePresence initial={false}>
                  {variantes.map((v, index) => {
                    const stock = stockDe(v);
                    const original = v.id ? todas.find((t) => t.id === v.id) : undefined;
                    const bloqueaToggle = stock > 0 && (original?.activo ?? true) === v.activo;
                    return (
                      <motion.tr
                        key={v.id ? `id-${v.id}` : `n-${nombreCombinacion(v.atributos)}`}
                        layout
                        initial={{ opacity: 0, backgroundColor: "rgba(16,185,129,0.12)" }}
                        animate={{ opacity: 1, backgroundColor: "rgba(0,0,0,0)" }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4 }}
                        className={v.activo ? "" : "opacity-50"}
                      >
                        <td className="py-1.5 px-3">
                          <span className="font-medium">{v.nombre || nombreCombinacion(v.atributos)}</span>
                          {!v.id && <span className="ml-1.5 rounded bg-emerald-100 px-1 text-[9px] text-emerald-700">nueva</span>}
                        </td>
                        <td className="py-1.5 px-2">
                          <Input
                            value={v.sku || ""}
                            onChange={(e) => updateVariante(index, "sku", e.target.value || null)}
                            className="h-6 text-[11px] font-mono px-1.5"
                          />
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums" title="Se mueve con compras, ventas y ajustes">
                          {v.id ? stock : "—"}
                        </td>
                        <td className="py-1.5 px-2">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={v.precio_override ?? ""}
                            onChange={(e) =>
                              updateVariante(index, "precio_override", e.target.value ? parseFloat(e.target.value) : null)
                            }
                            placeholder="Base"
                            className="h-6 text-[11px] px-1.5"
                          />
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <span title={bloqueaToggle ? "Tiene stock: para desactivarla primero ajustá su stock a 0" : undefined}>
                            <Switch
                              checked={v.activo}
                              disabled={bloqueaToggle}
                              onCheckedChange={(val) => updateVariante(index, "activo", val)}
                              className="scale-75"
                            />
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="size-3" />
            El stock de cada variante es de solo lectura: se carga con el inventario inicial o compras y se corrige con ajustes.
          </p>
        </motion.div>
      )}

      {discontinuadas.length > 0 && (
        <details className="rounded-xl border border-border/50 p-3 text-xs">
          <summary className="flex cursor-pointer items-center gap-1.5 text-muted-foreground">
            <Archive className="size-3.5" />
            {discontinuadas.length} variante{discontinuadas.length === 1 ? "" : "s"} discontinuada{discontinuadas.length === 1 ? "" : "s"} (con historial)
          </summary>
          <ul className="mt-2 space-y-0.5 pl-5 text-muted-foreground">
            {discontinuadas.map((v) => (
              <li key={v.id}>
                {v.nombre} {v.sku && <span className="font-mono">({v.sku})</span>} · stock {stockDe(v)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">Para reactivarla, volvé a agregar su combinación en los ejes.</p>
        </details>
      )}

      {(variantes.length > 0 || seRetiran.length > 0) && (
        <div className="flex justify-end">
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving || retiroBloqueado.length > 0 || primerasConStockSuelto}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <Save className="size-3.5 mr-1.5" />}
              Guardar variantes
            </Button>
          </motion.div>
        </div>
      )}

      {ejes.length === 0 && todas.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-3">Agregá ejes (talle, color, etc.) para generar variantes</p>
      )}
    </div>
  );
}
