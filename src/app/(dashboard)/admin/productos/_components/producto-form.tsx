"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import {
  Save,
  ArrowLeft,
  ImagePlus,
  X,
  Star,
  Upload,
  Package,
  DollarSign,
  Eye,
  Tag,
  Loader2,
  GripVertical,
  Trash2,
  Info,
  Check,
  AlertCircle,
  Truck,
  Plus,
  Layers,
  Crosshair,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { createBrowserClient } from "@/lib/supabase/client";
import { VariantesSection } from "./variantes-section";
import {
  fadeInUp,
  fadeInLeft,
  fadeInRight,
  scaleIn,
  staggerContainer,
  springSmooth,
  springBouncy,
} from "@/lib/motion";
import { toast } from "sonner";
import Link from "next/link";
import Image from "next/image";

// --- Schema ---

const UNIDADES = [
  { value: "un", label: "Unidad (un)" },
  { value: "kg", label: "Kilogramo (kg)" },
  { value: "lt", label: "Litro (lt)" },
  { value: "mt", label: "Metro (mt)" },
  { value: "par", label: "Par" },
  { value: "docena", label: "Docena" },
] as const;

const schema = z.object({
  nombre: z.string().min(1, "Nombre requerido").max(200),
  slug: z.string().min(1, "Slug requerido").max(200),
  descripcion: z.string().optional(),
  descripcion_corta: z.string().max(300).optional(),
  categoria_id: z.string().optional(),
  precio: z.string().min(1, "Precio requerido"),
  precio_socio: z.string().optional(),
  sku: z.string().max(50).optional(),
  stock_actual: z.string(),
  stock_minimo: z.string(),
  unidad: z.string().default("un"),
  activo: z.boolean(),
  destacado: z.boolean(),
});

type FormData = z.infer<typeof schema>;

interface Categoria {
  id: number;
  nombre: string;
  slug: string;
}

interface ProductoImagen {
  id: number;
  producto_id: number;
  url: string;
  alt_text: string | null;
  orden: number;
  es_principal: boolean;
  focal_point: string;
}

interface Proveedor {
  id: number;
  nombre: string;
}

interface ProductoProveedor {
  id?: number;
  proveedor_id: number;
  costo: number | null;
  codigo_proveedor: string | null;
  es_principal: boolean;
  proveedores?: { id: number; nombre: string };
}

interface Props {
  producto?: any;
}

function slugify(str: string) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// --- Section wrapper ---

function FormSection({
  icon: Icon,
  title,
  description,
  children,
  delay = 0,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      transition={{ ...springSmooth, delay }}
      className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden"
    >
      <div className="flex items-center gap-3 border-b border-border/40 bg-muted/30 px-5 py-3.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </motion.div>
  );
}

// --- Image upload component ---

