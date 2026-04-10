"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  X,
  Save,
  Loader2,
  Layers,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { springSmooth, springBouncy, fadeInUp } from "@/lib/motion";
import { toast } from "sonner";

// --- Types ---

interface Eje {
  nombre: string;
  valores: string[];
}

interface Variante {
  id?: number;
  nombre: string;
  sku: string | null;
  precio_override: number | null;
  stock_actual: number;
  atributos: Record<string, string>;
  activo: boolean;
}

interface Props {
  productoId: number;
  productoSku: string | null;
  initialVariantes: Variante[];
  onStockChange?: (totalStock: number) => void;
}

// --- Presets ---

const PRESETS: { label: string; eje: string; valores: string[] }[] = [
  { label: "Talles ropa", eje: "Talle", valores: ["XS", "S", "M", "L", "XL", "XXL"] },
  { label: "Talles calzado", eje: "Talle", valores: ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45"] },
  { label: "Talles infantil", eje: "Talle", valores: ["2", "4", "6", "8", "10", "12", "14", "16"] },
];

// --- Helpers ---

function generateCombinations(ejes: Eje[]): Record<string, string>[] {
  if (ejes.length === 0) return [];
  const activeEjes = ejes.filter((e) => e.valores.length > 0);
  if (activeEjes.length === 0) return [];

  return activeEjes.reduce<Record<string, string>[]>(
    (combos, eje) => {
      if (combos.length === 0) {
        return eje.valores.map((v) => ({ [eje.nombre]: v }));
      }
      const result: Record<string, string>[] = [];
      for (const combo of combos) {
        for (const valor of eje.valores) {
          result.push({ ...combo, [eje.nombre]: valor });
        }
      }
      return result;
    },
    []
  );
}

function comboName(atributos: Record<string, string>): string {
  return Object.values(atributos).join(" / ");
}

function comboSkuSuffix(atributos: Record<string, string>): string {
  return Object.values(atributos)
    .map((v) => v.toUpperCase().replace(/\s+/g, "").slice(0, 4))
    .join("-");
}

function atributosMatch(a: Record<string, string>, b: Record<string, string>): boolean {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k, i) => k === keysB[i] && a[k] === b[k]);
}

// --- Component ---

