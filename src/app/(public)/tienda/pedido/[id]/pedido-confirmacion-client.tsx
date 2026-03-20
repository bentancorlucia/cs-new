"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Package,
  ArrowRight,
  ShoppingCart,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  fadeInUp,
  staggerContainer,
  springBouncy,
  pageTransition,
} from "@/lib/motion";

interface PedidoItem {
  id: number;
  nombre: string;
  variante: string | null;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

interface Pedido {
  id: number;
  numero_pedido: string;
  estado: string;
  subtotal: number;
  descuento: number;
  total: number;
  metodo_pago: string | null;
  notas: string | null;
  created_at: string;
  items: PedidoItem[];
}

interface Props {
  pedido: Pedido;
  paymentStatus: string | null;
}

const ESTADO_CONFIG: Record<
  string,
  { icon: typeof CheckCircle2; color: string; label: string; bg: string }
> = {
  pagado: {
    icon: CheckCircle2,
    color: "text-green-600",
    label: "Pago confirmado",
    bg: "bg-green-50",
  },
  pendiente: {
    icon: Clock,
    color: "text-amber-600",
    label: "Pago pendiente",
    bg: "bg-amber-50",
  },
  preparando: {
    icon: Package,
    color: "text-blue-600",
    label: "Preparando tu pedido",
    bg: "bg-blue-50",
  },
  listo_retiro: {
    icon: MapPin,
    color: "text-bordo-800",
    label: "Listo para retirar",
    bg: "bg-bordo-50",
  },
  retirado: {
    icon: CheckCircle2,
    color: "text-green-600",
    label: "Retirado",
    bg: "bg-green-50",
  },
  pendiente_verificacion: {
    icon: Clock,
    color: "text-amber-600",
    label: "Verificación pendiente",
    bg: "bg-amber-50",
  },
  cancelado: {
    icon: XCircle,
    color: "text-destructive",
    label: "Cancelado",
    bg: "bg-destructive/10",
  },
};

function SuccessAnimation() {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ ...springBouncy, delay: 0.2 }}
      className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-green-100"
    >
      <motion.div
        initial={{ scale: 0, rotate: -45 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ ...springBouncy, delay: 0.5 }}
      >
        <CheckCircle2 className="size-10 text-green-600" />
      </motion.div>
    </motion.div>
  );
}

function PendingAnimation() {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ ...springBouncy, delay: 0.2 }}
      className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-amber-100"
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      >
        <Clock className="size-10 text-amber-600" />
      </motion.div>
    </motion.div>
  );
}

function FailureAnimation() {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ ...springBouncy, delay: 0.2 }}
      className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-red-100"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ ...springBouncy, delay: 0.5 }}
      >
        <XCircle className="size-10 text-destructive" />
      </motion.div>
    </motion.div>
  );
}

