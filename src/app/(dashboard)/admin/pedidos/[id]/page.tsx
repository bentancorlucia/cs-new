"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Package,
  User,
  Phone,
  Mail,
  CreditCard,
  Clock,
  CheckCircle,
  XCircle,
  Truck,
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
import { createBrowserClient } from "@/lib/supabase/client";
import { fadeInUp, springSmooth } from "@/lib/motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type EstadoPedido = "pendiente" | "pagado" | "preparando" | "listo_retiro" | "retirado" | "cancelado";

const estadoSteps: { estado: EstadoPedido; label: string; icon: any }[] = [
  { estado: "pendiente", label: "Pendiente", icon: Clock },
  { estado: "pagado", label: "Pagado", icon: CreditCard },
  { estado: "preparando", label: "Preparando", icon: Package },
  { estado: "listo_retiro", label: "Listo retiro", icon: Truck },
  { estado: "retirado", label: "Retirado", icon: CheckCircle },
];

const nextEstado: Record<string, EstadoPedido> = {
  pagado: "preparando",
  preparando: "listo_retiro",
  listo_retiro: "retirado",
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
    async function fetch() {
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from("pedidos")
        .select(
          `*, perfiles(id, nombre, apellido, telefono, cedula, es_socio),
          pedido_items(id, cantidad, precio_unitario, subtotal, productos(id, nombre, slug), producto_variantes(id, nombre))`
        )
        .eq("id", parseInt(id))
        .single();
      setPedido(data);
      setLoading(false);
    }
    fetch();
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
      toast.success(`Estado actualizado a: ${nuevoEstado}`);
      setCancelDialog(false);
    } else {
      toast.error("Error al actualizar estado");
    }
    setUpdating(false);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!pedido) {
    return <p className="text-muted-foreground">Pedido no encontrado</p>;
  }

  const estadoActualIdx = estadoSteps.findIndex((s) => s.estado === pedido.estado);
  const cancelado = pedido.estado === "cancelado";
  const next = nextEstado[pedido.estado as string];

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/admin/pedidos"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Volver a pedidos
      </Link>

      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        transition={springSmooth}
      >
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pedido {pedido.numero_pedido}</h1>
            <p className="text-sm text-muted-foreground">
              {new Date(pedido.created_at).toLocaleDateString("es-UY", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            {pedido.tipo.toUpperCase()}
          </Badge>
        </div>

        {/* Timeline */}
        <div className="mb-8 rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-medium">Estado del pedido</h2>
          {cancelado ? (
            <div className="flex items-center gap-3 text-destructive">
              <XCircle className="size-6" />
              <div>
                <p className="font-medium">Pedido cancelado</p>
                {pedido.notas && (
                  <p className="text-sm text-muted-foreground">
                    Motivo: {pedido.notas}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              {estadoSteps.map((step, i) => {
                const active = i <= estadoActualIdx;
                const Icon = step.icon;
                return (
                  <div key={step.estado} className="flex flex-1 items-center">
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className={cn(
                          "flex size-8 items-center justify-center rounded-full transition-colors",
                          active
                            ? "bg-bordo text-white"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        <Icon className="size-4" />
                      </div>
                      <span
                        className={cn(
                          "text-[10px]",
                          active ? "font-medium text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {step.label}
                      </span>
                    </div>
                    {i < estadoSteps.length - 1 && (
                      <div
                        className={cn(
                          "mx-2 h-0.5 flex-1",
                          i < estadoActualIdx ? "bg-bordo" : "bg-muted"
                        )}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Client info */}
        <div className="mb-6 rounded-xl border bg-card p-5">
          <h2 className="mb-3 text-sm font-medium">Cliente</h2>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <User className="size-4 text-muted-foreground" />
              {pedido.perfiles
                ? `${pedido.perfiles.nombre} ${pedido.perfiles.apellido}`
                : pedido.nombre_cliente || "No registrado"}
              {pedido.perfiles?.es_socio && (
                <Badge className="bg-amarillo text-texto text-[10px]">Socio</Badge>
              )}
            </div>
            {(pedido.perfiles?.telefono || pedido.telefono_cliente) && (
              <div className="flex items-center gap-2">
                <Phone className="size-4 text-muted-foreground" />
                {pedido.perfiles?.telefono || pedido.telefono_cliente}
              </div>
            )}
          </div>
        </div>

        {/* Items */}
        <div className="mb-6 rounded-xl border bg-card p-5">
          <h2 className="mb-3 text-sm font-medium">Productos</h2>
          <div className="space-y-3">
            {pedido.pedido_items?.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {item.cantidad}x
                  </span>
                  <span>
                    {item.productos?.nombre}
                    {item.producto_variantes?.nombre && (
                      <span className="text-muted-foreground">
                        {" "}— {item.producto_variantes.nombre}
                      </span>
                    )}
                  </span>
                </div>
                <span className="font-medium">
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
              <div className="flex justify-between text-bordo">
                <span>Descuento</span>
                <span>-${pedido.descuento.toLocaleString("es-UY")}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span>${pedido.total.toLocaleString("es-UY")}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        {!cancelado && pedido.estado !== "retirado" && (
          <div className="flex gap-3">
            {next && (
              <Button
                onClick={() => updateEstado(next)}
                disabled={updating}
                className="flex-1"
              >
                Marcar como: {estadoSteps.find((s) => s.estado === next)?.label}
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={() => setCancelDialog(true)}
              disabled={updating}
            >
              Cancelar pedido
            </Button>
          </div>
        )}
      </motion.div>

      {/* Cancel dialog */}
      <Dialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar pedido</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Motivo de cancelación</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo de la cancelación..."
              rows={3}
            />
          </div>
          <DialogFooter>
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
    </div>
  );
}
