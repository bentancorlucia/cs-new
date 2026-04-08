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
  Building2,
  Upload,
  FileText,
  X,
  Copy,
  Check,
  ArrowRight,
  Package,
} from "lucide-react";
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
      className="inline-flex items-center gap-1 bg-bordo-800/10 px-2 py-1 text-[10px] font-heading uppercase tracking-editorial text-bordo-800 transition-colors hover:bg-bordo-800/20"
    >
      {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
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
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-superficie" />
          <div className="h-40 bg-superficie" />
          <div className="h-32 bg-superficie" />
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
        <Package className="mx-auto size-20 text-bordo-800/15" />
        <h1 className="mt-4 font-display text-title-2 uppercase tracking-tightest text-bordo-950">
          Tu carrito está vacío
        </h1>
        <p className="mt-2 text-sm text-bordo-800/40">
          Agregá productos desde la tienda para continuar.
        </p>
        <Link href="/tienda" className="mt-6 inline-block">
          <motion.button
            whileTap={{ scale: 0.97 }}
            className="bg-bordo-800 text-white px-6 py-3 font-heading text-[11px] uppercase tracking-editorial hover:bg-bordo-900 transition-colors"
          >
            Ir a la tienda
          </motion.button>
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div {...pageTransition} className="mx-auto max-w-4xl px-0 sm:px-4 py-0 sm:py-6 pb-48 md:pb-8">
      {/* Header */}
      <div className="flex items-end justify-between border-b-2 border-bordo-800/10 px-4 sm:px-0 py-5 sm:py-6">
        <div>
          <span className="font-heading text-[10px] uppercase tracking-editorial text-bordo-800/50 block mb-1">
            Finalizar compra
          </span>
          <h1 className="font-display text-title-2 sm:text-title-1 uppercase tracking-tightest text-bordo-950 leading-none">
            Checkout
          </h1>
        </div>
        <Link
          href="/tienda/carrito"
          className="flex items-center gap-1.5 font-heading text-[11px] uppercase tracking-editorial text-bordo-800 hover:text-bordo-950 transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Carrito
        </Link>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1fr_380px] lg:gap-8">
        {/* Left column — Order details */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-0"
        >
          {/* Datos de contacto */}
          <motion.div
            variants={fadeInUp}
            className="border-b border-bordo-800/8 px-4 sm:px-0 py-5"
          >
            <h2 className="mb-3 font-heading text-[10px] font-bold uppercase tracking-editorial text-bordo-800/50">
              Datos de contacto
            </h2>
            {profile && (
              <div className="space-y-1.5">
                <p className="font-display text-sm uppercase tracking-tight text-bordo-950">
                  {profile.nombre} {profile.apellido}
                </p>
                {profile.telefono && (
                  <p className="text-sm text-bordo-800/50">{profile.telefono}</p>
                )}
                {esSocio && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="inline-flex items-center gap-1.5 bg-bordo-800 px-3 py-1 text-[10px] font-heading uppercase tracking-editorial text-dorado-300"
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
            className="border-b border-bordo-800/8 px-4 sm:px-0 py-5"
          >
            <h2 className="mb-3 font-heading text-[10px] font-bold uppercase tracking-editorial text-bordo-800/50">
              Retiro
            </h2>
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center bg-bordo-800/5">
                <MapPin className="size-4 text-bordo-800" />
              </div>
              <div>
                <p className="text-sm font-medium text-bordo-950">Retiro en el club</p>
                <p className="text-xs text-bordo-800/50 mt-0.5">
                  Soriano 1472, Montevideo — Martes, Jueves y Viernes de 12:30 a 15:30 hs.
                </p>
                <p className="mt-1.5 font-heading text-[10px] uppercase tracking-editorial text-bordo-800/40">
                  Te notificaremos cuando tu pedido esté listo
                </p>
              </div>
            </div>
          </motion.div>

          {/* Items del pedido */}
          <motion.div
            variants={fadeInUp}
            className="border-b border-bordo-800/8 px-4 sm:px-0 py-5"
          >
            <h2 className="mb-3 font-heading text-[10px] font-bold uppercase tracking-editorial text-bordo-800/50">
              Tu pedido · {itemCount} {itemCount === 1 ? "producto" : "productos"}
            </h2>

            <div className="space-y-0 divide-y divide-bordo-800/5">
              {items.map((item) => {
                const key = `${item.productoId}-${item.varianteId ?? ""}`;
                const precioItem = esSocio && item.precioSocio
                  ? item.precioSocio
                  : item.precio;
                return (
                  <div key={key} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="relative size-16 sm:size-18 shrink-0 overflow-hidden bg-superficie border border-bordo-800/5">
                      {item.imagenUrl ? (
                        <Image
                          src={item.imagenUrl}
                          alt={item.nombre}
                          fill
                          className="object-cover mix-blend-multiply"
                          sizes="72px"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ShoppingCart className="size-5 text-bordo-800/15" />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
                      <div className="min-w-0">
                        <p className="font-display text-sm uppercase leading-tight text-bordo-950 truncate">
                          {item.nombre}
                        </p>
                        <p className="text-[11px] text-bordo-800/40 mt-0.5">
                          {item.cantidad} &times; $
                          {precioItem.toLocaleString("es-UY")}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-bordo-950 shrink-0">
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
            className="border-b border-bordo-800/8 px-4 sm:px-0 py-5"
          >
            <h2 className="mb-3 font-heading text-[10px] font-bold uppercase tracking-editorial text-bordo-800/50">
              Método de pago
            </h2>
            <div className="flex items-center gap-3 border-2 border-bordo-800 bg-bordo-800/5 p-4">
              <Building2 className="size-5 text-bordo-800" />
              <div>
                <p className="text-sm font-medium text-bordo-950">
                  Transferencia bancaria
                </p>
                <p className="text-[11px] text-bordo-800/40">
                  Único método disponible
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
                className="overflow-hidden"
              >
                {/* Datos bancarios */}
                <div className="border-b border-bordo-800/8 px-4 sm:px-0 py-5">
                  <h2 className="mb-3 font-heading text-[10px] font-bold uppercase tracking-editorial text-bordo-800">
                    Datos para la transferencia
                  </h2>
                  <div className="bg-bordo-800/5 border border-bordo-800/10 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-heading text-[10px] uppercase tracking-editorial text-bordo-800/50">Banco</p>
                        <p className="text-sm font-medium text-bordo-950">ITAU</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-heading text-[10px] uppercase tracking-editorial text-bordo-800/50">Cuenta</p>
                        <p className="font-mono font-bold text-bordo-950">9500100</p>
                      </div>
                      <CopyButton text="9500100" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-heading text-[10px] uppercase tracking-editorial text-bordo-800/50">Titular</p>
                        <p className="text-sm font-medium text-bordo-950">Club Seminario</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-heading text-[10px] uppercase tracking-editorial text-bordo-800/50">Referencia</p>
                        <p className="font-mono font-bold text-bordo-950">
                          {profile ? `${profile.nombre} ${profile.apellido}` : "Nombre Apellido"}
                        </p>
                      </div>
                      <CopyButton text={profile ? `${profile.nombre} ${profile.apellido}` : ""} />
                    </div>
                  </div>
                </div>

                {/* Upload comprobante */}
                <div className="border-b border-bordo-800/8 px-4 sm:px-0 py-5">
                  <h2 className="mb-3 font-heading text-[10px] font-bold uppercase tracking-editorial text-bordo-800/50">
                    Comprobante de transferencia
                    <span className="ml-1 text-red-600">*</span>
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
                        className="relative border border-bordo-800/10 bg-superficie p-3"
                      >
                        <button
                          onClick={removeComprobante}
                          className="absolute right-2 top-2 flex size-7 items-center justify-center bg-white border border-bordo-800/10 shadow-sm transition-colors hover:bg-red-50"
                        >
                          <X className="size-4 text-bordo-800/50" />
                        </button>

                        {comprobantePreview ? (
                          <div className="relative mx-auto h-48 w-full overflow-hidden">
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
                              <p className="text-sm font-medium text-bordo-950">{comprobante.name}</p>
                              <p className="text-[11px] text-bordo-800/40">
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
                          "flex cursor-pointer flex-col items-center gap-3 border-2 border-dashed p-8 transition-all",
                          dragOver
                            ? "border-bordo-800 bg-bordo-800/5"
                            : "border-bordo-800/15 hover:border-bordo-800/40 hover:bg-superficie"
                        )}
                      >
                        <motion.div
                          animate={dragOver ? { scale: 1.1 } : { scale: 1 }}
                          className="flex size-12 items-center justify-center bg-superficie"
                        >
                          <Upload className={cn(
                            "size-6",
                            dragOver ? "text-bordo-800" : "text-bordo-800/30"
                          )} />
                        </motion.div>
                        <div className="text-center">
                          <p className="text-sm font-medium text-bordo-950">
                            Arrastrá tu comprobante o <span className="text-bordo-800 underline underline-offset-2">buscá en tus archivos</span>
                          </p>
                          <p className="mt-1 font-heading text-[10px] uppercase tracking-editorial text-bordo-800/40">
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
            className="border-b border-bordo-800/8 px-4 sm:px-0 py-5"
          >
            <Label
              htmlFor="notas"
              className="mb-2 block font-heading text-[10px] font-bold uppercase tracking-editorial text-bordo-800/50"
            >
              Nota (opcional)
            </Label>
            <Textarea
              id="notas"
              placeholder="Ej: Talle para mi hijo de 12 años..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              maxLength={500}
              className="resize-none border-bordo-800/15 bg-transparent focus:border-bordo-800 focus:ring-bordo-800/20"
              rows={3}
            />
          </motion.div>
        </motion.div>

        {/* Right column — Summary + pay button — desktop */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="hidden h-fit space-y-4 lg:sticky lg:top-24 lg:block lg:mt-5"
        >
          <div className="border border-bordo-800/10 bg-white p-6">
            <h2 className="font-display text-lg uppercase tracking-tightest text-bordo-950 mb-5">
              Resumen del pedido
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-bordo-800/50">Subtotal</span>
                <span className="text-bordo-950">${total.toLocaleString("es-UY")}</span>
              </div>
              {descuento > 0 && (
                <div className="flex justify-between text-bordo-800">
                  <span>Descuento socio</span>
                  <span className="font-bold">-${descuento.toLocaleString("es-UY")}</span>
                </div>
              )}
              <div className="flex justify-between text-bordo-800/40">
                <span>Envío</span>
                <span className="font-heading text-[10px] uppercase tracking-editorial">
                  Retiro en club
                </span>
              </div>
            </div>

            <div className="my-5 h-px bg-bordo-800/10" />

            <div className="flex justify-between items-baseline">
              <span className="font-display text-sm uppercase tracking-tightest text-bordo-950">
                Total
              </span>
              <motion.span
                key={totalFinal}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={springSmooth}
                className="font-display text-2xl text-bordo-950 font-medium tracking-tight"
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
                  className="mt-4 flex items-start gap-2 bg-red-50 border border-red-200 p-3 text-sm text-red-700"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleCheckout}
              disabled={submitting || (metodoPago === "transferencia" && !comprobante)}
              className="mt-5 w-full flex items-center justify-center gap-2 bg-bordo-800 text-white py-3.5 font-heading text-xs uppercase tracking-editorial hover:bg-bordo-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            </motion.button>

            <p className="mt-3 text-center font-heading text-[10px] uppercase tracking-editorial text-bordo-800/40">
              Pedido pendiente hasta verificar transferencia
            </p>
          </div>

          {/* Trust badges */}
          <div className="border border-bordo-800/10 bg-white p-4">
            <div className="flex flex-col gap-3 font-heading text-[10px] uppercase tracking-editorial text-bordo-800/50">
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
        className="fixed inset-x-0 bottom-0 z-50 lg:hidden"
      >
        <div className="pointer-events-none h-4 bg-gradient-to-t from-bordo-950/15 to-transparent" />
        <div className="bg-bordo-800 border-t-2 border-dorado-300/20 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          {/* Error inline */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-2 flex items-start gap-2 bg-red-900/30 border border-red-400/30 p-2.5 text-xs text-red-200"
              >
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Summary row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex flex-col">
              <span className="font-heading text-[10px] uppercase tracking-editorial text-dorado-300/70">
                {itemCount} {itemCount === 1 ? "producto" : "productos"}
              </span>
              {descuento > 0 && (
                <span className="font-heading text-[10px] uppercase tracking-editorial text-dorado-300/50">
                  Ahorrás ${descuento.toLocaleString("es-UY")}
                </span>
              )}
            </div>
            <motion.span
              key={totalFinal}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={springSmooth}
              className="text-2xl font-bold text-white font-body"
            >
              ${totalFinal.toLocaleString("es-UY")}
            </motion.span>
          </div>

          {/* CTA */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleCheckout}
            disabled={submitting || (metodoPago === "transferencia" && !comprobante)}
            className="w-full flex items-center justify-center gap-2 bg-dorado-300 text-bordo-950 py-3.5 font-heading text-xs uppercase tracking-editorial font-bold disabled:opacity-50 disabled:cursor-not-allowed"
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
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