function ImageUploader({
  productoId,
  imagenes: initialImagenes,
}: {
  productoId: number;
  imagenes: ProductoImagen[];
}) {
  const [imagenes, setImagenes] = useState<ProductoImagen[]>(initialImagenes);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canUpload = imagenes.length < 5;

  const handleUpload = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const remaining = 5 - imagenes.length;

      if (fileArray.length > remaining) {
        toast.error(`Solo podés agregar ${remaining} imagen${remaining !== 1 ? "es" : ""} más`);
        return;
      }

      setUploading(true);

      for (const file of fileArray) {
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`"${file.name}" supera 5MB`);
          continue;
        }
        if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) {
          toast.error(`"${file.name}" no es un formato válido`);
          continue;
        }

        const formData = new FormData();
        formData.append("file", file);

        try {
          const res = await fetch(`/api/admin/productos/${productoId}/imagenes`, {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error);
          }

          const { data } = await res.json();
          setImagenes((prev) => [...prev, data]);
          toast.success(`"${file.name}" subida`);
        } catch (error: any) {
          toast.error(error.message || "Error al subir imagen");
        }
      }

      setUploading(false);
    },
    [productoId, imagenes.length]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleUpload(e.dataTransfer.files);
      }
    },
    [handleUpload]
  );

  const handleSetPrincipal = async (imagenId: number) => {
    try {
      const res = await fetch(`/api/admin/productos/${productoId}/imagenes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_principal", imagen_id: imagenId }),
      });
      if (!res.ok) throw new Error("Error");

      setImagenes((prev) =>
        prev.map((img) => ({
          ...img,
          es_principal: img.id === imagenId,
        }))
      );
      toast.success("Portada actualizada");
    } catch {
      toast.error("Error al cambiar portada");
    }
  };

  const handleDelete = async (imagenId: number) => {
    try {
      const res = await fetch(
        `/api/admin/productos/${productoId}/imagenes?imagen_id=${imagenId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Error");

      setImagenes((prev) => {
        const filtered = prev.filter((img) => img.id !== imagenId);
        // If we removed principal and there are remaining, first becomes principal
        const hadPrincipal = prev.find((img) => img.id === imagenId)?.es_principal;
        if (hadPrincipal && filtered.length > 0) {
          filtered[0].es_principal = true;
        }
        return filtered;
      });
      toast.success("Imagen eliminada");
    } catch {
      toast.error("Error al eliminar");
    }
  };

  const handleReorder = async (newOrder: ProductoImagen[]) => {
    setImagenes(newOrder);
    try {
      await fetch(`/api/admin/productos/${productoId}/imagenes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reorder",
          orden: newOrder.map((img) => img.id),
        }),
      });
    } catch {
      // silent — order is visual, will persist on next load
    }
  };

  // Crop editor
  const [editingFocalPoint, setEditingFocalPoint] = useState<ProductoImagen | null>(null);
  const focalContainerRef = useRef<HTMLDivElement>(null);
  const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const CARD_ASPECT = 4 / 5;

  // Given the image natural size, compute the crop rect in % of the displayed image.
  // object-position: X% Y% means X% of horizontal overflow is to the left,
  // Y% of vertical overflow is to the top.
  function getCropPercents(natW: number, natH: number, fp: string) {
    const imgAspect = natW / natH;
    // What fraction of the image does the 4:5 crop cover?
    let cropFracW: number, cropFracH: number;
    if (imgAspect > CARD_ASPECT) {
      // Wider: full height visible, width cropped
      cropFracH = 1;
      cropFracW = (natH * CARD_ASPECT) / natW;
    } else {
      // Taller: full width visible, height cropped
      cropFracW = 1;
      cropFracH = (natW / CARD_ASPECT) / natH;
    }

    const parts = fp.split(" ");
    const opx = parseFloat(parts[0]) / 100;
    const opy = parseFloat(parts[1]) / 100;

    // overflow fraction = 1 - cropFrac
    const overflowFracW = 1 - cropFracW;
    const overflowFracH = 1 - cropFracH;

    return {
      left: opx * overflowFracW * 100,
      top: opy * overflowFracH * 100,
      width: cropFracW * 100,
      height: cropFracH * 100,
      overflowFracW,
      overflowFracH,
    };
  }

  function pointerToFP(clientX: number, clientY: number): string | null {
    if (!focalContainerRef.current || !imgNaturalSize) return null;
    const rect = focalContainerRef.current.getBoundingClientRect();
    const { overflowFracW, overflowFracH, width, height } = getCropPercents(
      imgNaturalSize.w, imgNaturalSize.h, "50% 50%"
    );

    const px = (clientX - rect.left) / rect.width;
    const py = (clientY - rect.top) / rect.height;

    let opx = 50;
    let opy = 50;

    if (overflowFracW > 0.001) {
      const desiredLeft = px - (width / 100) / 2;
      opx = Math.max(0, Math.min(100, (desiredLeft / overflowFracW) * 100));
    }
    if (overflowFracH > 0.001) {
      const desiredTop = py - (height / 100) / 2;
      opy = Math.max(0, Math.min(100, (desiredTop / overflowFracH) * 100));
    }

    return `${Math.round(opx)}% ${Math.round(opy)}%`;
  }

  const saveFocalPoint = useCallback((fp: string) => {
    if (!editingFocalPoint) return;
    setEditingFocalPoint((prev) => prev ? { ...prev, focal_point: fp } : null);
    setImagenes((prev) =>
      prev.map((img) =>
        img.id === editingFocalPoint.id ? { ...img, focal_point: fp } : img
      )
    );
  }, [editingFocalPoint]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingCrop(true);
    focalContainerRef.current?.setPointerCapture(e.pointerId);
    const fp = pointerToFP(e.clientX, e.clientY);
    if (fp) saveFocalPoint(fp);
  }, [saveFocalPoint, imgNaturalSize]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingCrop) return;
    const fp = pointerToFP(e.clientX, e.clientY);
    if (fp) saveFocalPoint(fp);
  }, [isDraggingCrop, saveFocalPoint, imgNaturalSize]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingCrop || !editingFocalPoint) return;
    setIsDraggingCrop(false);
    focalContainerRef.current?.releasePointerCapture(e.pointerId);
    fetch(`/api/admin/productos/${productoId}/imagenes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_focal_point",
        imagen_id: editingFocalPoint.id,
        focal_point: editingFocalPoint.focal_point,
      }),
    }).catch(() => toast.error("Error al guardar punto focal"));
  }, [isDraggingCrop, editingFocalPoint, productoId]);

  const crop = editingFocalPoint && imgNaturalSize
    ? getCropPercents(imgNaturalSize.w, imgNaturalSize.h, editingFocalPoint.focal_point || "50% 50%")
    : null;

  return (
    <div className="space-y-4">
      {/* Crop editor modal */}
      <AnimatePresence>
        {editingFocalPoint && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 sm:p-6"
            onClick={() => setEditingFocalPoint(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={springSmooth}
              className="relative w-full max-w-2xl max-h-[90dvh] overflow-hidden flex flex-col rounded-2xl bg-card p-4 sm:p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crosshair className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">Ajustar recorte</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingFocalPoint(null)}
                  className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 min-h-0 flex-1">
                {/* Image with crop overlay */}
                <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                  <p className="mb-2 text-xs text-muted-foreground shrink-0">
                    Arrastrá sobre la imagen para elegir qué parte se ve en la tarjeta
                  </p>
                  <div
                    ref={focalContainerRef}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    className="relative flex-1 min-h-0 cursor-grab active:cursor-grabbing rounded-xl overflow-hidden select-none touch-none bg-neutral-900 flex items-center justify-center"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={editingFocalPoint.url}
                      alt="Editar recorte"
                      className="block max-w-full max-h-full w-auto h-auto object-contain"
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                      }}
                      draggable={false}
                    />

                    {/* Crop overlay — no CSS transitions for instant response */}
                    {crop && (
                      <div
                        className="pointer-events-none absolute border-2 border-white/90 will-change-[left,top]"
                        style={{
                          left: `${crop.left}%`,
                          top: `${crop.top}%`,
                          width: `${crop.width}%`,
                          height: `${crop.height}%`,
                          boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.5)",
                        }}
                      >
                        {/* Corner handles */}
                        {[
                          "top-0 left-0 -translate-x-1/2 -translate-y-1/2",
                          "top-0 right-0 translate-x-1/2 -translate-y-1/2",
                          "bottom-0 left-0 -translate-x-1/2 translate-y-1/2",
                          "bottom-0 right-0 translate-x-1/2 translate-y-1/2",
                        ].map((pos, i) => (
                          <div key={i} className={`absolute ${pos} size-3 rounded-full bg-white shadow-md border border-black/20`} />
                        ))}
                        {/* Rule of thirds */}
                        <div className="absolute inset-0">
                          <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/25" />
                          <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/25" />
                          <div className="absolute top-1/3 left-0 right-0 h-px bg-white/25" />
                          <div className="absolute top-2/3 left-0 right-0 h-px bg-white/25" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Preview sidebar */}
                <div className="flex sm:flex-col items-center sm:items-start gap-3 sm:w-32 shrink-0">
                  <p className="text-[11px] text-muted-foreground sm:text-center sm:w-full">
                    Vista previa tarjeta:
                  </p>
                  <div className="relative w-24 sm:w-full aspect-[4/5] overflow-hidden rounded-xl bg-muted ring-1 ring-border shadow-sm">
                    <Image
                      src={editingFocalPoint.url}
                      alt="Preview"
                      fill
                      className="object-cover"
                      style={{ objectPosition: editingFocalPoint.focal_point || "50% 50%" }}
                      sizes="128px"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Upload zone */}
      {canUpload && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={springSmooth}
        >
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed
              px-4 py-6 transition-all duration-200
              ${
                dragOver
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-border/60 bg-muted/20 hover:border-primary/40 hover:bg-muted/40"
              }
              ${uploading ? "pointer-events-none opacity-60" : ""}
            `}
          >
            {uploading ? (
              <Loader2 className="size-7 animate-spin text-primary" />
            ) : (
              <motion.div
                animate={dragOver ? { scale: 1.1, y: -2 } : { scale: 1, y: 0 }}
                transition={springBouncy}
                className="flex size-10 items-center justify-center rounded-full bg-primary/10"
              >
                <Upload className="size-4.5 text-primary" />
              </motion.div>
            )}
            <div className="text-center">
              <p className="text-sm font-medium">
                {uploading ? "Subiendo..." : "Arrastrá o hacé clic"}
              </p>
              <p className="text-xs text-muted-foreground">
                JPG, PNG, WebP — máx. 5MB — {5 - imagenes.length} restante
                {5 - imagenes.length !== 1 ? "s" : ""}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleUpload(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </motion.div>
      )}

      {/* Image grid */}
      <AnimatePresence mode="popLayout">
        {imagenes.length > 0 && (
          <Reorder.Group
            axis="y"
            values={imagenes}
            onReorder={handleReorder}
            className="space-y-2"
          >
            {imagenes.map((img) => (
              <Reorder.Item
                key={img.id}
                value={img}
                className="cursor-grab active:cursor-grabbing"
              >
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                  transition={springSmooth}
                  className={`
                    group relative flex items-center gap-3 rounded-xl border p-2 transition-colors
                    ${
                      img.es_principal
                        ? "border-primary/30 bg-primary/5"
                        : "border-border/50 bg-card hover:border-border"
                    }
                  `}
                >
                  <div className="flex shrink-0 items-center text-muted-foreground/40">
                    <GripVertical className="size-4" />
                  </div>

                  <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                    <Image
                      src={img.url}
                      alt={img.alt_text || "Producto"}
                      fill
                      className="object-cover"
                      style={{ objectPosition: img.focal_point || "50% 50%" }}
                      sizes="56px"
                    />
                    {img.es_principal && (
                      <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                        <Star className="size-4 fill-primary text-primary" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-0.5">
                    {img.es_principal ? (
                      <Badge variant="default" className="text-[10px] h-4 bg-primary">
                        Portada
                      </Badge>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetPrincipal(img.id)}
                        className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                      >
                        <Star className="size-3" />
                        Hacer portada
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setImgNaturalSize(null); setEditingFocalPoint(img); }}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                    >
                      <Crosshair className="size-3" />
                      Recorte
                    </button>
                  </div>

                  <TooltipProvider delay={200}>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            onClick={() => handleDelete(img.id)}
                            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        }
                      />
                      <TooltipContent side="left">
                        <p>Eliminar imagen</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </motion.div>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}
      </AnimatePresence>

      {imagenes.length === 0 && !canUpload && (
        <p className="text-center text-sm text-muted-foreground py-4">
          No hay imágenes
        </p>
      )}

      {/* Counter */}
      <div className="flex items-center justify-center">
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <motion.div
              key={i}
              initial={false}
              animate={{
                backgroundColor: i < imagenes.length ? "var(--primary)" : "var(--muted)",
                scale: i < imagenes.length ? 1 : 0.85,
              }}
              transition={springBouncy}
              className="size-1.5 rounded-full"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Proveedores section ---

function ProveedoresSection({
  productoId,
  initialProveedores,
  onChange,
}: {
  productoId?: number;
  initialProveedores: ProductoProveedor[];
  onChange?: (proveedores: ProductoProveedor[]) => void;
}) {
  const [proveedoresProducto, setProveedoresProducto] = useState<ProductoProveedor[]>(initialProveedores);
  const [allProveedores, setAllProveedores] = useState<Proveedor[]>([]);
  const [saving, setSaving] = useState(false);

  const isLocal = !productoId;

  useEffect(() => {
    async function load() {
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from("proveedores")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre");
      if (data) setAllProveedores(data);
    }
    load();
  }, []);

  const setAndNotify = (updater: (prev: ProductoProveedor[]) => ProductoProveedor[]) => {
    setProveedoresProducto((prev) => {
      const next = updater(prev);
      if (isLocal && onChange) onChange(next);
      return next;
    });
  };

  const addRow = () => {
    setAndNotify((prev) => [
      ...prev,
      { proveedor_id: 0, costo: null, codigo_proveedor: null, es_principal: prev.length === 0 },
    ]);
  };

  const removeRow = (index: number) => {
    setAndNotify((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length > 0 && !updated.some((p) => p.es_principal)) {
        updated[0].es_principal = true;
      }
      return updated;
    });
  };

  const updateRow = (index: number, field: keyof ProductoProveedor, value: any) => {
    setAndNotify((prev) =>
      prev.map((row, i) => {
        if (i !== index) {
          if (field === "es_principal" && value === true) {
            return { ...row, es_principal: false };
          }
          return row;
        }
        return { ...row, [field]: value };
      })
    );
  };

  const handleSave = async () => {
    const valid = proveedoresProducto.filter((p) => p.proveedor_id > 0);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/productos/${productoId}/proveedores`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proveedores: valid.map((p) => ({
            proveedor_id: p.proveedor_id,
            costo: p.costo,
            codigo_proveedor: p.codigo_proveedor,
            es_principal: p.es_principal,
          })),
        }),
      });
      if (!res.ok) throw new Error("Error al guardar proveedores");
      const { data } = await res.json();
      setProveedoresProducto(data);
      toast.success("Proveedores actualizados");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  // Filter out already-assigned proveedores
  const usedIds = new Set(proveedoresProducto.map((p) => p.proveedor_id));

  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {proveedoresProducto.map((row, index) => (
          <motion.div
            key={`prov-${index}`}
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
            transition={springSmooth}
            className={`rounded-xl border p-3 space-y-3 ${
              row.es_principal ? "border-primary/30 bg-primary/5" : "border-border/50"
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Select
                  value={row.proveedor_id > 0 ? row.proveedor_id.toString() : ""}
                  onValueChange={(v) => updateRow(index, "proveedor_id", parseInt(v || "0"))}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Seleccionar proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {allProveedores
                      .filter((p) => !usedIds.has(p.id) || p.id === row.proveedor_id)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          {p.nombre}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px] text-muted-foreground">Costo</Label>
                <div className="relative mt-0.5">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    $
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.costo ?? ""}
                    onChange={(e) =>
                      updateRow(index, "costo", e.target.value ? parseFloat(e.target.value) : null)
                    }
                    placeholder="0.00"
                    className="h-8 pl-5 text-sm"
                  />
                </div>
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Código proveedor</Label>
                <Input
                  value={row.codigo_proveedor || ""}
                  onChange={(e) => updateRow(index, "codigo_proveedor", e.target.value || null)}
                  placeholder="Código"
                  className="mt-0.5 h-8 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateRow(index, "es_principal", true)}
                className={`flex items-center gap-1.5 text-xs transition-colors ${
                  row.es_principal
                    ? "text-primary font-medium"
                    : "text-muted-foreground hover:text-primary"
                }`}
              >
                <Star className={`size-3 ${row.es_principal ? "fill-primary" : ""}`} />
                {row.es_principal ? "Principal" : "Hacer principal"}
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="flex items-center gap-2">
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={addRow}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
        >
          <Plus className="size-3" />
          Agregar proveedor
        </motion.button>

        {!isLocal && proveedoresProducto.length > 0 && (
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleSave}
              disabled={saving}
              className="h-7 text-xs"
            >
              {saving ? <Loader2 className="size-3 animate-spin mr-1" /> : <Save className="size-3 mr-1" />}
              Guardar proveedores
            </Button>
          </motion.div>
        )}
      </div>

      {proveedoresProducto.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-2">
          Sin proveedores asignados
        </p>
      )}
    </div>
  );
}

// --- Main form ---

export function ProductoForm({ producto }: Props) {
  const router = useRouter();
  const isEdit = !!producto;
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newProveedores, setNewProveedores] = useState<ProductoProveedor[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      nombre: producto?.nombre || "",
      slug: producto?.slug || "",
      descripcion: producto?.descripcion || "",
      descripcion_corta: producto?.descripcion_corta || "",
      categoria_id: producto?.categoria_id?.toString() || "",
      precio: producto?.precio?.toString() || "",
      precio_socio: producto?.precio_socio?.toString() || "",
      sku: producto?.sku || "",
      stock_actual: producto?.stock_actual?.toString() || "0",
      stock_minimo: producto?.stock_minimo?.toString() || "5",
      unidad: producto?.unidad || "un",
      activo: producto?.activo ?? true,
      destacado: producto?.destacado ?? false,
    },
  });

  const nombre = watch("nombre");
  const activo = watch("activo");
  const destacado = watch("destacado");
  const precio = watch("precio");
  const precioSocio = watch("precio_socio");
  const categoriaId = watch("categoria_id");
  const unidad = watch("unidad");

  // Auto-generate slug from name (shouldDirty: false to avoid re-render cascade)
  useEffect(() => {
    if (!isEdit && nombre) {
      setValue("slug", slugify(nombre), { shouldDirty: false, shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombre, isEdit]);

  // Load categories
  useEffect(() => {
    async function load() {
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from("categorias_producto")
        .select("id, nombre, slug")
        .eq("activa", true)
        .order("orden");
      if (data) setCategorias(data);
    }
    load();
  }, []);

  async function onSubmit(data: FormData) {
    setSaving(true);
    try {
      const payload = {
        nombre: data.nombre,
        slug: data.slug,
        descripcion: data.descripcion || null,
        descripcion_corta: data.descripcion_corta || null,
        categoria_id: data.categoria_id ? parseInt(data.categoria_id) : null,
        precio: parseFloat(data.precio),
        precio_socio: data.precio_socio ? parseFloat(data.precio_socio) : null,
        sku: data.sku || null,
        stock_actual: parseInt(data.stock_actual),
        stock_minimo: parseInt(data.stock_minimo),
        unidad: data.unidad,
        activo: data.activo,
        destacado: data.destacado,
      };

      const url = isEdit
        ? `/api/admin/productos/${producto.id}`
        : "/api/admin/productos";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al guardar");
      }

      const result = await res.json();

      // Save proveedores for new product
      if (!isEdit && newProveedores.length > 0) {
        const validProveedores = newProveedores.filter((p) => p.proveedor_id > 0);
        if (validProveedores.length > 0) {
          await fetch(`/api/admin/productos/${result.data.id}/proveedores`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              proveedores: validProveedores.map((p) => ({
                proveedor_id: p.proveedor_id,
                costo: p.costo,
                codigo_proveedor: p.codigo_proveedor,
                es_principal: p.es_principal,
              })),
            }),
          });
        }
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);

      if (isEdit) {
        toast.success("Producto actualizado");
      } else {
        toast.success("Producto creado — ahora podés agregar fotos");
        router.push(`/admin/productos/${result.data.id}`);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  // Compute discount percentage
  const discountPct =
    precio && precioSocio
      ? Math.round(
          ((parseFloat(precio) - parseFloat(precioSocio)) / parseFloat(precio)) *
            100
        )
      : null;

  return (
    <form onSubmit={handleSubmit(onSubmit as any)} className="pb-8">
      {/* Top bar */}
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        transition={{ ...springSmooth, delay: 0 }}
        className="mb-6 flex items-center justify-between gap-4"
      >
        <Link
          href="/admin/productos"
          className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <motion.span
            className="inline-block"
            whileHover={{ x: -3 }}
            transition={springBouncy}
          >
            <ArrowLeft className="size-4" />
          </motion.span>
          Productos
        </Link>

        <div className="flex items-center gap-2">
          {isEdit && (
            <AnimatePresence>
              {isDirty && (
                <motion.div
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  className="flex items-center gap-1.5 text-xs text-amber-600"
                >
                  <div className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Sin guardar
                </motion.div>
              )}
            </AnimatePresence>
          )}

          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
            <Button
              type="submit"
              disabled={saving}
              className="relative min-w-[140px] overflow-hidden"
            >
              <AnimatePresence mode="wait">
                {saving ? (
                  <motion.span
                    key="saving"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex items-center gap-2"
                  >
                    <Loader2 className="size-4 animate-spin" />
                    Guardando...
                  </motion.span>
                ) : saved ? (
                  <motion.span
                    key="saved"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex items-center gap-2"
                  >
                    <Check className="size-4" />
                    Guardado
                  </motion.span>
                ) : (
                  <motion.span
                    key="save"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex items-center gap-2"
                  >
                    <Save className="size-4" />
                    {isEdit ? "Guardar cambios" : "Crear producto"}
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Two column layout */}
      <div className="grid gap-6 lg:grid-cols-[1fr,340px]">
        {/* LEFT — Main content */}
        <div className="space-y-6">
          {/* Basic info */}
          <FormSection
            icon={Package}
            title="Información del producto"
            description="Nombre, descripción y categoría"
            delay={0.05}
          >
            <div className="space-y-4">
              <div>
                <Label htmlFor="nombre">
                  Nombre <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="nombre"
                  {...register("nombre")}
                  placeholder="Ej: Camiseta oficial 2025"
                  className="mt-1.5"
                />
                {errors.nombre && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-1.5 flex items-center gap-1 text-xs text-destructive"
                  >
                    <AlertCircle className="size-3" />
                    {errors.nombre.message}
                  </motion.p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="slug">Slug (URL)</Label>
                  <Input
                    id="slug"
                    {...register("slug")}
                    placeholder="camiseta-oficial-2025"
                    className="mt-1.5 font-mono text-sm"
                  />
                  {errors.slug && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-1.5 flex items-center gap-1 text-xs text-destructive"
                    >
                      <AlertCircle className="size-3" />
                      {errors.slug.message}
                    </motion.p>
                  )}
                </div>

                <div>
                  <Label htmlFor="sku">SKU</Label>
                  <Input
                    id="sku"
                    {...register("sku")}
                    placeholder="CS-001"
                    className="mt-1.5 font-mono text-sm"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="descripcion_corta">Descripción corta</Label>
                <Input
                  id="descripcion_corta"
                  {...register("descripcion_corta")}
                  placeholder="Breve descripción para listados y previews"
                  className="mt-1.5"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Máximo 300 caracteres — se muestra en las tarjetas de producto
                </p>
              </div>

              <div>
                <Label htmlFor="descripcion">Descripción completa</Label>
                <Textarea
                  id="descripcion"
                  {...register("descripcion")}
                  rows={5}
                  placeholder="Descripción detallada con materiales, medidas, cuidados..."
                  className="mt-1.5 resize-y"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Categoría</Label>
                  <Select
                    value={categoriaId || ""}
                    onValueChange={(v) =>
                      setValue("categoria_id", !v || v === "none" ? "" : v, {
                        shouldDirty: true,
                      })
                    }
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Sin categoría">
                        {categoriaId && categoriaId !== "none"
                          ? categorias.find((c) => c.id.toString() === categoriaId)?.nombre ?? "Sin categoría"
                          : "Sin categoría"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin categoría</SelectItem>
                      {categorias.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id.toString()}>
                          {cat.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </FormSection>

          {/* Pricing & Stock */}
          <FormSection
            icon={DollarSign}
            title="Precio y stock"
            description="Precios en UYU y control de inventario"
            delay={0.1}
          >
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="precio">
                    Precio <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      $
                    </span>
                    <Input
                      id="precio"
                      type="number"
                      step="0.01"
                      min="0"
                      {...register("precio")}
                      placeholder="0.00"
                      className="pl-7"
                    />
                  </div>
                  {errors.precio && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-1.5 flex items-center gap-1 text-xs text-destructive"
                    >
                      <AlertCircle className="size-3" />
                      {errors.precio.message}
                    </motion.p>
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="precio_socio">Precio socio</Label>
                    <AnimatePresence>
                      {discountPct && discountPct > 0 && discountPct < 100 && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={springBouncy}
                        >
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-4 font-bold text-emerald-700 bg-emerald-50"
                          >
                            -{discountPct}%
                          </Badge>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      $
                    </span>
                    <Input
                      id="precio_socio"
                      type="number"
                      step="0.01"
                      min="0"
                      {...register("precio_socio")}
                      placeholder="Opcional"
                      className="pl-7"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Dejá vacío si no hay descuento para socios
                  </p>
                </div>
              </div>

              <Separator className="opacity-50" />

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="stock_actual">Stock actual</Label>
                  <Input
                    id="stock_actual"
                    type="number"
                    min="0"
                    {...register("stock_actual")}
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="stock_minimo">Stock mínimo</Label>
                    <TooltipProvider delay={200}>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span className="inline-flex">
                              <Info className="size-3 text-muted-foreground" />
                            </span>
                          }
                        />
                        <TooltipContent>
                          <p>Se muestra alerta cuando el stock baja de este número</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="stock_minimo"
                    type="number"
                    min="0"
                    {...register("stock_minimo")}
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label>Unidad</Label>
                  <Select
                    value={unidad || "un"}
                    onValueChange={(v) =>
                      setValue("unidad", v || "un", { shouldDirty: true })
                    }
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Unidad" />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIDADES.map((u) => (
                        <SelectItem key={u.value} value={u.value}>
                          {u.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </FormSection>

          {/* Proveedores */}
          <FormSection
            icon={Truck}
            title="Proveedores"
            description="Proveedores que suministran este producto"
            delay={0.15}
          >
            <ProveedoresSection
              productoId={isEdit ? producto.id : undefined}
              initialProveedores={isEdit ? (producto.producto_proveedores || []) : []}
              onChange={!isEdit ? setNewProveedores : undefined}
            />
          </FormSection>

          {/* Variantes */}
          {isEdit && (
            <FormSection
              icon={Layers}
              title="Variantes"
              description="Talles, colores y combinaciones con stock individual"
              delay={0.2}
            >
              <VariantesSection
                productoId={producto.id}
                productoSku={producto.sku}
                initialVariantes={producto.producto_variantes || []}
              />
            </FormSection>
          )}
        </div>

        {/* RIGHT — Sidebar */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          {/* Images */}
          <FormSection
            icon={ImagePlus}
            title="Fotos del producto"
            description={isEdit ? "Hasta 5 imágenes" : "Disponible después de guardar"}
            delay={0.15}
          >
            {isEdit ? (
              <ImageUploader
                productoId={producto.id}
                imagenes={producto.producto_imagenes || []}
              />
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/50 bg-muted/10 py-8 px-4 text-center"
              >
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <ImagePlus className="size-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Primero creá el producto
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground/70">
                    Una vez guardado podrás subir hasta 5 fotos y elegir la portada
                  </p>
                </div>
              </motion.div>
            )}
          </FormSection>

          {/* Visibility */}
          <FormSection icon={Eye} title="Visibilidad" delay={0.2}>
            <div className="space-y-4">
              <div
                className={`flex items-center justify-between rounded-xl border p-3.5 transition-colors ${
                  activo
                    ? "border-emerald-200 bg-emerald-50/50"
                    : "border-border/50 bg-muted/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  <motion.div
                    animate={{
                      backgroundColor: activo
                        ? "rgb(16 185 129 / 0.15)"
                        : "rgb(156 163 175 / 0.15)",
                    }}
                    className="flex size-8 items-center justify-center rounded-lg"
                  >
                    <Eye
                      className={`size-4 transition-colors ${
                        activo ? "text-emerald-600" : "text-muted-foreground"
                      }`}
                    />
                  </motion.div>
                  <div>
                    <p className="text-sm font-medium">Activo</p>
                    <p className="text-[11px] text-muted-foreground">
                      Visible en la tienda
                    </p>
                  </div>
                </div>
                <Switch
                  checked={activo}
                  onCheckedChange={(v) => setValue("activo", v, { shouldDirty: true })}
                />
              </div>

              <div
                className={`flex items-center justify-between rounded-xl border p-3.5 transition-colors ${
                  destacado
                    ? "border-amber-200 bg-amber-50/50"
                    : "border-border/50 bg-muted/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  <motion.div
                    animate={{
                      backgroundColor: destacado
                        ? "rgb(245 158 11 / 0.15)"
                        : "rgb(156 163 175 / 0.15)",
                    }}
                    className="flex size-8 items-center justify-center rounded-lg"
                  >
                    <Star
                      className={`size-4 transition-colors ${
                        destacado ? "text-amber-500 fill-amber-500" : "text-muted-foreground"
                      }`}
                    />
                  </motion.div>
                  <div>
                    <p className="text-sm font-medium">Destacado</p>
                    <p className="text-[11px] text-muted-foreground">
                      Sección de destacados
                    </p>
                  </div>
                </div>
                <Switch
                  checked={destacado}
                  onCheckedChange={(v) =>
                    setValue("destacado", v, { shouldDirty: true })
                  }
                />
              </div>
            </div>
          </FormSection>
        </div>
      </div>
    </form>
  );
}
