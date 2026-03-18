"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Package,
  User,
  Phone,
  CreditCard,
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  ArrowRight,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { fadeInUp, staggerContainer, springSmooth } from "@/lib/motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type EstadoPedido = "pendiente" | "pagado" | "preparando" | "listo_retiro" | "retirado" | "cancelado";

const estadoSteps: { estado: EstadoPedido; label: string; icon: any }[] = [
  { estado: "pendiente", label: "Pendiente", icon: Clock },
  { estado: "pagado", label: "Pagado", icon: CreditCard },
  { estado: "preparando", label: "Preparando", icon: Package },
  { estado: "listo_retiro", label: "Listo para retiro", icon: Truck },
  { estado: "retirado", label: "Retirado", icon: CheckCircle },
];

const nextEstado: Record<string, EstadoPedido> = {
  pagado: "preparando",
  preparando: "listo_retiro",
  listo_retiro: "retirado",
};

const nextLabel: Record<string, string> = {
  pagado: "Marcar como Preparando",
  preparando: "Marcar como Listo para retiro",
  listo_retiro: "Marcar como Retirado",
};

export default function DetallePedidoPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [pedido, setPedido] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    async function loadPedido() {
      try {
        const res = await fetch(`/api/admin/pedidos/${id}`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        setPedido(json.data);
      } catch {
        setPedido(null);
      } finally {
        setLoading(false);
      }
    }
    loadPedido();
  }, [id]);

  async function updateEstado(nuevoEstado: EstadoPedido, motivoCancelacion?: string) {
    setUpdating(true);
    const res = await fetch(`/api/admin/pedidos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: nuevoEstado, motivo_cancelacion: motivoCancelacion }),
    });

    if (res.ok) {
      const { data } = await res.json();
      setPedido((prev: any) => ({ ...prev, estado: data.estado }));
      toast.success(`Estado actualizado a: ${nuevoEstado.replace("_", " ")}`);
      setCancelDialog(false);
    } else {
      toast.error("Error al actualizar estado");
    }
    setUpdating(false);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 pt-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="mx-auto max-w-2xl pt-8 text-center">
        <Package className="mx-auto mb-3 size-12 opacity-15" />
        <p className="text-muted-foreground">Pedido no encontrado</p>
        <Link href="/admin/pedidos">
          <Button variant="outline" className="mt-4">Volver a pedidos</Button>
        </Link>
      </div>
    );
  }

  const estadoActualIdx = estadoSteps.findIndex((s) => s.estado === pedido.estado);
  const cancelado = pedido.estado === "cancelado";
  const completado = pedido.estado === "retirado";
  const next = nextEstado[pedido.estado as string];

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="mx-auto max-w-2xl"
    >
      {/* Back + number */}
      <motion.div variants={fadeInUp} className="mb-6">
        <Link
          href="/admin/pedidos"
          className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3" />
          Pedidos
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-xl sm:text-2xl uppercase tracking-tightest">
              {pedido.numero_pedido}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(pedido.created_at).toLocaleDateString("es-UY", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] uppercase">
              {pedido.tipo}
            </Badge>
          </div>
        </div>
      </motion.div>

      {/* Timeline stepper */}
      <motion.div variants={fadeInUp} className="mb-5 rounded-xl border border-linea bg-white p-4 sm:p-5">
        {cancelado ? (
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-red-100">
              <XCircle className="size-5 text-red-600" />
            </div>
            <div>
              <p className="font-medium text-red-600">Pedido cancelado</p>
              {pedido.notas && (
                <p className="text-xs text-muted-foreground mt-0.5">{pedido.notas}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start">
            {estadoSteps.map((step, i) => {
              const isPast = i < estadoActualIdx;
              const isCurrent = i === estadoActualIdx;
              const Icon = step.icon;

              return (
                <div key={step.estado} className="flex flex-1 items-start">
                  <div className="flex flex-col items-center gap-1.5 w-full">
                    <div
                      className={cn(
                        "relative flex size-9 sm:size-10 items-center justify-center rounded-full transition-all duration-300",
                        isPast && "bg-bordo-800",
                        isCurrent && "bg-bordo-800 shadow-md ring-2 ring-bordo-800/20 scale-110",
                        !isPast && !isCurrent && "bg-superficie",
                      )}
                    >
                      {isPast ? (
                        <Check className="size-4 text-white" />
                      ) : (
                        <Icon className={cn(
                          "size-4",
                          isCurrent ? "text-white" : "text-muted-foreground"
                        )} />
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-[10px] sm:text-[11px] text-center leading-tight",
                        isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                  {i < estadoSteps.length - 1 && (
                    <div className="relative mt-[18px] sm:mt-5 h-0.5 flex-1 mx-1 sm:mx-2 rounded-full overflow-hidden bg-superficie">
                      <div
                        className={cn(
                          "absolute inset-0 origin-left bg-bordo-800 transition-transform duration-500",
                          isPast ? "scale-x-100" : "scale-x-0"
                        )}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Main action button */}
      {!cancelado && !completado && next && (
        <motion.div variants={fadeInUp} className="mb-5">
          <Button
            size="lg"
            onClick={() => updateEstado(next)}
            disabled={updating}
            className="w-full h-12 gap-2 text-sm font-medium"
          >
            {updating ? (
              <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                {nextLabel[pedido.estado]}
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </motion.div>
      )}

      {/* Client + products in a 2-section card */}
      <motion.div variants={fadeInUp} className="mb-5 rounded-xl border border-linea bg-white overflow-hidden">
        {/* Client */}
        <div className="p-4 sm:p-5">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2.5">Cliente</h2>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-full bg-superficie">
                <User className="size-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {pedido.perfiles
                    ? `${pedido.perfiles.nombre} ${pedido.perfiles.apellido}`
                    : pedido.nombre_cliente || "No registrado"}
                </p>
                {(pedido.perfiles?.telefono || pedido.telefono_cliente) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="size-3" />
                    {pedido.perfiles?.telefono || pedido.telefono_cliente}
                  </p>
                )}
              </div>
            </div>
            {pedido.perfiles?.es_socio && (
              <Badge className="bg-amarillo/20 text-amber-800 border-amarillo/30 text-[10px]">
                Socio
              </Badge>
            )}
          </div>
        </div>

        <Separator />

        {/* Products */}
        <div className="p-4 sm:p-5">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Productos ({pedido.pedido_items?.length || 0})
          </h2>
          <div className="space-y-2.5">
            {pedido.pedido_items?.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-sm min-w-0">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded bg-superficie text-[11px] font-medium tabular-nums">
                    {item.cantidad}
                  </span>
                  <span className="truncate">
                    {item.productos?.nombre}
                    {item.producto_variantes?.nombre && (
                      <span className="text-muted-foreground"> · {item.producto_variantes.nombre}</span>
                    )}
                  </span>
                </div>
                <span className="text-sm font-medium tabular-nums shrink-0 ml-3">
                  ${item.subtotal.toLocaleString("es-UY")}
                </span>
              </div>
            ))}
          </div>

          <Separator className="my-3" />

          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">${pedido.subtotal.toLocaleString("es-UY")}</span>
            </div>
            {pedido.descuento > 0 && (
              <div className="flex justify-between text-sm text-bordo-800">
                <span>Descuento</span>
                <span className="tabular-nums">-${pedido.descuento.toLocaleString("es-UY")}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold pt-1">
              <span>Total</span>
              <span className="tabular-nums">${pedido.total.toLocaleString("es-UY")}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Cancel button */}
      {!cancelado && !completado && (
        <motion.div variants={fadeInUp} className="pb-8">
          <button
            onClick={() => setCancelDialog(true)}
            disabled={updating}
            className="text-xs text-muted-foreground hover:text-red-600 transition-colors underline underline-offset-2"
          >
            Cancelar este pedido
          </button>
        </motion.div>
      )}

      {/* Cancel dialog */}
      <Dialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar pedido {pedido.numero_pedido}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-sm">Motivo de cancelación</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo de la cancelación..."
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelDialog(false)}>
              Volver
            </Button>
            <Button
              variant="destructive"
              onClick={() => updateEstado("cancelado", motivo)}
              disabled={updating}
            >
              Confirmar cancelación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
