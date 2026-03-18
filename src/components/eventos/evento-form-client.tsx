"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Save,
  CalendarDays,
  MapPin,
  Settings2,
  Ticket,
  FileText,
  Image as ImageIcon,
  Clock,
  Users,
  Tag,
  GripVertical,
  Copy,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  fadeInUp,
  staggerContainer,
  staggerContainerFast,
  springSmooth,
  easeSnappy,
} from "@/lib/motion";
import { toast } from "sonner";

/* ─── Types ─── */

interface TipoEnLoteForm {
  nombre: string;
  precio: number;
  cantidad: number;
  solo_socios: boolean;
}

interface LoteForm {
  id?: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  tipos: TipoEnLoteForm[];
  expanded: boolean;
}

interface EventoFormData {
  titulo: string;
  slug: string;
  descripcion: string;
  descripcion_corta: string;
  imagen_url: string;
  lugar: string;
  direccion: string;
  fecha_inicio: string;
  fecha_fin: string;
  capacidad_total: number | null;
  es_gratuito: boolean;
  requiere_registro: boolean;
  estado: string;
}

type Section = "info" | "fecha" | "config" | "entradas";

const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "info", label: "Información", icon: FileText },
  { id: "fecha", label: "Fecha y lugar", icon: CalendarDays },
  { id: "config", label: "Configuración", icon: Settings2 },
  { id: "entradas", label: "Entradas", icon: Ticket },
];

const ESTADO_CONFIG: Record<string, { label: string; color: string }> = {
  borrador: { label: "Borrador", color: "bg-gray-100 text-gray-700" },
  publicado: { label: "Publicado", color: "bg-emerald-50 text-emerald-700" },
  finalizado: { label: "Finalizado", color: "bg-blue-50 text-blue-700" },
  cancelado: { label: "Cancelado", color: "bg-red-50 text-red-700" },
};

/* ─── Helpers ─── */

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseNum(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-UY", { day: "2-digit", month: "short" });
}

/* ─── Section Card ─── */