export function PedidoConfirmacionClient({ pedido, paymentStatus }: Props) {
  const [showConfetti, setShowConfetti] = useState(false);
  const isApproved =
    paymentStatus === "approved" || pedido.estado === "pagado";
  const isPending =
    paymentStatus === "pending" || pedido.estado === "pendiente";
  const isPendingVerification = pedido.estado === "pendiente_verificacion";
  const isFailed =
    paymentStatus === "failure" || pedido.estado === "cancelado";

  const estadoConfig =
    ESTADO_CONFIG[pedido.estado] || ESTADO_CONFIG.pendiente;
  const StatusIcon = estadoConfig.icon;

  useEffect(() => {
    if (isApproved) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isApproved]);

  return (
    <motion.div
      {...pageTransition}
      className="mx-auto max-w-2xl px-4 py-12"
    >
      {/* Confetti particles */}
      <AnimatePresence>
        {showConfetti && (
          <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
            {Array.from({ length: 40 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{
                  x: "50vw",
                  y: "40vh",
                  scale: 0,
                  rotate: 0,
                }}
                animate={{
                  x: `${Math.random() * 100}vw`,
                  y: `${Math.random() * 100}vh`,
                  scale: [0, 1, 0.5],
                  rotate: Math.random() * 720 - 360,
                }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 1.5 + Math.random(),
                  ease: "easeOut",
                }}
                className="absolute size-3 rounded-sm"
                style={{
                  backgroundColor: [
                    "#730d32",
                    "#f7b643",
                    "#22c55e",
                    "#3b82f6",
                    "#eab308",
                    "#ec4899",
                  ][i % 6],
                }}
              />
            ))}
          </div>
        )}
      </AnimatePresence>

      <div className="text-center">
        {/* Status animation */}
        {isApproved && <SuccessAnimation />}
        {(isPending || isPendingVerification) && !isFailed && <PendingAnimation />}
        {isFailed && <FailureAnimation />}

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="font-display text-2xl font-bold md:text-3xl"
        >
          {isApproved && "Pago confirmado"}
          {isPendingVerification && "Transferencia recibida"}
          {isPending && !isFailed && !isPendingVerification && "Pago pendiente"}
          {isFailed && "Pago no procesado"}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-2 text-muted-foreground"
        >
          {isApproved &&
            "Tu pedido fue registrado correctamente. Te notificaremos cuando esté listo para retirar."}
          {isPendingVerification &&
            "Tu transferencia fue recibida y está siendo verificada. Te notificaremos cuando se confirme el pago."}
          {isPending &&
            !isFailed &&
            !isPendingVerification &&
            "Estamos esperando la confirmación de tu pago. Actualizaremos el estado automáticamente."}
          {isFailed &&
            "Hubo un problema con tu pago. Podés intentar nuevamente desde el carrito."}
        </motion.p>
      </div>

      {/* Pedido details */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="mt-10 space-y-5"
      >
        {/* Número de pedido + estado */}
        <motion.div
          variants={fadeInUp}
          className="rounded-xl border bg-card p-5"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-heading text-xs uppercase tracking-wider text-muted-foreground">
                Número de pedido
              </p>
              <p className="mt-0.5 font-display text-xl font-bold tracking-tight">
                {pedido.numero_pedido}
              </p>
            </div>
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${estadoConfig.bg} ${estadoConfig.color}`}
            >
              <StatusIcon className="size-3.5" />
              {estadoConfig.label}
            </div>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            {new Date(pedido.created_at).toLocaleDateString("es-UY", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </motion.div>

        {/* Items */}
        <motion.div
          variants={fadeInUp}
          className="rounded-xl border bg-card p-5"
        >
          <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Detalle
          </h2>

          <div className="divide-y">
            {pedido.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-2.5 text-sm first:pt-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">{item.nombre}</p>
                  {item.variante && (
                    <p className="text-xs text-muted-foreground">
                      {item.variante}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {item.cantidad} &times; $
                    {item.precioUnitario.toLocaleString("es-UY")}
                  </p>
                </div>
                <span className="font-bold">
                  ${item.subtotal.toLocaleString("es-UY")}
                </span>
              </div>
            ))}
          </div>

          <Separator className="my-3" />

          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>${pedido.subtotal.toLocaleString("es-UY")}</span>
            </div>
            {pedido.descuento > 0 && (
              <div className="flex justify-between text-bordo-800">
                <span>Descuento socio</span>
                <span>-${pedido.descuento.toLocaleString("es-UY")}</span>
              </div>
            )}
          </div>

          <Separator className="my-3" />

          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span>${pedido.total.toLocaleString("es-UY")}</span>
          </div>
        </motion.div>

        {/* Retiro info */}
        {isApproved && (
          <motion.div
            variants={fadeInUp}
            className="flex items-start gap-3 rounded-xl border border-bordo-200 bg-bordo-50 p-4"
          >
            <MapPin className="mt-0.5 size-5 text-bordo-800" />
            <div className="text-sm">
              <p className="font-medium text-bordo-900">
                Retirá en el club
              </p>
              <p className="text-bordo-800/70">
                Soriano 1472, Montevideo — Martes, Jueves y Viernes de 12:30 a 15:30 hs.
                Te enviaremos una notificación cuando esté listo. Presentá tu número de pedido.
              </p>
            </div>
          </motion.div>
        )}

        {pedido.notas && (
          <motion.div
            variants={fadeInUp}
            className="rounded-xl border bg-card p-4"
          >
            <p className="font-heading text-xs uppercase tracking-wider text-muted-foreground">
              Nota
            </p>
            <p className="mt-1 text-sm">{pedido.notas}</p>
          </motion.div>
        )}
      </motion.div>

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="mt-8 flex flex-wrap justify-center gap-3"
      >
        {isFailed && (
          <Link href="/tienda/carrito">
            <Button size="lg" className="gap-2">
              <ShoppingCart className="size-4" />
              Volver al carrito
            </Button>
          </Link>
        )}
        <Link href="/tienda">
          <Button variant={isFailed ? "outline" : "default"} size="lg" className="gap-2">
            Seguir comprando
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      </motion.div>
    </motion.div>
  );
}