export function VariantesSection({ productoId, productoSku, initialVariantes, onStockChange }: Props) {
  // Reconstruct ejes from existing variantes
  const initialEjes = useMemo(() => {
    if (initialVariantes.length === 0) return [];
    const ejeMap = new Map<string, Set<string>>();
    for (const v of initialVariantes) {
      for (const [key, val] of Object.entries(v.atributos || {})) {
        if (!ejeMap.has(key)) ejeMap.set(key, new Set());
        ejeMap.get(key)!.add(val);
      }
    }
    return Array.from(ejeMap.entries()).map(([nombre, vals]) => ({
      nombre,
      valores: Array.from(vals),
    }));
  }, [initialVariantes]);

  const [ejes, setEjes] = useState<Eje[]>(initialEjes);
  const [variantes, setVariantes] = useState<Variante[]>(initialVariantes);
  const [saving, setSaving] = useState(false);
  const [newEjeName, setNewEjeName] = useState("");
  const [newValueInputs, setNewValueInputs] = useState<Record<number, string>>({});

  // Generate combinations from ejes and merge with existing variantes
  const regenerate = useCallback(
    (updatedEjes: Eje[]) => {
      const combos = generateCombinations(updatedEjes);

      setVariantes((prev) => {
        return combos.map((atribs) => {
          // Find existing variant with same atributos
          const existing = prev.find((v) => atributosMatch(v.atributos, atribs));
          if (existing) return existing;

          const baseSku = productoSku || "";
          return {
            nombre: comboName(atribs),
            sku: baseSku ? `${baseSku}-${comboSkuSuffix(atribs)}` : null,
            precio_override: null,
            stock_actual: 0,
            atributos: atribs,
            activo: true,
          };
        });
      });
    },
    [productoSku]
  );

  const addEje = () => {
    const name = newEjeName.trim();
    if (!name) return;
    if (ejes.some((e) => e.nombre.toLowerCase() === name.toLowerCase())) {
      toast.error("Ya existe un eje con ese nombre");
      return;
    }
    const updated = [...ejes, { nombre: name, valores: [] }];
    setEjes(updated);
    setNewEjeName("");
  };

  const removeEje = (index: number) => {
    const updated = ejes.filter((_, i) => i !== index);
    setEjes(updated);
    regenerate(updated);
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    const existingIndex = ejes.findIndex(
      (e) => e.nombre.toLowerCase() === preset.eje.toLowerCase()
    );

    let updated: Eje[];
    if (existingIndex >= 0) {
      updated = ejes.map((e, i) =>
        i === existingIndex ? { ...e, valores: preset.valores } : e
      );
    } else {
      updated = [...ejes, { nombre: preset.eje, valores: preset.valores }];
    }

    setEjes(updated);
    regenerate(updated);
  };

  const toggleValue = (ejeIndex: number, valor: string) => {
    const eje = ejes[ejeIndex];
    const has = eje.valores.includes(valor);
    const updated = ejes.map((e, i) =>
      i === ejeIndex
        ? {
            ...e,
            valores: has
              ? e.valores.filter((v) => v !== valor)
              : [...e.valores, valor],
          }
        : e
    );
    setEjes(updated);
    regenerate(updated);
  };

  const addCustomValue = (ejeIndex: number) => {
    const val = (newValueInputs[ejeIndex] || "").trim();
    if (!val) return;
    const eje = ejes[ejeIndex];
    if (eje.valores.includes(val)) {
      toast.error("Ya existe ese valor");
      return;
    }
    const updated = ejes.map((e, i) =>
      i === ejeIndex ? { ...e, valores: [...e.valores, val] } : e
    );
    setEjes(updated);
    setNewValueInputs((prev) => ({ ...prev, [ejeIndex]: "" }));
    regenerate(updated);
  };

  const updateVariante = (index: number, field: keyof Variante, value: any) => {
    setVariantes((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [field]: value } : v))
    );
  };

  const handleSave = async () => {
    if (variantes.length === 0) {
      toast.error("No hay variantes para guardar");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/productos/${productoId}/variantes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantes }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al guardar variantes");
      }

      const { data } = await res.json();
      setVariantes(data);
      toast.success(`${data.length} variantes guardadas`);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const totalStock = variantes.reduce(
    (sum, v) => sum + (v.activo ? v.stock_actual : 0),
    0
  );

  useEffect(() => {
    onStockChange?.(totalStock);
  }, [totalStock, onStockChange]);

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

      {/* Add custom eje */}
      <div className="flex gap-2">
        <Input
          value={newEjeName}
          onChange={(e) => setNewEjeName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEje())}
          placeholder="Nuevo eje (ej: Color, Material...)"
          className="h-8 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addEje}
          disabled={!newEjeName.trim()}
          className="h-8 shrink-0"
        >
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
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="size-3" />
              </button>
            </div>

            {/* Value chips */}
            <div className="flex flex-wrap gap-1.5">
              {eje.valores.map((val) => (
                <motion.button
                  key={val}
                  type="button"
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={springBouncy}
                  onClick={() => toggleValue(ejeIndex, val)}
                  className="group inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  {val}
                  <X className="size-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </motion.button>
              ))}
            </div>

            {/* Add value */}
            <div className="flex gap-1.5">
              <Input
                value={newValueInputs[ejeIndex] || ""}
                onChange={(e) =>
                  setNewValueInputs((prev) => ({
                    ...prev,
                    [ejeIndex]: e.target.value,
                  }))
                }
                onKeyDown={(e) =>
                  e.key === "Enter" && (e.preventDefault(), addCustomValue(ejeIndex))
                }
                placeholder={`Agregar ${eje.nombre.toLowerCase()}...`}
                className="h-7 text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => addCustomValue(ejeIndex)}
                className="h-7 px-2 shrink-0"
              >
                <Plus className="size-3" />
              </Button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Generated variants table */}
      {variantes.length > 0 && (
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={springSmooth}
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-semibold">
                {variantes.length} variante{variantes.length !== 1 ? "s" : ""}
              </Label>
              <Badge variant="outline" className="text-[10px] h-4">
                Stock total: {totalStock}
              </Badge>
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto rounded-xl border border-border/50">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Variante</th>
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground w-24">SKU</th>
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground w-20">Stock</th>
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground w-24">Precio</th>
                  <th className="text-center py-2 px-2 font-medium text-muted-foreground w-12">Act.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                <AnimatePresence>
                  {variantes.map((v, index) => (
                    <motion.tr
                      key={`var-${v.id || comboName(v.atributos)}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={v.activo ? "" : "opacity-50"}
                    >
                      <td className="py-1.5 px-3">
                        <span className="font-medium">{v.nombre || comboName(v.atributos)}</span>
                      </td>
                      <td className="py-1.5 px-2">
                        <Input
                          value={v.sku || ""}
                          onChange={(e) => updateVariante(index, "sku", e.target.value || null)}
                          className="h-6 text-[11px] font-mono px-1.5"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <Input
                          type="number"
                          min="0"
                          value={v.stock_actual}
                          onChange={(e) =>
                            updateVariante(index, "stock_actual", parseInt(e.target.value) || 0)
                          }
                          className="h-6 text-[11px] px-1.5"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={v.precio_override ?? ""}
                          onChange={(e) =>
                            updateVariante(
                              index,
                              "precio_override",
                              e.target.value ? parseFloat(e.target.value) : null
                            )
                          }
                          placeholder="Base"
                          className="h-6 text-[11px] px-1.5"
                        />
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <Switch
                          checked={v.activo}
                          onCheckedChange={(val) => updateVariante(index, "activo", val)}
                          className="scale-75"
                        />
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                ) : (
                  <Save className="size-3.5 mr-1.5" />
                )}
                Guardar variantes
              </Button>
            </motion.div>
          </div>
        </motion.div>
      )}

      {ejes.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-3">
          Agregá ejes (talle, color, etc.) para generar variantes
        </p>
      )}
    </div>
  );
}