function SectionCard({
  id,
  icon: Icon,
  title,
  description,
  children,
  activeSection,
  onFocus,
}: {
  id: Section;
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
  activeSection: Section;
  onFocus: (s: Section) => void;
}) {
  const isActive = activeSection === id;

  return (
    <motion.div
      variants={fadeInUp}
      id={`section-${id}`}
      onMouseEnter={() => onFocus(id)}
      className={`rounded-2xl border bg-white p-6 transition-all duration-300 ${
        isActive
          ? "border-primary/20 shadow-md shadow-primary/5 ring-1 ring-primary/10"
          : "border-linea hover:border-linea/80"
      }`}
    >
      <div className="flex items-start gap-3 mb-5">
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-300 ${
            isActive
              ? "bg-primary/10 text-primary"
              : "bg-gray-100 text-muted-foreground"
          }`}
        >
          <Icon className="size-4.5" />
        </div>
        <div>
          <h2 className="font-heading text-base font-bold text-foreground">
            {title}
          </h2>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {description}
            </p>
          )}
        </div>
      </div>
      {children}
    </motion.div>
  );
}

/* ─── Lote Card ─── */

function LoteCard({
  lote,
  index,
  onUpdate,
  onRemove,
  onDuplicate,
  onToggle,
  onUpdateTipo,
  onAddTipo,
  onRemoveTipo,
}: {
  lote: LoteForm;
  index: number;
  onUpdate: (field: string, value: any) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onToggle: () => void;
  onUpdateTipo: (tipoIndex: number, field: string, value: any) => void;
  onAddTipo: () => void;
  onRemoveTipo: (tipoIndex: number) => void;
}) {
  const dateRange =
    lote.fecha_inicio || lote.fecha_fin
      ? `${formatDateShort(lote.fecha_inicio)} → ${formatDateShort(lote.fecha_fin)}`
      : "Sin fechas";

  const totalTipos = lote.tipos.length;
  const totalCantidad = lote.tipos.reduce((s, t) => s + t.cantidad, 0);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={springSmooth}
      className="rounded-xl border border-linea bg-gray-50/50 overflow-hidden"
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <GripVertical className="size-4 text-muted-foreground/40 shrink-0" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-heading font-bold text-sm text-foreground truncate">
              {lote.nombre || "Nuevo lote"}
            </span>
            {lote.fecha_inicio && (
              <span className="hidden sm:inline-flex text-xs text-muted-foreground bg-white border border-linea rounded-md px-2 py-0.5 shrink-0">
                <Clock className="size-3 mr-1" />
                {dateRange}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {totalTipos > 0 && (
            <span className="text-xs text-muted-foreground bg-white border border-linea rounded-md px-2 py-0.5">
              {totalTipos} tipo{totalTipos !== 1 ? "s" : ""} · {totalCantidad}{" "}
              uds
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-red-500"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
          <motion.div
            animate={{ rotate: lote.expanded ? 180 : 0 }}
            transition={easeSnappy}
          >
            <ChevronDown className="size-4 text-muted-foreground" />
          </motion.div>
        </div>
      </div>

      {/* Body */}
      <AnimatePresence initial={false}>
        {lote.expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ ...springSmooth, opacity: { duration: 0.2 } }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4">
              <Separator />

              {/* Lote info */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5">
                    Nombre del lote *
                  </Label>
                  <Input
                    value={lote.nombre}
                    onChange={(e) => onUpdate("nombre", e.target.value)}
                    placeholder="Ej: Early Bird, Preventa, Puerta..."
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5">
                    Activo desde *
                  </Label>
                  <Input
                    type="datetime-local"
                    value={lote.fecha_inicio}
                    onChange={(e) => onUpdate("fecha_inicio", e.target.value)}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5">
                    Activo hasta *
                  </Label>
                  <Input
                    type="datetime-local"
                    value={lote.fecha_fin}
                    onChange={(e) => onUpdate("fecha_fin", e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>

              {/* Tipos de entrada dentro del lote */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Tag className="size-3.5 text-muted-foreground" />
                    <span className="text-xs font-heading font-bold text-foreground uppercase tracking-wide">
                      Tipos de entrada en este lote
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onAddTipo}
                    className="h-7 text-xs gap-1"
                  >
                    <Plus className="size-3" />
                    Tipo
                  </Button>
                </div>

                <AnimatePresence>
                  {lote.tipos.length === 0 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="rounded-lg border border-dashed border-linea bg-white p-4 text-center"
                    >
                      <Ticket className="size-5 text-muted-foreground/40 mx-auto mb-1.5" />
                      <p className="text-xs text-muted-foreground">
                        Agregá al menos un tipo de entrada para este lote
                      </p>
                    </motion.div>
                  )}

                  <div className="space-y-2">
                    {lote.tipos.map((tipo, tipoIndex) => (
                      <motion.div
                        key={tipoIndex}
                        layout
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 12 }}
                        transition={easeSnappy}
                        className="group rounded-lg border border-linea bg-white p-3"
                      >
                        <div className="grid gap-2 sm:grid-cols-[1fr_100px_100px_auto_auto] items-end">
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              Nombre
                            </Label>
                            <Input
                              value={tipo.nombre}
                              onChange={(e) =>
                                onUpdateTipo(
                                  tipoIndex,
                                  "nombre",
                                  e.target.value
                                )
                              }
                              placeholder="General, VIP, Socio..."
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              Precio
                            </Label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                $
                              </span>
                              <Input
                                type="number"
                                min={0}
                                value={tipo.precio || ""}
                                onChange={(e) =>
                                  onUpdateTipo(
                                    tipoIndex,
                                    "precio",
                                    parseNum(e.target.value)
                                  )
                                }
                                placeholder="0"
                                className="h-8 text-sm pl-6"
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              Cantidad
                            </Label>
                            <Input
                              type="number"
                              min={0}
                              value={tipo.cantidad || ""}
                              onChange={(e) =>
                                onUpdateTipo(
                                  tipoIndex,
                                  "cantidad",
                                  parseNum(e.target.value)
                                )
                              }
                              placeholder="0"
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="flex items-center gap-1.5 pb-0.5">
                            <Switch
                              checked={tipo.solo_socios}
                              onCheckedChange={(v) =>
                                onUpdateTipo(tipoIndex, "solo_socios", v)
                              }
                              className="scale-[0.85]"
                            />
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">
                              Solo socios
                            </Label>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => onRemoveTipo(tipoIndex)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Main Form ─── */

export function EventoFormClient({ eventoId }: { eventoId?: number }) {
  const router = useRouter();
  const isEditing = !!eventoId;
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [autoSlug, setAutoSlug] = useState(!isEditing);
  const [activeSection, setActiveSection] = useState<Section>("info");

  const [form, setForm] = useState<EventoFormData>({
    titulo: "",
    slug: "",
    descripcion: "",
    descripcion_corta: "",
    imagen_url: "",
    lugar: "",
    direccion: "",
    fecha_inicio: "",
    fecha_fin: "",
    capacidad_total: null,
    es_gratuito: false,
    requiere_registro: true,
    estado: "borrador",
  });

  const [lotes, setLotes] = useState<LoteForm[]>([]);

  /* ─── Load existing event ─── */
  useEffect(() => {
    if (!eventoId) return;

    async function fetchEvento() {
      try {
        const res = await fetch(`/api/admin/eventos/${eventoId}`);
        if (!res.ok) throw new Error();
        const data = await res.json();

        setForm({
          titulo: data.titulo || "",
          slug: data.slug || "",
          descripcion: data.descripcion || "",
          descripcion_corta: data.descripcion_corta || "",
          imagen_url: data.imagen_url || "",
          lugar: data.lugar || "",
          direccion: data.direccion || "",
          fecha_inicio: data.fecha_inicio
            ? new Date(data.fecha_inicio).toISOString().slice(0, 16)
            : "",
          fecha_fin: data.fecha_fin
            ? new Date(data.fecha_fin).toISOString().slice(0, 16)
            : "",
          capacidad_total: data.capacidad_total,
          es_gratuito: data.es_gratuito || false,
          requiere_registro: data.requiere_registro ?? true,
          estado: data.estado || "borrador",
        });

        // Convert tipo→lotes structure to lotes→tipos structure
        if (data.tipo_entradas) {
          const lotesMap = new Map<
            string,
            {
              nombre: string;
              fecha_inicio: string;
              fecha_fin: string;
              tipos: TipoEnLoteForm[];
            }
          >();

          for (const tipo of data.tipo_entradas) {
            for (const lote of tipo.lotes || []) {
              const key = lote.nombre || `lote-${lote.id}`;
              if (!lotesMap.has(key)) {
                lotesMap.set(key, {
                  nombre: lote.nombre || "",
                  fecha_inicio: lote.fecha_inicio
                    ? new Date(lote.fecha_inicio).toISOString().slice(0, 16)
                    : "",
                  fecha_fin: lote.fecha_fin
                    ? new Date(lote.fecha_fin).toISOString().slice(0, 16)
                    : "",
                  tipos: [],
                });
              }
              lotesMap.get(key)!.tipos.push({
                nombre: tipo.nombre,
                precio: lote.precio ?? tipo.precio,
                cantidad: lote.cantidad,
                solo_socios: tipo.solo_socios,
              });
            }
          }

          // If there are tipos without lotes, create a default lote
          const tiposSinLote = data.tipo_entradas.filter(
            (t: any) => !t.lotes || t.lotes.length === 0
          );
          if (tiposSinLote.length > 0 && lotesMap.size === 0) {
            lotesMap.set("default", {
              nombre: "Venta General",
              fecha_inicio: data.fecha_inicio
                ? new Date(data.fecha_inicio).toISOString().slice(0, 16)
                : "",
              fecha_fin: data.fecha_fin
                ? new Date(data.fecha_fin).toISOString().slice(0, 16)
                : "",
              tipos: tiposSinLote.map((t: any) => ({
                nombre: t.nombre,
                precio: t.precio,
                cantidad: t.capacidad || 0,
                solo_socios: t.solo_socios,
              })),
            });
          }

          setLotes(
            Array.from(lotesMap.values()).map((l) => ({
              ...l,
              expanded: true,
            }))
          );
        }
      } catch {
        toast.error("Error al cargar el evento");
      } finally {
        setLoading(false);
      }
    }
    fetchEvento();
  }, [eventoId]);

  /* ─── Auto slug ─── */
  useEffect(() => {
    if (autoSlug && form.titulo) {
      setForm((prev) => ({ ...prev, slug: slugify(prev.titulo) }));
    }
  }, [form.titulo, autoSlug]);

  const updateForm = (field: keyof EventoFormData, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  /* ─── Lote helpers ─── */
  const addLote = useCallback(() => {
    setLotes((prev) => [
      ...prev,
      {
        nombre: "",
        fecha_inicio: "",
        fecha_fin: "",
        tipos: [],
        expanded: true,
      },
    ]);
  }, []);

  const updateLote = useCallback(
    (index: number, field: string, value: any) => {
      setLotes((prev) =>
        prev.map((l, i) => (i === index ? { ...l, [field]: value } : l))
      );
    },
    []
  );

  const removeLote = useCallback((index: number) => {
    setLotes((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const duplicateLote = useCallback((index: number) => {
    setLotes((prev) => {
      const source = prev[index];
      const clone: LoteForm = {
        nombre: `${source.nombre} (copia)`,
        fecha_inicio: source.fecha_inicio,
        fecha_fin: source.fecha_fin,
        tipos: source.tipos.map((t) => ({ ...t })),
        expanded: true,
      };
      const next = [...prev];
      next.splice(index + 1, 0, clone);
      return next;
    });
  }, []);

  const toggleLote = useCallback((index: number) => {
    setLotes((prev) =>
      prev.map((l, i) =>
        i === index ? { ...l, expanded: !l.expanded } : l
      )
    );
  }, []);

  /* ─── Tipo inside lote helpers ─── */
  const addTipoInLote = useCallback((loteIndex: number) => {
    setLotes((prev) =>
      prev.map((l, i) =>
        i === loteIndex
          ? {
              ...l,
              tipos: [
                ...l.tipos,
                { nombre: "", precio: 0, cantidad: 0, solo_socios: false },
              ],
            }
          : l
      )
    );
  }, []);

  const updateTipoInLote = useCallback(
    (loteIndex: number, tipoIndex: number, field: string, value: any) => {
      setLotes((prev) =>
        prev.map((l, i) =>
          i === loteIndex
            ? {
                ...l,
                tipos: l.tipos.map((t, j) =>
                  j === tipoIndex ? { ...t, [field]: value } : t
                ),
              }
            : l
        )
      );
    },
    []
  );

  const removeTipoInLote = useCallback(
    (loteIndex: number, tipoIndex: number) => {
      setLotes((prev) =>
        prev.map((l, i) =>
          i === loteIndex
            ? { ...l, tipos: l.tipos.filter((_, j) => j !== tipoIndex) }
            : l
        )
      );
    },
    []
  );

  /* ─── Save ─── */
  const handleSave = async () => {
    // Validate required fields
    if (!form.titulo || !form.slug || !form.fecha_inicio || !form.lugar) {
      toast.error(
        "Completá los campos obligatorios (título, slug, fecha, lugar)"
      );
      return;
    }

    // Validate lotes
    if (lotes.length > 0) {
      for (const lote of lotes) {
        if (!lote.nombre) {
          toast.error("Todos los lotes necesitan un nombre");
          return;
        }
        if (!lote.fecha_inicio || !lote.fecha_fin) {
          toast.error(`El lote "${lote.nombre}" necesita fecha de inicio y fin`);
          return;
        }
        if (lote.tipos.length === 0) {
          toast.error(
            `El lote "${lote.nombre}" necesita al menos un tipo de entrada`
          );
          return;
        }
        for (const tipo of lote.tipos) {
          if (!tipo.nombre) {
            toast.error(
              `Todos los tipos de entrada en "${lote.nombre}" necesitan nombre`
            );
            return;
          }
          if (!tipo.cantidad || tipo.cantidad <= 0) {
            toast.error(
              `El tipo "${tipo.nombre}" en "${lote.nombre}" necesita una cantidad mayor a 0`
            );
            return;
          }
        }
      }
    }

    setSaving(true);
    try {
      // 1. Save event
      const eventoPayload = {
        ...form,
        imagen_url: form.imagen_url || undefined,
        fecha_inicio: new Date(form.fecha_inicio).toISOString(),
        ...(form.fecha_fin
          ? { fecha_fin: new Date(form.fecha_fin).toISOString() }
          : {}),
      };

      let savedEventoId = eventoId;

      if (isEditing) {
        const res = await fetch(`/api/admin/eventos/${eventoId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(eventoPayload),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Error al actualizar");
        }
      } else {
        const res = await fetch("/api/admin/eventos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(eventoPayload),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Error al crear");
        }
        const data = await res.json();
        savedEventoId = data.id;
      }

      // 2. If editing, delete existing tipos first (they'll be recreated)
      if (isEditing) {
        const delRes = await fetch(`/api/admin/eventos/${savedEventoId}/tipos-entrada`, {
          method: "DELETE",
        });
        if (!delRes.ok) {
          const delErr = await delRes.json().catch(() => ({}));
          throw new Error(delErr.error || "Error al eliminar tipos de entrada existentes");
        }
      }

      // 3. Convert lotes→tipos back to tipos→lotes for the API
      // Collect unique tipo names and build their lotes
      if (lotes.length > 0) {
        const tiposMap = new Map<
          string,
          {
            nombre: string;
            solo_socios: boolean;
            precio: number;
            lotes: {
              nombre: string;
              precio: number;
              cantidad: number;
              fecha_inicio: string;
              fecha_fin: string | null;
              estado: string;
              orden: number;
            }[];
          }
        >();

        for (const [loteOrder, lote] of lotes.entries()) {
          for (const tipo of lote.tipos) {
            if (!tiposMap.has(tipo.nombre)) {
              tiposMap.set(tipo.nombre, {
                nombre: tipo.nombre,
                solo_socios: tipo.solo_socios,
                precio: tipo.precio,
                lotes: [],
              });
            }
            tiposMap.get(tipo.nombre)!.lotes.push({
              nombre: lote.nombre,
              precio: tipo.precio,
              cantidad: tipo.cantidad,
              fecha_inicio: lote.fecha_inicio
                ? new Date(lote.fecha_inicio).toISOString()
                : "",
              fecha_fin: lote.fecha_fin
                ? new Date(lote.fecha_fin).toISOString()
                : null,
              estado:
                new Date(lote.fecha_inicio) <= new Date() &&
                new Date(lote.fecha_fin) >= new Date()
                  ? "activo"
                  : new Date(lote.fecha_inicio) > new Date()
                    ? "pendiente"
                    : "cerrado",
              orden: loteOrder,
            });
          }
        }

        // Save each tipo with its lotes
        let tipoOrden = 0;
        for (const tipo of tiposMap.values()) {
          const tipoRes = await fetch(`/api/admin/eventos/${savedEventoId}/tipos-entrada`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nombre: tipo.nombre,
              precio: tipo.precio,
              solo_socios: tipo.solo_socios,
              orden: tipoOrden++,
              lotes: tipo.lotes,
            }),
          });
          if (!tipoRes.ok) {
            const tipoErr = await tipoRes.json().catch(() => ({}));
            throw new Error(tipoErr.error || `Error al guardar tipo "${tipo.nombre}"`);
          }
        }
      }

      toast.success(isEditing ? "Evento actualizado" : "Evento creado");
      router.push("/eventos/admin");
    } catch (err: any) {
      toast.error(err.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  /* ─── Scroll spy ─── */
  const scrollToSection = (id: Section) => {
    setActiveSection(id);
    document
      .getElementById(`section-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* ─── Stats ─── */
  const totalEntradas = lotes.reduce(
    (sum, l) => sum + l.tipos.reduce((s, t) => s + t.cantidad, 0),
    0
  );
  const totalTipos = new Set(lotes.flatMap((l) => l.tipos.map((t) => t.nombre))).size;

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px] w-full rounded-2xl" />
        <Skeleton className="h-[160px] w-full rounded-2xl" />
        <Skeleton className="h-[160px] w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="relative"
    >
      {/* Back + title + status */}
      <motion.div variants={fadeInUp} className="mb-6">
        <Link
          href="/eventos/admin"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
          Eventos
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-foreground">
            {isEditing ? "Editar evento" : "Nuevo evento"}
          </h1>
          {form.estado && (
            <motion.span
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTADO_CONFIG[form.estado]?.color || ""}`}
            >
              {ESTADO_CONFIG[form.estado]?.label || form.estado}
            </motion.span>
          )}
        </div>
      </motion.div>

      {/* Section navigation (sticky on desktop) */}
      <motion.div
        variants={fadeInUp}
        className="mb-6 sticky top-0 z-10 -mx-4 px-4 py-2 bg-gradient-to-b from-fondo via-fondo to-fondo/0"
      >
        <nav className="flex gap-1 rounded-xl bg-white/80 backdrop-blur-sm border border-linea p-1">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => scrollToSection(id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                activeSection === id
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-gray-50"
              }`}
            >
              <Icon className="size-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>
      </motion.div>

      <div className="space-y-5">
        {/* ─── Información general ─── */}
        <SectionCard
          id="info"
          icon={FileText}
          title="Información general"
          description="Nombre, descripción e imagen del evento"
          activeSection={activeSection}
          onFocus={setActiveSection}
        >
          <div className="space-y-4">
            <div>
              <Label htmlFor="titulo" className="text-sm font-medium">
                Título *
              </Label>
              <Input
                id="titulo"
                value={form.titulo}
                onChange={(e) => updateForm("titulo", e.target.value)}
                placeholder="Nombre del evento"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="slug" className="text-sm font-medium">
                URL del evento
              </Label>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-sm text-muted-foreground shrink-0">
                  /eventos/
                </span>
                <Input
                  id="slug"
                  value={form.slug}
                  onChange={(e) => {
                    setAutoSlug(false);
                    updateForm("slug", e.target.value);
                  }}
                  placeholder="url-del-evento"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="descripcion_corta" className="text-sm font-medium">
                Descripción corta
              </Label>
              <Input
                id="descripcion_corta"
                value={form.descripcion_corta}
                onChange={(e) =>
                  updateForm("descripcion_corta", e.target.value)
                }
                placeholder="Breve descripción (max 300 caracteres)"
                maxLength={300}
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1 text-right">
                {form.descripcion_corta.length}/300
              </p>
            </div>

            <div>
              <Label htmlFor="descripcion" className="text-sm font-medium">
                Descripción completa
              </Label>
              <Textarea
                id="descripcion"
                value={form.descripcion}
                onChange={(e) => updateForm("descripcion", e.target.value)}
                placeholder="Descripción completa del evento..."
                rows={4}
                className="mt-1.5 resize-none"
              />
            </div>

            <div>
              <Label htmlFor="imagen_url" className="text-sm font-medium">
                Imagen
              </Label>
              <div className="mt-1.5 flex gap-3">
                <div className="relative flex-1">
                  <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="imagen_url"
                    value={form.imagen_url}
                    onChange={(e) => updateForm("imagen_url", e.target.value)}
                    placeholder="https://..."
                    className="pl-10"
                  />
                </div>
                {form.imagen_url && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="size-10 rounded-lg border border-linea overflow-hidden shrink-0"
                  >
                    <img
                      src={form.imagen_url}
                      alt=""
                      className="size-full object-cover"
                      onError={(e) =>
                        ((e.target as HTMLImageElement).style.display = "none")
                      }
                    />
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ─── Fecha y lugar ─── */}
        <SectionCard
          id="fecha"
          icon={CalendarDays}
          title="Fecha y lugar"
          description="Cuándo y dónde se realiza el evento"
          activeSection={activeSection}
          onFocus={setActiveSection}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="fecha_inicio" className="text-sm font-medium">
                Inicio del evento *
              </Label>
              <Input
                id="fecha_inicio"
                type="datetime-local"
                value={form.fecha_inicio}
                onChange={(e) => updateForm("fecha_inicio", e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="fecha_fin" className="text-sm font-medium">
                Fin del evento
              </Label>
              <Input
                id="fecha_fin"
                type="datetime-local"
                value={form.fecha_fin}
                onChange={(e) => updateForm("fecha_fin", e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="lugar" className="text-sm font-medium">
                Lugar *
              </Label>
              <div className="mt-1.5 relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="lugar"
                  value={form.lugar}
                  onChange={(e) => updateForm("lugar", e.target.value)}
                  placeholder="Parque CUPRA"
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="direccion" className="text-sm font-medium">
                Dirección
              </Label>
              <Input
                id="direccion"
                value={form.direccion}
                onChange={(e) => updateForm("direccion", e.target.value)}
                placeholder="Av. ..."
                className="mt-1.5"
              />
            </div>
          </div>
        </SectionCard>

        {/* ─── Configuración ─── */}
        <SectionCard
          id="config"
          icon={Settings2}
          title="Configuración"
          description="Capacidad, estado y opciones del evento"
          activeSection={activeSection}
          onFocus={setActiveSection}
        >
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="capacidad_total" className="text-sm font-medium">
                  Capacidad total
                </Label>
                <div className="mt-1.5 relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="capacidad_total"
                    type="number"
                    value={form.capacidad_total || ""}
                    onChange={(e) =>
                      updateForm(
                        "capacidad_total",
                        e.target.value ? parseNum(e.target.value) : null
                      )
                    }
                    placeholder="Sin límite"
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Estado</Label>
                <Select
                  value={form.estado}
                  onValueChange={(v) => updateForm("estado", v)}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ESTADO_CONFIG).map(([value, { label }]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="flex flex-wrap gap-x-8 gap-y-4">
              <label className="flex items-center gap-3 cursor-pointer group">
                <Switch
                  id="es_gratuito"
                  checked={form.es_gratuito}
                  onCheckedChange={(v) => updateForm("es_gratuito", v)}
                />
                <div>
                  <span className="text-sm font-medium text-foreground block">
                    Evento gratuito
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Sin cobro de entradas
                  </span>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <Switch
                  id="requiere_registro"
                  checked={form.requiere_registro}
                  onCheckedChange={(v) => updateForm("requiere_registro", v)}
                />
                <div>
                  <span className="text-sm font-medium text-foreground block">
                    Requiere registro
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Los asistentes deben registrarse
                  </span>
                </div>
              </label>
            </div>
          </div>
        </SectionCard>

        {/* ─── Entradas: Lotes → Tipos ─── */}
        <SectionCard
          id="entradas"
          icon={Ticket}
          title="Entradas"
          description="Definí los lotes de venta y los tipos de entrada para cada uno"
          activeSection={activeSection}
          onFocus={setActiveSection}
        >
          <div className="space-y-4">
            {/* Quick stats */}
            {lotes.length > 0 && (
              <motion.div
                variants={staggerContainerFast}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-3 gap-3"
              >
                <motion.div
                  variants={fadeInUp}
                  className="rounded-lg bg-primary/5 border border-primary/10 px-3 py-2 text-center"
                >
                  <p className="text-lg font-display font-bold text-primary">
                    {lotes.length}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Lote{lotes.length !== 1 ? "s" : ""}
                  </p>
                </motion.div>
                <motion.div
                  variants={fadeInUp}
                  className="rounded-lg bg-secondary/20 border border-secondary/30 px-3 py-2 text-center"
                >
                  <p className="text-lg font-display font-bold text-amber-700">
                    {totalTipos}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tipo{totalTipos !== 1 ? "s" : ""}
                  </p>
                </motion.div>
                <motion.div
                  variants={fadeInUp}
                  className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-center"
                >
                  <p className="text-lg font-display font-bold text-emerald-700">
                    {totalEntradas}
                  </p>
                  <p className="text-xs text-muted-foreground">Entradas</p>
                </motion.div>
              </motion.div>
            )}

            {/* How it works hint */}
            {lotes.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-xl border border-dashed border-primary/20 bg-primary/[0.02] p-5 text-center"
              >
                <div className="mx-auto size-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Ticket className="size-5 text-primary" />
                </div>
                <h3 className="font-heading font-bold text-sm text-foreground mb-1">
                  Configurá las entradas del evento
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
                  Primero creá los <strong>lotes de venta</strong> (ej: Early
                  Bird, Preventa, Puerta) con sus fechas. Luego dentro de cada
                  lote, definí los <strong>tipos de entrada</strong> (ej:
                  General, VIP, Socio) con precio y cantidad.
                </p>
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mb-4">
                  <div className="flex items-center gap-1 bg-white rounded-md px-2 py-1 border border-linea">
                    <CalendarDays className="size-3" />
                    Lote
                  </div>
                  <span>→</span>
                  <div className="flex items-center gap-1 bg-white rounded-md px-2 py-1 border border-linea">
                    <Tag className="size-3" />
                    Tipos
                  </div>
                  <span>→</span>
                  <div className="flex items-center gap-1 bg-white rounded-md px-2 py-1 border border-linea">
                    <Ticket className="size-3" />
                    Entradas
                  </div>
                </div>
                <Button
                  onClick={addLote}
                  className="bg-primary hover:bg-bordo-900 text-white"
                >
                  <Plus className="mr-1.5 size-4" />
                  Crear primer lote
                </Button>
              </motion.div>
            )}

            {/* Lotes list */}
            <AnimatePresence>
              {lotes.map((lote, loteIndex) => (
                <LoteCard
                  key={loteIndex}
                  lote={lote}
                  index={loteIndex}
                  onUpdate={(field, value) =>
                    updateLote(loteIndex, field, value)
                  }
                  onRemove={() => removeLote(loteIndex)}
                  onDuplicate={() => duplicateLote(loteIndex)}
                  onToggle={() => toggleLote(loteIndex)}
                  onUpdateTipo={(tipoIndex, field, value) =>
                    updateTipoInLote(loteIndex, tipoIndex, field, value)
                  }
                  onAddTipo={() => addTipoInLote(loteIndex)}
                  onRemoveTipo={(tipoIndex) =>
                    removeTipoInLote(loteIndex, tipoIndex)
                  }
                />
              ))}
            </AnimatePresence>

            {/* Add lote button */}
            {lotes.length > 0 && (
              <motion.div layout>
                <Button
                  variant="outline"
                  onClick={addLote}
                  className="w-full border-dashed gap-2"
                >
                  <Plus className="size-4" />
                  Agregar lote de venta
                </Button>
              </motion.div>
            )}
          </div>
        </SectionCard>

        {/* ─── Actions ─── */}
        <motion.div
          variants={fadeInUp}
          className="flex items-center justify-between gap-3 pb-8 pt-2"
        >
          <Link
            href="/eventos/admin"
            className={buttonVariants({ variant: "outline" })}
          >
            Cancelar
          </Link>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-bordo-900 text-white min-w-[160px]"
          >
            {saving ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="size-4 border-2 border-white/30 border-t-white rounded-full mr-2"
              />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            {saving
              ? "Guardando..."
              : isEditing
                ? "Guardar cambios"
                : "Crear evento"}
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}
