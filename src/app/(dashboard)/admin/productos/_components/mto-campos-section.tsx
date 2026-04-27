"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  Type,
  Hash,
  ListChecks,
  Ruler,
  ChevronDown,
  ChevronRight,
  Crown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { springSmooth, springBouncy } from "@/lib/motion";
import type { MtoCampo, MtoCampoOpcion, MtoFieldType } from "@/types/mto";
import { TALLES_PRESET } from "@/types/mto";

const TIPO_ICON: Record<MtoFieldType, React.ElementType> = {
  texto: Type,
  numero: Hash,
  select: ListChecks,
  talle: Ruler,
};

const TIPO_LABEL: Record<MtoFieldType, string> = {
  texto: "Texto corto",
  numero: "Número",
  select: "Selección",
  talle: "Talle",
};

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "")
    .slice(0, 60);
}

interface Props {
  value: MtoCampo[];
  onChange: (campos: MtoCampo[]) => void;
}

export function MtoCamposSection({ value, onChange }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addCampo = () => {
    const nuevo: MtoCampo = {
      id: uuid(),
      key: `campo_${value.length + 1}`,
      label: "",
      tipo: "texto",
      requerido: true,
    };
    onChange([...value, nuevo]);
    setExpanded((prev) => new Set(prev).add(nuevo.id));
  };

  const removeCampo = (id: string) => {
    onChange(value.filter((c) => c.id !== id));
  };

  const updateCampo = (id: string, patch: Partial<MtoCampo>) => {
    onChange(
      value.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, ...patch };
        // Si cambia el tipo, limpiar campos no aplicables y precargar opciones de talle
        if (patch.tipo && patch.tipo !== c.tipo) {
          delete next.max_length;
          delete next.min;
          delete next.max;
          if (patch.tipo === "talle" && (!next.opciones || next.opciones.length === 0)) {
            next.opciones = [...TALLES_PRESET];
          } else if (patch.tipo === "select" && !next.opciones) {
            next.opciones = [];
          } else if (patch.tipo !== "select" && patch.tipo !== "talle") {
            delete next.opciones;
          }
        }
        return next;
      })
    );
  };

  const updateOpciones = (id: string, opciones: MtoCampoOpcion[]) => {
    onChange(value.map((c) => (c.id === id ? { ...c, opciones } : c)));
  };

  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {value.map((campo) => {
          const Icon = TIPO_ICON[campo.tipo];
          const isExpanded = expanded.has(campo.id);
          const isSelectLike = campo.tipo === "select" || campo.tipo === "talle";

          return (
            <motion.div
              key={campo.id}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
              transition={springSmooth}
              className="rounded-xl border border-border/50 bg-card overflow-hidden"
            >
              {/* Header row */}
              <div className="flex items-center gap-2 p-3">
                <button
                  type="button"
                  onClick={() => toggleExpand(campo.id)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                </button>
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="size-3.5" />
                </div>
                <Input
                  value={campo.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    const patch: Partial<MtoCampo> = { label };
                    if (!campo.label || campo.key === slugify(campo.label)) {
                      patch.key = slugify(label) || `campo_${value.indexOf(campo) + 1}`;
                    }
                    updateCampo(campo.id, patch);
                  }}
                  placeholder="Etiqueta visible (ej: Nombre del jugador)"
                  className="h-8 text-sm"
                />
                <Select
                  value={campo.tipo}
                  onValueChange={(v) => updateCampo(campo.id, { tipo: v as MtoFieldType })}
                >
                  <SelectTrigger className="h-8 w-[130px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIPO_LABEL) as MtoFieldType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIPO_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => removeCampo(campo.id)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>

              {/* Expanded body */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-t border-border/40 bg-muted/20"
                  >
                    <div className="p-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Key (interno)</Label>
                          <Input
                            value={campo.key}
                            onChange={(e) =>
                              updateCampo(campo.id, { key: slugify(e.target.value) })
                            }
                            placeholder="nombre_jugador"
                            className="mt-1 h-8 text-xs font-mono"
                          />
                        </div>
                        {!isSelectLike && (
                          <div>
                            <Label className="text-[11px] text-muted-foreground">
                              Sobrecargo $
                            </Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={campo.precio_extra ?? ""}
                              onChange={(e) =>
                                updateCampo(campo.id, {
                                  precio_extra: e.target.value
                                    ? parseFloat(e.target.value)
                                    : undefined,
                                })
                              }
                              placeholder="0"
                              className="mt-1 h-8 text-xs"
                            />
                          </div>
                        )}
                      </div>

                      {campo.tipo === "texto" && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-[11px] text-muted-foreground">
                              Placeholder
                            </Label>
                            <Input
                              value={campo.placeholder ?? ""}
                              onChange={(e) =>
                                updateCampo(campo.id, {
                                  placeholder: e.target.value || undefined,
                                })
                              }
                              placeholder="Ej: Juan"
                              className="mt-1 h-8 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-[11px] text-muted-foreground">
                              Máx. caracteres
                            </Label>
                            <Input
                              type="number"
                              min="1"
                              value={campo.max_length ?? ""}
                              onChange={(e) =>
                                updateCampo(campo.id, {
                                  max_length: e.target.value
                                    ? parseInt(e.target.value)
                                    : undefined,
                                })
                              }
                              placeholder="20"
                              className="mt-1 h-8 text-xs"
                            />
                          </div>
                        </div>
                      )}

                      {campo.tipo === "numero" && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-[11px] text-muted-foreground">Mínimo</Label>
                            <Input
                              type="number"
                              value={campo.min ?? ""}
                              onChange={(e) =>
                                updateCampo(campo.id, {
                                  min: e.target.value ? parseFloat(e.target.value) : undefined,
                                })
                              }
                              placeholder="0"
                              className="mt-1 h-8 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-[11px] text-muted-foreground">Máximo</Label>
                            <Input
                              type="number"
                              value={campo.max ?? ""}
                              onChange={(e) =>
                                updateCampo(campo.id, {
                                  max: e.target.value ? parseFloat(e.target.value) : undefined,
                                })
                              }
                              placeholder="99"
                              className="mt-1 h-8 text-xs"
                            />
                          </div>
                        </div>
                      )}

                      {isSelectLike && (
                        <OpcionesEditor
                          opciones={campo.opciones ?? []}
                          onChange={(o) => updateOpciones(campo.id, o)}
                        />
                      )}

                      {/* Toggles */}
                      <div className="flex flex-wrap gap-3 pt-1">
                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                          <Switch
                            checked={campo.requerido}
                            onCheckedChange={(v) =>
                              updateCampo(campo.id, { requerido: v })
                            }
                            className="scale-75"
                          />
                          Requerido
                        </label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                          <Switch
                            checked={!!campo.solo_socios}
                            onCheckedChange={(v) =>
                              updateCampo(campo.id, { solo_socios: v || undefined })
                            }
                            className="scale-75"
                          />
                          <span className="flex items-center gap-1">
                            <Crown className="size-3 text-amber-500" />
                            Solo socios
                          </span>
                        </label>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </AnimatePresence>

      <motion.button
        type="button"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={addCampo}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
      >
        <Plus className="size-3" />
        Agregar campo personalizable
      </motion.button>

      {value.length === 0 && (
        <p className="text-center text-[11px] text-muted-foreground">
          Sin campos — el cliente no podrá personalizar nada
        </p>
      )}
    </div>
  );
}

function OpcionesEditor({
  opciones,
  onChange,
}: {
  opciones: MtoCampoOpcion[];
  onChange: (o: MtoCampoOpcion[]) => void;
}) {
  const addOpcion = () => {
    onChange([...opciones, { valor: "", label: "" }]);
  };
  const updateOpcion = (i: number, patch: Partial<MtoCampoOpcion>) => {
    onChange(opciones.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  };
  const removeOpcion = (i: number) => {
    onChange(opciones.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-muted-foreground">Opciones</Label>
      <div className="space-y-1.5">
        <AnimatePresence mode="popLayout">
          {opciones.map((opcion, i) => (
            <motion.div
              key={i}
              layout
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4, transition: { duration: 0.12 } }}
              transition={springBouncy}
              className="flex items-center gap-1.5"
            >
              <Input
                value={opcion.valor}
                onChange={(e) => {
                  const valor = e.target.value;
                  updateOpcion(i, {
                    valor,
                    label: opcion.label || valor,
                  });
                }}
                placeholder="Valor"
                className="h-7 text-xs"
              />
              <Input
                value={opcion.label}
                onChange={(e) => updateOpcion(i, { label: e.target.value })}
                placeholder="Etiqueta"
                className="h-7 text-xs"
              />
              <div className="relative w-20 shrink-0">
                <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                  $
                </span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={opcion.precio_extra ?? ""}
                  onChange={(e) =>
                    updateOpcion(i, {
                      precio_extra: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    })
                  }
                  placeholder="0"
                  className="h-7 pl-4 text-xs"
                />
              </div>
              <button
                type="button"
                onClick={() => updateOpcion(i, { solo_socios: !opcion.solo_socios })}
                className={`flex size-7 shrink-0 items-center justify-center rounded-md transition-colors ${
                  opcion.solo_socios
                    ? "bg-amber-100 text-amber-600"
                    : "text-muted-foreground hover:bg-muted"
                }`}
                title={opcion.solo_socios ? "Solo socios" : "Para todos"}
              >
                <Crown className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => removeOpcion(i)}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="size-3" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <button
        type="button"
        onClick={addOpcion}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
      >
        <Plus className="size-2.5" />
        Agregar opción
      </button>
    </div>
  );
}
