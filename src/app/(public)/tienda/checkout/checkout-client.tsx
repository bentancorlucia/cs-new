"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ShoppingCart,
  Loader2,
  ShieldCheck,
  MapPin,
  AlertCircle,
  Lock,
  Building2,
  Upload,
  FileImage,
  FileText,
  X,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCart } from "@/hooks/use-cart";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  fadeInUp,
  staggerContainer,
  springSmooth,
  pageTransition,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

interface UserProfile {
  nombre: string;
  apellido: string;
  telefono: string | null;
  es_socio: boolean;
}

type MetodoPago = "transferencia";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80"
    >
      {copied ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

export function CheckoutClient() {
  const { items, loaded, total, totalSocio, itemCount, clearCart } = useCart();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [notas, setNotas] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("transferencia");
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [comprobantePreview, setComprobantePreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cargar perfil del usuario
  useEffect(() => {
    async function loadProfile() {
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        // Si no hay sesión, redirigir a login
        window.location.href = `/login?redirect=/tienda/checkout`;
        return;
      }

      const { data } = await supabase
        .from("perfiles")
        .select("nombre, apellido, telefono, es_socio")
        .eq("id", user.id)
        .single();

      setProfile(data as UserProfile | null);
      setLoadingProfile(false);
    }

    loadProfile();
  }, []);

  const esSocio = profile?.es_socio === true;
  const totalFinal = esSocio ? totalSocio : total;
  const descuento = esSocio ? total - totalSocio : 0;

  const handleFileSelect = useCallback((file: File) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      setError("Formato no permitido. Usá JPG, PNG, WebP o PDF.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("El archivo no puede superar 10MB.");
      return;
    }
    setError(null);
    setComprobante(file);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setComprobantePreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setComprobantePreview(null);
    }
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }

  function removeComprobante() {
    setComprobante(null);
    setComprobantePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleCheckout() {
    setSubmitting(true);
    setError(null);

    try {
      // 1. Create order
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            productoId: item.productoId,
            varianteId: item.varianteId,
            cantidad: item.cantidad,
          })),
          notas: notas || undefined,
          metodo_pago: metodoPago,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al procesar el checkout");
        setSubmitting(false);
        return;
      }

      // 2. If transferencia, upload comprobante then redirect
      if (metodoPago === "transferencia") {
        if (comprobante) {
          try {
            const formData = new FormData();
            formData.append("archivo", comprobante);
            formData.append("pedido_id", String(data.pedido_id));

            const uploadRes = await fetch("/api/checkout/comprobante", {
              method: "POST",
              body: formData,
            });

            if (!uploadRes.ok) {
              console.error("Error al subir comprobante:", await uploadRes.text());
            }
          } catch (uploadError) {
            console.error("Error al subir comprobante:", uploadError);
          }
        }

        clearCart();
        window.location.href = `/tienda/pedido/${data.pedido_id}`;
        return;
      }
    } catch {
      setError("Error de conexión. Intentá de nuevo.");
      setSubmitting(false);
    }
  }

  // Loading state
  if (!loaded || loadingProfile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-40 rounded-xl bg-muted" />
          <div className="h-32 rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  // Carrito vacío
  if (items.length === 0) {
    return (
      <motion.div
        {...pageTransition}
        className="mx-auto max-w-3xl px-4 py-20 text-center"
      >
        <ShoppingCart className="mx-auto size-20 text-muted-foreground/20" />
        <h1 className="mt-4 font-display text-2xl font-bold">
          Tu carrito está vacío
        </h1>
        <p className="mt-2 text-muted-foreground">
          Agregá productos desde la tienda para continuar.
        </p>
        <Link href="/tienda" className="mt-6 inline-block">
          <Button size="lg">Ir a la tienda</Button>
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div {...pageTransition} className="mx-auto max-w-4xl px-4 py-6 pb-36 md:pb-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between md:mb-8">
        <div>
          <h1 className="font-display text-xl font-bold md:text-3xl">
            Checkout
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Revisá tu pedido y completá la compra
          </p>
        </div>
        <Link href="/tienda/carrito">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Volver al carrito</span>
            <span className="sm:hidden">Carrito</span>
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:gap-8">
        {/* Left column — Order details */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-4 md:space-y-6"
        >
          {/* Datos de contacto */}
          <motion.div
            variants={fadeInUp}
            className="rounded-2xl border bg-card p-4 md:p-5"
          >
            <h2 className="mb-3 font-heading text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Datos de contacto
            </h2>
            {profile && (
              <div className="space-y-1.5 text-sm">
                <p className="font-medium">
                  {profile.nombre} {profile.apellido}
                </p>
                {profile.telefono && (
                  <p className="text-muted-foreground">{profile.telefono}</p>
                )}
                {esSocio && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-bordo-50 px-3 py-1 text-xs font-medium text-bordo-800"
                  >
                    <ShieldCheck className="size-3.5" />
                    Socio — precios especiales aplicados
                  </motion.span>
                )}
              </div>
            )}
          </motion.div>

          {/* Método de retiro */}
          <motion.div
            variants={fadeInUp}
            className="rounded-2xl border bg-card p-4 md:p-5"
          >
            <h2 className="mb-3 font-heading text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Retiro
            </h2>
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bordo-50">
                <MapPin className="size-5 text-bordo-800" />
              </div>
              <div className="text-sm">
                <p className="font-medium">Retiro en el club</p>
                <p className="text-muted-foreground">
                  Soriano 1472, Montevideo — Martes, Jueves y Viernes de 12:30 a 15:30 hs.
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Te notificaremos cuando tu pedido esté listo para retirar.
            </p>
          </motion.div>

          {/* Items del pedido */}
          <motion.div
            variants={fadeInUp}
            className="rounded-2xl border bg-card p-4 md:p-5"
          >
            <h2 className="mb-3 font-heading text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Tu pedido ({itemCount} {itemCount === 1 ? "producto" : "productos"})
            </h2>

            <div className="divide-y divide-linea/50">
              {items.map((item) => {
                const key = `${item.productoId}-${item.varianteId ?? ""}`;
                const precioItem = esSocio && item.precioSocio
                  ? item.precioSocio
                  : item.precio;
                return (
                  <div key={key} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted sm:size-18">
                      {item.imagenUrl ? (
                        <Image
                          src={item.imagenUrl}
                          alt={item.nombre}
                          fill
                          className="object-cover"
                          sizes="72px"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ShoppingCart className="size-5 opacity-20" />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-1 items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{item.nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.cantidad} &times; $
                          {precioItem.toLocaleString("es-UY")}
                        </p>
                      </div>
                      <span className="text-sm font-bold">
                        ${(precioItem * item.cantidad).toLocaleString("es-UY")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Método de pago */}
          <motion.div
            variants={fadeInUp}
            className="rounded-2xl border bg-card p-4 md:p-5"
          >
            <h2 className="mb-3 font-heading text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Método de pago
            </h2>
            <div className="flex items-center gap-3 rounded-xl border-2 border-bordo-800 bg-bordo-50 p-4 shadow-sm">
              <Building2 className="size-6 text-bordo-800" />
              <div>
                <p className="text-sm font-medium text-bordo-900">
                  Transferencia bancaria
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Único método de pago disponible por el momento
                </p>
              </div>
            </div>
          </motion.div>

          {/* Panel datos bancarios + Upload (solo transferencia) */}
          <AnimatePresence>
            {metodoPago === "transferencia" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={springSmooth}
                className="space-y-4 overflow-hidden"
              >
                {/* Datos bancarios */}
                <div className="rounded-2xl border border-bordo-200 bg-bordo-50 p-4 md:p-5">
                  <h2 className="mb-3 font-heading text-xs font-bold uppercase tracking-wider text-bordo-900">
                    Datos para la transferencia
                  </h2>
                  <div className="space-y-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-bordo-800/70">Banco</p>
                        <p className="font-medium text-bordo-900">ITAU</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-bordo-800/70">Cuenta</p>
                        <p className="font-mono font-bold text-bordo-900">9500100</p>
                      </div>
                      <CopyButton text="9500100" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-bordo-800/70">Titular</p>
                        <p className="font-medium text-bordo-900">Club Seminario</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Upload comprobante */}
                <div className="rounded-2xl border bg-card p-4 md:p-5">
                  <h2 className="mb-3 font-heading text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Comprobante de transferencia
                    <span className="ml-1 text-destructive">*</span>
                  </h2>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                  />

                  <AnimatePresence mode="wait">
                    {comprobante ? (
                      <motion.div
                        key="preview"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="relative rounded-xl border bg-superficie p-3"
                      >
                        <button
                          onClick={removeComprobante}
                          className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-white shadow-sm transition-colors hover:bg-red-50"
                        >
                          <X className="size-4 text-muted-foreground" />
                        </button>

                        {comprobantePreview ? (
                          <div className="relative mx-auto h-48 w-full overflow-hidden rounded-lg">
                            <Image
                              src={comprobantePreview}
                              alt="Comprobante"
                              fill
                              className="object-contain"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 py-2">
                            <FileText className="size-10 text-bordo-800" />
                            <div>
                              <p className="text-sm font-medium">{comprobante.name}</p>
                              <p className="text-xs text-muted-foreground">
                                PDF · {(comprobante.size / 1024).toFixed(0)} KB
                              </p>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div
                        key="dropzone"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={cn(
                          "flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 transition-all",
                          dragOver
                            ? "border-bordo-800 bg-bordo-50"
                            : "border-linea hover:border-bordo-800/50 hover:bg-superficie"
                        )}
                      >
                        <motion.div
                          animate={dragOver ? { scale: 1.1 } : { scale: 1 }}
                          className="flex size-12 items-center justify-center rounded-full bg-superficie"
                        >
                          <Upload className={cn(
                            "size-6",
                            dragOver ? "text-bordo-800" : "text-muted-foreground"
                          )} />
                        </motion.div>
                        <div className="text-center">
                          <p className="text-sm font-medium">
                            Arrastrá tu comprobante o <span className="text-bordo-800">buscá en tus archivos</span>
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            JPG, PNG, WebP o PDF — Máx. 10MB
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Notas */}
          <motion.div
            variants={fadeInUp}
            className="rounded-2xl border bg-card p-4 md:p-5"
          >
            <Label
              htmlFor="notas"
              className="mb-2 block font-heading text-xs font-bold uppercase tracking-wider text-muted-foreground"
            >
              Nota (opcional)
            </Label>
            <Textarea
              id="notas"
              placeholder="Ej: Talle para mi hijo de 12 años..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              maxLength={500}
              className="resize-none"
              rows={3}
            />
          </motion.div>
        </motion.div>

        {/* Right column — Summary + pay button — desktop */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="hidden h-fit space-y-4 lg:sticky lg:top-24 lg:block"
        >
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="mb-4 text-lg font-bold">Resumen del pedido</h2>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>${total.toLocaleString("es-UY")}</span>
              </div>
              {descuento > 0 && (
                <div className="flex justify-between text-bordo-800">
                  <span>Descuento socio</span>
                  <span>-${descuento.toLocaleString("es-UY")}</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Envío</span>
                <span>Retiro en club</span>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="flex justify-between text-xl font-bold">
              <span>Total</span>
              <motion.span
                key={totalFinal}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={springSmooth}
              >
                ${totalFinal.toLocaleString("es-UY")}
              </motion.span>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div whileTap={{ scale: 0.97 }}>
              <Button
                size="lg"
                className="mt-5 w-full gap-2"
                onClick={handleCheckout}
                disabled={submitting || (metodoPago === "transferencia" && !comprobante)}
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <Building2 className="size-4" />
                    Confirmar pedido
                  </>
                )}
              </Button>
            </motion.div>

            <p className="mt-3 text-center text-xs text-muted-foreground">
              Tu pedido quedará pendiente de verificación hasta confirmar la transferencia.
            </p>
          </div>

          {/* Trust badges */}
          <div className="rounded-2xl border bg-card p-4">
            <div className="flex flex-col gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Building2 className="size-4 text-bordo-800" />
                Transferencia a ITAU · Cuenta 9500100
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="size-4 text-bordo-800" />
                Retirá en el club cuando esté listo
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Mobile sticky pay bar */}
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={springSmooth}
        className="fixed inset-x-0 bottom-0 z-50 border-t border-linea bg-white/95 backdrop-blur-lg lg:hidden"
      >
        <div className="px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          {/* Error inline */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-2 flex items-start gap-2 rounded-xl bg-destructive/10 p-2.5 text-xs text-destructive"
              >
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3" />
              Pago seguro
            </div>
            <motion.span
              key={totalFinal}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={springSmooth}
              className="text-xl font-bold"
            >
              ${totalFinal.toLocaleString("es-UY")}
            </motion.span>
          </div>

          <motion.div whileTap={{ scale: 0.97 }}>
            <Button
              size="lg"
              className="w-full gap-2 text-base"
              onClick={handleCheckout}
              disabled={submitting || (metodoPago === "transferencia" && !comprobante)}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <Building2 className="size-5" />
                  Confirmar pedido
                </>
              )}
            </Button>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
