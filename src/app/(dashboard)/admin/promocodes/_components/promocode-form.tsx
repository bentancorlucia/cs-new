"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Save,
  Loader2,
  Check,
  AlertCircle,
  Tag,
  Calendar,
  DollarSign,
  Percent,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
import { fadeInUp, springSmooth, springBouncy } from "@/lib/motion";
import { toast } from "sonner";

const schema = z
  .object({
    codigo: z
      .string()
      .min(2, "Mínimo 2 caracteres")
      .max(40, "Máximo 40 caracteres")
      .regex(/^[A-Z0-9_-]+$/i, "Solo letras, números, _ y -"),
    descripcion: z.string().max(500).optional(),
    tipo_descuento: z.enum(["porcentaje", "monto_fijo"]),
    valor: z.string().min(1, "Requerido"),
    fecha_inicio: z.string().min(1, "Requerido"),
    fecha_fin: z.string().min(1, "Requerido"),
    acumulable_con_precio_socio: z.boolean(),
    monto_minimo: z.string().optional(),
    usos_max: z.string().optional(),
    activo: z.boolean(),
  })
  .refine(
    (d) => {
      const v = parseFloat(d.valor);
      if (Number.isNaN(v) || v <= 0) return false;
      if (d.tipo_descuento === "porcentaje" && v > 100) return false;
      return true;
    },
    {
      message: "Valor inválido (porcentaje 1-100, monto fijo > 0)",
      path: ["valor"],
    }
  )
  .refine(
    (d) => new Date(d.fecha_fin) > new Date(d.fecha_inicio),
    { message: "Debe ser posterior a la fecha de inicio", path: ["fecha_fin"] }
  );

type FormData = z.infer<typeof schema>;

interface Promocode {
  id: number;
  codigo: string;
  descripcion: string | null;
  tipo_descuento: "porcentaje" | "monto_fijo";
  valor: number;
  fecha_inicio: string;
  fecha_fin: string;
  acumulable_con_precio_socio: boolean;
  monto_minimo: number | null;
  usos_max: number | null;
  usos_actuales: number;
  activo: boolean;
}

function toLocalInput(iso: string) {
  // Convierte "2026-05-08T12:00:00+00:00" a "2026-05-08T12:00" para input datetime-local en hora local.
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  promocode?: Promocode;
}

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

