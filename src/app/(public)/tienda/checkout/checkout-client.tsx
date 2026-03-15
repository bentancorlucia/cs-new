"use client";

import { useState, useEffect } from "react";
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

interface UserProfile {
  nombre: string;
  apellido: string;
  telefono: string | null;
  es_socio: boolean;
}

export function CheckoutClient() {
  const { items, loaded, total, totalSocio, itemCount, clearCart } = useCart();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [notas, setNotas] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al procesar el checkout");
        setSubmitting(false);
        return;
      }

      // Limpiar carrito y redirigir a MercadoPago
      clearCart();
      window.location.href = data.checkout_url;
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
    <motion.div {...pageTransition} className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold md:text-3xl">
            Checkout
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Revisá tu pedido y completá la compra
          </p>
        </div>
        <Link href="/tienda/carrito">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4" />
            Volver al carrito
          </Button>
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* Left column — Order details */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          {/* Datos de contacto */}
          <motion.div
            variants={fadeInUp}
            className="rounded-xl border bg-card p-5"
          >
            <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-wider text-muted-foreground">
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
                  <span className="inline-flex items-center gap-1 rounded-full bg-bordo-50 px-2.5 py-0.5 text-xs font-medium text-bordo-800">
                    <ShieldCheck className="size-3" />
                    Socio — precios especiales aplicados
                  </span>
                )}
              </div>
            )}
          </motion.div>

          {/* Método de retiro */}
          <motion.div
            variants={fadeInUp}
            className="rounded-xl border bg-card p-5"
          >
            <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Retiro
            </h2>
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 size-5 text-bordo-800" />
              <div className="text-sm">
                <p className="font-medium">Retiro en el club</p>
                <p className="text-muted-foreground">
                  Te notificaremos cuando tu pedido esté listo para retirar.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Items del pedido */}
          <motion.div
            variants={fadeInUp}
            className="rounded-xl border bg-card p-5"
          >
            <h2 className="mb-4 font-heading text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Tu pedido ({itemCount} {itemCount === 1 ? "producto" : "productos"})
            </h2>

            <div className="divide-y">
              {items.map((item) => {
                const key = `${item.productoId}-${item.varianteId ?? ""}`;
                const precioItem = esSocio && item.precioSocio
                  ? item.precioSocio
                  : item.precio;
                return (
                  <div key={key} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {item.imagenUrl ? (
                        <Image
                          src={item.imagenUrl}
                          alt={item.nombre}
                          fill
                          className="object-cover"
                          sizes="64px"
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
                          Cant: {item.cantidad} &times; $
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

          {/* Notas */}
          <motion.div
            variants={fadeInUp}
            className="rounded-xl border bg-card p-5"
          >
            <Label
              htmlFor="notas"
              className="mb-2 block font-heading text-sm font-bold uppercase tracking-wider text-muted-foreground"
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

        {/* Right column — Summary + pay button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="h-fit space-y-4 lg:sticky lg:top-24"
        >
          <div className="rounded-xl border bg-card p-5">
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
                  className="mt-4 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              size="lg"
              className="mt-5 w-full gap-2"
              onClick={handleCheckout}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" />
                  Pagar con MercadoPago
                </>
              )}
            </Button>

            <p className="mt-3 text-center text-xs text-muted-foreground">
              Serás redirigido a MercadoPago para completar el pago de forma
              segura.
            </p>
          </div>

          {/* Trust badges */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex flex-col gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-green-600" />
                Pago seguro con MercadoPago
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="size-4 text-bordo-800" />
                Retirá en el club cuando esté listo
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