export function PromocodeForm({ promocode }: Props) {
  const router = useRouter();
  const isEdit = !!promocode;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const defaultStart = (() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate()
    )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();
  const defaultEnd = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    d.setMinutes(0, 0, 0);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate()
    )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      codigo: promocode?.codigo || "",
      descripcion: promocode?.descripcion || "",
      tipo_descuento: promocode?.tipo_descuento || "porcentaje",
      valor: promocode?.valor?.toString() || "",
      fecha_inicio: promocode ? toLocalInput(promocode.fecha_inicio) : defaultStart,
      fecha_fin: promocode ? toLocalInput(promocode.fecha_fin) : defaultEnd,
      acumulable_con_precio_socio:
        promocode?.acumulable_con_precio_socio ?? false,
      monto_minimo: promocode?.monto_minimo?.toString() || "",
      usos_max: promocode?.usos_max?.toString() || "",
      activo: promocode?.activo ?? true,
    },
  });

  const tipoDescuento = watch("tipo_descuento");
  const acumulable = watch("acumulable_con_precio_socio");
  const activo = watch("activo");
  const codigo = watch("codigo");
  const valor = watch("valor");

  async function onSubmit(data: FormData) {
    setSaving(true);
    try {
      const payload = {
        codigo: data.codigo.trim().toUpperCase(),
        descripcion: data.descripcion || null,
        tipo_descuento: data.tipo_descuento,
        valor: parseFloat(data.valor),
        fecha_inicio: new Date(data.fecha_inicio).toISOString(),
        fecha_fin: new Date(data.fecha_fin).toISOString(),
        acumulable_con_precio_socio: data.acumulable_con_precio_socio,
        monto_minimo: data.monto_minimo ? parseFloat(data.monto_minimo) : null,
        usos_max: data.usos_max ? parseInt(data.usos_max, 10) : null,
        activo: data.activo,
      };

      const url = isEdit
        ? `/api/admin/promocodes/${promocode.id}`
        : "/api/admin/promocodes";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Error al guardar");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);

      if (isEdit) {
        toast.success("Promocode actualizado");
      } else {
        toast.success("Promocode creado");
        router.push(`/admin/promocodes/${result.data.id}`);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

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
          href="/admin/promocodes"
          className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <motion.span
            className="inline-block"
            whileHover={{ x: -3 }}
            transition={springBouncy}
          >
            <ArrowLeft className="size-4" />
          </motion.span>
          Promocodes
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
            <Button type="submit" disabled={saving} className="relative min-w-[140px] overflow-hidden">
              <AnimatePresence mode="wait">
                {saving ? (
                  <motion.span key="saving" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Guardando...
                  </motion.span>
                ) : saved ? (
                  <motion.span key="saved" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex items-center gap-2">
                    <Check className="size-4" />
                    Guardado
                  </motion.span>
                ) : (
                  <motion.span key="save" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex items-center gap-2">
                    <Save className="size-4" />
                    {isEdit ? "Guardar cambios" : "Crear promocode"}
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </motion.div>
        </div>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-[1fr,340px]">
        {/* LEFT */}
        <div className="space-y-6">
          <FormSection icon={Tag} title="Identificación" delay={0.05}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="codigo">
                  Código <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="codigo"
                  {...register("codigo", {
                    onChange: (e) =>
                      setValue("codigo", e.target.value.toUpperCase(), {
                        shouldDirty: true,
                        shouldValidate: true,
                      }),
                  })}
                  placeholder="EJ: BIENVENIDA10"
                  className="mt-1.5 font-mono uppercase"
                  maxLength={40}
                />
                {errors.codigo && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="size-3" />
                    {errors.codigo.message}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Letras, números, guiones bajos y guiones. Se guardará en mayúsculas.
                </p>
              </div>

              <div>
                <Label htmlFor="descripcion">Descripción interna</Label>
                <Textarea
                  id="descripcion"
                  {...register("descripcion")}
                  rows={2}
                  placeholder="Para qué es este código (no se muestra al cliente)"
                  className="mt-1.5 resize-y"
                />
              </div>
            </div>
          </FormSection>

          <FormSection icon={DollarSign} title="Descuento" description="Tipo y valor" delay={0.1}>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Tipo de descuento</Label>
                  <Select
                    value={tipoDescuento}
                    onValueChange={(v) =>
                      setValue("tipo_descuento", v as any, { shouldDirty: true })
                    }
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="porcentaje">Porcentaje (%)</SelectItem>
                      <SelectItem value="monto_fijo">Monto fijo (UYU)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="valor">
                    Valor <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      {tipoDescuento === "porcentaje" ? <Percent className="size-3.5" /> : "$"}
                    </span>
                    <Input
                      id="valor"
                      type="number"
                      step="0.01"
                      min="0"
                      {...register("valor")}
                      placeholder={tipoDescuento === "porcentaje" ? "10" : "500"}
                      className="pl-8"
                    />
                  </div>
                  {errors.valor && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-destructive">
                      <AlertCircle className="size-3" />
                      {errors.valor.message}
                    </p>
                  )}
                  {valor && tipoDescuento === "porcentaje" && parseFloat(valor) > 0 && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Ej: en una compra de $1.000 descuenta $
                      {Math.round(1000 * (parseFloat(valor) / 100)).toLocaleString("es-UY")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </FormSection>

          <FormSection icon={Calendar} title="Vigencia" description="Fechas de inicio y fin" delay={0.15}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="fecha_inicio">
                  Inicio <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="fecha_inicio"
                  type="datetime-local"
                  {...register("fecha_inicio")}
                  className="mt-1.5"
                />
                {errors.fecha_inicio && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="size-3" />
                    {errors.fecha_inicio.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="fecha_fin">
                  Fin <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="fecha_fin"
                  type="datetime-local"
                  {...register("fecha_fin")}
                  className="mt-1.5"
                />
                {errors.fecha_fin && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="size-3" />
                    {errors.fecha_fin.message}
                  </p>
                )}
              </div>
            </div>
          </FormSection>

          <FormSection icon={Settings2} title="Restricciones" delay={0.2}>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="monto_minimo">Monto mínimo de compra</Label>
                  <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      $
                    </span>
                    <Input
                      id="monto_minimo"
                      type="number"
                      step="0.01"
                      min="0"
                      {...register("monto_minimo")}
                      placeholder="Sin mínimo"
                      className="pl-7"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Vacío = sin requisito
                  </p>
                </div>
                <div>
                  <Label htmlFor="usos_max">Usos máximos</Label>
                  <Input
                    id="usos_max"
                    type="number"
                    min="1"
                    step="1"
                    {...register("usos_max")}
                    placeholder="Ilimitado"
                    className="mt-1.5"
                  />
                  {isEdit && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Usados: <strong>{promocode!.usos_actuales}</strong>
                      {promocode!.usos_max != null
                        ? ` / ${promocode!.usos_max}`
                        : " (sin límite)"}
                    </p>
                  )}
                </div>
              </div>

              <div
                className={`flex items-center justify-between rounded-xl border p-3.5 transition-colors ${
                  acumulable
                    ? "border-emerald-200 bg-emerald-50/50"
                    : "border-border/50 bg-muted/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  <motion.div
                    animate={{
                      backgroundColor: acumulable
                        ? "rgb(16 185 129 / 0.15)"
                        : "rgb(156 163 175 / 0.15)",
                    }}
                    className="flex size-8 items-center justify-center rounded-lg"
                  >
                    <ShieldCheck
                      className={`size-4 transition-colors ${
                        acumulable ? "text-emerald-600" : "text-muted-foreground"
                      }`}
                    />
                  </motion.div>
                  <div>
                    <p className="text-sm font-medium">
                      Acumulable con precio socio
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Si está apagado, los socios reciben el mejor de los dos beneficios.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={acumulable}
                  onCheckedChange={(v) =>
                    setValue("acumulable_con_precio_socio", v, { shouldDirty: true })
                  }
                />
              </div>
            </div>
          </FormSection>
        </div>

        {/* RIGHT — Sidebar */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <FormSection icon={ShieldCheck} title="Estado" delay={0.15}>
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
                  <ShieldCheck
                    className={`size-4 transition-colors ${
                      activo ? "text-emerald-600" : "text-muted-foreground"
                    }`}
                  />
                </motion.div>
                <div>
                  <p className="text-sm font-medium">Activo</p>
                  <p className="text-[11px] text-muted-foreground">
                    Si está apagado, no se puede usar
                  </p>
                </div>
              </div>
              <Switch
                checked={activo}
                onCheckedChange={(v) => setValue("activo", v, { shouldDirty: true })}
              />
            </div>
          </FormSection>

          <FormSection icon={Tag} title="Vista previa" delay={0.2}>
            <div className="space-y-2 rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 text-center">
              <p className="font-mono text-base font-bold tracking-wide">
                {codigo || "CÓDIGO"}
              </p>
              <p className="text-sm text-muted-foreground">
                {valor && parseFloat(valor) > 0
                  ? tipoDescuento === "porcentaje"
                    ? `${valor}% de descuento`
                    : `$${parseFloat(valor).toLocaleString("es-UY")} de descuento`
                  : "Sin valor configurado"}
              </p>
              {acumulable && (
                <p className="text-[10px] uppercase tracking-wider text-emerald-700">
                  Acumulable con precio socio
                </p>
              )}
            </div>
          </FormSection>
        </div>
      </div>
    </form>
  );
}
