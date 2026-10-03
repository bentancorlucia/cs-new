"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle,
  Clock,
  CreditCard,
  ExternalLink,
  FileImage,
  FileText,
  Loader2,
  Package,
  Phone,
  Repeat,
  ScanSearch,
  Truck,
  User,
  Users,
  XCircle,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import { mensajeError } from "@/lib/contabilidad/formato";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { EmailAvisos } from "@/components/pedidos/email-avisos";
import { OcrIndicadores } from "@/components/pedidos/ocr-indicadores";
import { ContabilidadPedidoSeccion } from "@/components/pedidos/contabilidad-pedido";
import { DevolucionDialog } from "@/components/pedidos/devolucion-dialog";
import { WhatsAppPedido } from "@/components/pedidos/whatsapp-pedido";
import { NOMBRE_ESTADO, pesos, type EstadoPedido, type PedidoDetalle } from "@/components/pedidos/tipos";

type Paso = { estado: EstadoPedido; label: string; icon: LucideIcon };

const PASOS_TRANSFERENCIA: Paso[] = [
  { estado: "pendiente_verificacion", label: "Verificación", icon: Building2 },
  { estado: "preparando", label: "Preparando", icon: Package },
  { estado: "listo_retiro", label: "Listo para retiro", icon: Truck },
  { estado: "retirado", label: "Retirado", icon: CheckCircle },
];

const PASOS_TRANSFERENCIA_ENCARGUE: Paso[] = [
  { estado: "pendiente_verificacion", label: "Verificación", icon: Building2 },
  { estado: "encargado", label: "Encargado", icon: Clock },
  { estado: "preparando", label: "Preparando", icon: Package },
  { estado: "listo_retiro", label: "Listo para retiro", icon: Truck },
  { estado: "retirado", label: "Retirado", icon: CheckCircle },
];

const PASOS_NORMAL: Paso[] = [
  { estado: "pendiente", label: "Pendiente", icon: Clock },
  { estado: "pagado", label: "Pagado", icon: CreditCard },
  { estado: "preparando", label: "Preparando", icon: Package },
  { estado: "listo_retiro", label: "Listo para retiro", icon: Truck },
  { estado: "retirado", label: "Retirado", icon: CheckCircle },
];

// Efectivo del POS con encargues: queda 'encargado' hasta que llega.
const PASOS_NORMAL_ENCARGUE: Paso[] = [
  { estado: "pagado", label: "Pagado", icon: CreditCard },
  { estado: "encargado", label: "Encargado", icon: Clock },
  { estado: "preparando", label: "Preparando", icon: Package },
  { estado: "listo_retiro", label: "Listo para retiro", icon: Truck },
  { estado: "retirado", label: "Retirado", icon: CheckCircle },
];

// Pedido de disciplina: se carga a su cuenta corriente al crearlo.
const PASOS_DISCIPLINA: Paso[] = [
  { estado: "pagado", label: "Cuenta corriente", icon: Users },
  { estado: "preparando", label: "Preparando", icon: Package },
  { estado: "listo_retiro", label: "Listo para retiro", icon: Truck },
  { estado: "retirado", label: "Entregado", icon: CheckCircle },
];

const SIGUIENTE: Partial<Record<EstadoPedido, EstadoPedido>> = {
  pagado: "preparando",
  encargado: "preparando",
  preparando: "listo_retiro",
  listo_retiro: "retirado",
};

const ETIQUETA_SIGUIENTE: Partial<Record<EstadoPedido, string>> = {
  pagado: "Marcar como Preparando",
  encargado: "Llegó el producto — Preparar",
  preparando: "Marcar como Listo para retiro",
  listo_retiro: "Marcar como Retirado",
};

const DONACION_ETIQUETA = {
  transferida: { texto: "transferida", clase: "text-pink-700/70" },
  cobrada: { texto: "cobrada · pendiente de transferir", clase: "text-pink-700/70" },
  pendiente_pago: { texto: "pendiente de pago", clase: "text-pink-700/70" },
  cancelada: { texto: "cancelada", clase: "text-muted-foreground" },
} as const;

export default function DetallePedidoPage() {
  useDocumentTitle("Detalle de Pedido");
  const params = useParams();
  const id = String(params.id);
  const [pedido, setPedido] = useState<PedidoDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [rejectDialog, setRejectDialog] = useState(false);
  const [devolucionDialog, setDevolucionDialog] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [updating, setUpdating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [imageZoom, setImageZoom] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/pedidos/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Pedido no encontrado");
      setPedido(json.data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function updateEstado(nuevoEstado: EstadoPedido, motivoCancelacion?: string) {
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/pedidos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevoEstado, motivo_cancelacion: motivoCancelacion }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Error al actualizar el estado");
      toast.success(
        nuevoEstado === "cancelado"
          ? "Pedido cancelado: se revirtieron sus asientos"
          : `Estado actualizado: ${NOMBRE_ESTADO[nuevoEstado]}`
      );
      setCancelDialog(false);
      await cargar();
    } catch (e) {
      toast.error(mensajeError({ message: (e as Error).message }));
    } finally {
      setUpdating(false);
    }
  }

  async function verificarTransferencia(accion: "aprobar" | "rechazar") {
    setVerifying(true);
    try {
      const res = await fetch(`/api/admin/pedidos/${id}/verificar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, motivo: accion === "rechazar" ? motivoRechazo : undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al verificar");
      toast.success(
        accion === "aprobar"
          ? "Transferencia aprobada: venta contabilizada"
          : "Transferencia rechazada: pedido cancelado"
      );
      setRejectDialog(false);
      await cargar();
    } catch (e) {
      toast.error(mensajeError({ message: (e as Error).message }));
    } finally {
      setVerifying(false);
    }
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
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-2xl pt-8 text-center"
      >
        <Package className="mx-auto mb-3 size-12 opacity-15" />
        <p className="text-muted-foreground">{error ?? "Pedido no encontrado"}</p>
        <Link href="/admin/pedidos">
          <Button variant="outline" className="mt-4">
            Volver a pedidos
          </Button>
        </Link>
      </motion.div>
    );
  }

  const puedeOperar = pedido.permisos.puedeOperar;
  const esDisciplina = pedido.tipo === "disciplina";
  const isMixto = pedido.metodo_pago === "mixto";
  const isTransferencia = pedido.metodo_pago === "transferencia" || isMixto;
  const isPendingVerification = pedido.estado === "pendiente_verificacion";
  const tieneEncargues = pedido.items.some((it) => it.es_encargue);
  const steps = esDisciplina
    ? PASOS_DISCIPLINA
    : isTransferencia
      ? tieneEncargues
        ? PASOS_TRANSFERENCIA_ENCARGUE
        : PASOS_TRANSFERENCIA
      : tieneEncargues
        ? PASOS_NORMAL_ENCARGUE
        : PASOS_NORMAL;
  const estadoActualIdx = steps.findIndex((s) => s.estado === pedido.estado);
  const cancelado = pedido.estado === "cancelado";
  const completado = pedido.estado === "retirado";
  const next = SIGUIENTE[pedido.estado];
  const comprobante = pedido.comprobantes[0] ?? null;
  const donacion = pedido.donacion;
  const venta = pedido.contabilidad.venta;
  const puedeDevolver =
    pedido.permisos.puedeOperarComercial &&
    !esDisciplina &&
    !!venta &&
    !venta.anulada &&
    !cancelado &&
    pedido.items.some((i) => !i.es_encargue);
  const nombreCliente = esDisciplina
    ? pedido.disciplina?.nombre ?? "Disciplina"
    : pedido.perfil
      ? `${pedido.perfil.nombre} ${pedido.perfil.apellido}`
      : pedido.nombre_cliente || "No registrado";

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="mx-auto max-w-2xl">
      {/* Volver + número */}
      <motion.div variants={fadeInUp} className="mb-6">
        <Link
          href={esDisciplina ? "/pedidos-disciplinas" : "/admin/pedidos"}
          className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          {esDisciplina ? "Pedidos de disciplinas" : "Pedidos"}
        </Link>

        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-xl uppercase tracking-tightest sm:text-2xl">{pedido.numero_pedido}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {new Date(pedido.created_at).toLocaleDateString("es-UY", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="outline" className="text-[10px] uppercase">
              {pedido.tipo}
            </Badge>
            {isTransferencia && (
              <Badge className="border-orange-200 bg-orange-50 text-[10px] text-orange-700">
                {isMixto ? "Efectivo + Transferencia" : "Transferencia"}
              </Badge>
            )}
            {pedido.metodo_pago === "efectivo" && (
              <Badge className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">Efectivo</Badge>
            )}
          </div>
        </div>
      </motion.div>

      {/* Línea de tiempo */}
      <motion.div variants={fadeInUp} className="mb-5 rounded-xl border border-linea bg-white p-4 sm:p-5">
        {cancelado ? (
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-red-100">
              <XCircle className="size-5 text-red-600" />
            </div>
            <div>
              <p className="font-medium text-red-600">Pedido cancelado</p>
              {pedido.notas && <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">{pedido.notas}</p>}
            </div>
          </div>
        ) : (
          <div className="flex items-start">
            {steps.map((step, i) => {
              const isPast = i < estadoActualIdx;
              const isCurrent = i === estadoActualIdx;
              const Icon = step.icon;
              return (
                <div key={step.estado} className="flex flex-1 items-start">
                  <div className="flex w-full flex-col items-center gap-1.5">
                    <motion.div
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: isCurrent ? 1.1 : 1, opacity: 1 }}
                      transition={{ delay: 0.08 * i, type: "spring", stiffness: 300, damping: 22 }}
                      className={cn(
                        "relative flex size-9 items-center justify-center rounded-full sm:size-10",
                        isPast && "bg-bordo-800",
                        isCurrent && isPendingVerification && "bg-orange-500 shadow-md ring-2 ring-orange-500/20",
                        isCurrent && !isPendingVerification && "bg-bordo-800 shadow-md ring-2 ring-bordo-800/20",
                        !isPast && !isCurrent && "bg-superficie"
                      )}
                    >
                      {isPast ? (
                        <Check className="size-4 text-white" />
                      ) : (
                        <Icon className={cn("size-4", isCurrent ? "text-white" : "text-muted-foreground")} />
                      )}
                    </motion.div>
                    <span
                      className={cn(
                        "text-center text-[10px] leading-tight sm:text-[11px]",
                        isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className="relative mx-1 mt-[18px] h-0.5 flex-1 overflow-hidden rounded-full bg-superficie sm:mx-2 sm:mt-5">
                      <motion.div
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: isPast ? 1 : 0 }}
                        transition={{ delay: 0.1 * i + 0.1, duration: 0.5 }}
                        className="absolute inset-0 origin-left bg-bordo-800"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Sin comprobante */}
      {isTransferencia && !comprobante && isPendingVerification && (
        <motion.div variants={fadeInUp} className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">Sin comprobante de transferencia</p>
              <p className="mt-1 text-xs text-amber-800/80">
                El cliente no subió el comprobante o falló la subida. Contactalo para pedirle que lo envíe antes de
                aprobar.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Comprobante */}
      {isTransferencia && comprobante && (
        <motion.div variants={fadeInUp} className="mb-5 overflow-hidden rounded-xl border border-linea bg-white">
          <div className="p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {comprobante.tipo === "pdf" ? <FileText className="size-3.5" /> : <FileImage className="size-3.5" />}
              Comprobante de transferencia
            </h2>

            {comprobante.tipo === "imagen" && comprobante.url && (
              <div className="space-y-2">
                <div className="relative">
                  <motion.div
                    animate={{ maxHeight: imageZoom ? 600 : 288 }}
                    transition={{ type: "spring", stiffness: 200, damping: 28 }}
                    className="relative w-full overflow-hidden rounded-lg bg-superficie"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={comprobante.url}
                      alt="Comprobante de transferencia"
                      className={cn("w-full object-contain", imageZoom ? "max-h-[600px]" : "max-h-72")}
                    />
                  </motion.div>
                  <div className="absolute bottom-2 right-2 flex gap-1.5">
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setImageZoom(!imageZoom)}
                      className="flex size-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
                      aria-label={imageZoom ? "Reducir" : "Ampliar"}
                    >
                      {imageZoom ? <ZoomOut className="size-4" /> : <ZoomIn className="size-4" />}
                    </motion.button>
                    <a
                      href={comprobante.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex size-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
                      aria-label="Abrir en nueva pestaña"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  </div>
                </div>
              </div>
            )}

            {comprobante.tipo === "pdf" && comprobante.url && (
              <div className="rounded-lg bg-superficie p-4">
                <div className="flex items-center gap-3">
                  <FileText className="size-10 text-bordo-800" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{comprobante.nombre_archivo}</p>
                    <p className="text-xs text-muted-foreground">
                      PDF{comprobante.tamano_bytes ? ` · ${(comprobante.tamano_bytes / 1024).toFixed(0)} KB` : ""}
                    </p>
                  </div>
                  <a href={comprobante.url} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                      <ExternalLink className="size-3.5" />
                      Abrir
                    </Button>
                  </a>
                </div>
              </div>
            )}

            {comprobante.estado && comprobante.estado !== "pendiente" && (
              <div
                className={cn(
                  "mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium",
                  comprobante.estado === "verificado" && "bg-green-50 text-green-700",
                  comprobante.estado === "rechazado" && "bg-red-50 text-red-600"
                )}
              >
                {comprobante.estado === "verificado" ? (
                  <>
                    <CheckCircle className="size-3.5" />
                    Comprobante verificado
                  </>
                ) : (
                  <>
                    <XCircle className="size-3.5" />
                    Comprobante rechazado
                    {comprobante.motivo_rechazo && (
                      <span className="font-normal"> — {comprobante.motivo_rechazo}</span>
                    )}
                  </>
                )}
              </div>
            )}

            {comprobante.datos_extraidos && (
              <OcrIndicadores
                datos={comprobante.datos_extraidos}
                totalPedido={isMixto ? Number(pedido.monto_transferencia) : pedido.total}
              />
            )}

            {!comprobante.datos_extraidos && comprobante.estado === "pendiente" && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-muted-foreground">
                <ScanSearch className="size-3.5" />
                No se pudieron extraer datos del comprobante — verificar manualmente
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Verificación */}
      {isPendingVerification && puedeOperar && (
        <motion.div variants={fadeInUp} className="mb-5 space-y-2">
          <motion.div whileTap={{ scale: 0.98 }}>
            <Button
              size="lg"
              onClick={() => verificarTransferencia("aprobar")}
              disabled={verifying}
              className="h-12 w-full gap-2 bg-green-600 text-sm font-medium hover:bg-green-700"
            >
              {verifying ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle className="size-4" />
                  Aprobar transferencia
                </>
              )}
            </Button>
          </motion.div>
          <Button
            variant="outline"
            size="lg"
            onClick={() => setRejectDialog(true)}
            disabled={verifying}
            className="h-12 w-full gap-2 border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <XCircle className="size-4" />
            Rechazar transferencia
          </Button>
        </motion.div>
      )}

      {/* Avance de estado */}
      {puedeOperar && !cancelado && !completado && !isPendingVerification && next && (
        <motion.div variants={fadeInUp} whileTap={{ scale: 0.98 }} className="mb-5">
          <Button size="lg" onClick={() => updateEstado(next)} disabled={updating} className="h-12 w-full gap-2 text-sm font-medium">
            {updating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                {ETIQUETA_SIGUIENTE[pedido.estado]}
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
          {next === "retirado" && tieneEncargues && (
            <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
              Al retirarlo, la seña del encargue se reconoce como venta.
            </p>
          )}
        </motion.div>
      )}

      {/* Cliente + productos */}
      <motion.div variants={fadeInUp} className="mb-5 overflow-hidden rounded-xl border border-linea bg-white">
        <div className="p-4 sm:p-5">
          <h2 className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {esDisciplina ? "Disciplina" : "Cliente"}
          </h2>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-superficie">
                {esDisciplina ? (
                  <Users className="size-4 text-muted-foreground" />
                ) : (
                  <User className="size-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{nombreCliente}</p>
                {esDisciplina && (
                  <p className="text-xs text-muted-foreground">Cargado a la cuenta corriente de la disciplina</p>
                )}
                {(pedido.perfil?.telefono || pedido.telefono_cliente) && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="size-3" />
                    {pedido.perfil?.telefono || pedido.telefono_cliente}
                  </p>
                )}
                {!esDisciplina && puedeOperar && (
                  <WhatsAppPedido
                    telefono={pedido.perfil?.telefono || pedido.telefono_cliente}
                    nombre={pedido.perfil?.nombre ?? pedido.nombre_cliente}
                    numero={pedido.numero_pedido}
                    listo={pedido.estado === "listo_retiro"}
                  />
                )}
                {!pedido.perfil_id && !esDisciplina && puedeOperar && (
                  <EmailAvisos
                    pedidoId={pedido.id}
                    email={pedido.email_cliente}
                    onSaved={(email_cliente) => setPedido((prev) => (prev ? { ...prev, email_cliente } : prev))}
                  />
                )}
              </div>
            </div>
            {pedido.perfil?.es_socio && (
              <Badge className="border-amarillo/30 bg-amarillo/20 text-[10px] text-amber-800">Socio</Badge>
            )}
          </div>
        </div>

        <Separator />

        <div className="p-4 sm:p-5">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Productos ({pedido.items.length})
          </h2>
          <div className="space-y-2.5">
            {pedido.items.map((item) => {
              const personalizacion = Object.entries(item.personalizacion).map(([key, raw]) => {
                const campo = item.producto.mto_campos.find((c) => c.key === key);
                let valor = String(raw);
                if (campo && (campo.tipo === "select" || campo.tipo === "talle")) {
                  valor = campo.opciones?.find((o) => o.valor === valor)?.label ?? valor;
                }
                return { key, label: campo?.label ?? key, valor };
              });
              return (
                <div key={item.id} className="flex flex-col gap-1 border-b border-border/30 pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5 text-sm">
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">x{item.cantidad}</span>
                      <div className="min-w-0">
                        <span className="block truncate">
                          {item.producto.nombre}
                          {item.es_encargue && (
                            <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-700">
                              Encargue
                            </span>
                          )}
                        </span>
                        {!item.es_encargue && item.variante && (
                          <span className="text-xs text-muted-foreground">{item.variante.nombre}</span>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums">{pesos(item.subtotal)}</span>
                  </div>
                  {item.es_encargue && personalizacion.length > 0 && (
                    <div className="ml-7 flex flex-col gap-0.5 rounded-md bg-amber-50/80 px-2.5 py-1.5 text-[11px] text-amber-900">
                      {personalizacion.map((r) => (
                        <div key={r.key} className="flex justify-between gap-3">
                          <span className="text-amber-800/70">{r.label}</span>
                          <span className="font-medium">{r.valor}</span>
                        </div>
                      ))}
                      {item.precio_extra_personalizacion > 0 && (
                        <div className="mt-0.5 flex justify-between gap-3 border-t border-amber-200 pt-0.5">
                          <span className="text-amber-800/70">Sobrecargo</span>
                          <span className="font-medium">+{pesos(item.precio_extra_personalizacion)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Separator className="my-3" />

          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{pesos(pedido.subtotal)}</span>
            </div>
            {pedido.descuento > 0 && (
              <div className="flex justify-between text-sm text-bordo-800">
                <span>Descuento</span>
                <span className="tabular-nums">-{pesos(pedido.descuento)}</span>
              </div>
            )}
            {donacion && (
              <div className="flex justify-between text-sm text-pink-700">
                <span>
                  Donación · Olla del Hogar de Cristo
                  <span
                    className={cn(
                      "ml-1 text-[10px] font-bold uppercase tracking-wider",
                      DONACION_ETIQUETA[donacion.estado].clase
                    )}
                  >
                    {DONACION_ETIQUETA[donacion.estado].texto}
                  </span>
                </span>
                <span className="tabular-nums">+{pesos(donacion.monto)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 text-base font-bold">
              <span>Total</span>
              <span className="tabular-nums">{pesos(pedido.total)}</span>
            </div>
            {isMixto && (
              <div className="space-y-1 pt-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Pagado en efectivo</span>
                  <span className="tabular-nums">{pesos(pedido.monto_efectivo)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>
                    Por transferencia
                    {isPendingVerification && (
                      <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-orange-600">
                        por conciliar
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums">{pesos(pedido.monto_transferencia)}</span>
                </div>
              </div>
            )}
            {donacion && donacion.estado !== "cancelada" && (
              <p className="pt-2 text-[11px] leading-relaxed text-muted-foreground">
                De este total, {pesos(donacion.monto)} no son ventas de tienda — se transfieren a la Olla del Hogar de
                Cristo.
              </p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Contabilidad */}
      <ContabilidadPedidoSeccion pedido={pedido} />

      {/* Acciones secundarias */}
      {(puedeDevolver || (puedeOperar && !cancelado && !isPendingVerification)) && (
        <motion.div variants={fadeInUp} className="flex flex-wrap items-center justify-between gap-3 pb-8">
          {puedeDevolver ? (
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setDevolucionDialog(true)}>
                <Repeat className="size-3.5" />
                Devolución / cambio
              </Button>
            </motion.div>
          ) : (
            <span />
          )}
          {puedeOperar && !cancelado && !isPendingVerification && (
            <button
              onClick={() => setCancelDialog(true)}
              disabled={updating}
              className="text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-red-600"
            >
              {completado ? "Anular la venta (devolución total)" : "Cancelar este pedido"}
            </button>
          )}
        </motion.div>
      )}

      {/* Cancelar */}
      <Dialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar pedido {pedido.numero_pedido}</DialogTitle>
            <DialogDescription>
              No se puede deshacer. {venta && !venta.anulada
                ? "Se revierten los asientos de la venta y la mercadería vuelve al stock al costo con que salió."
                : "Se libera el stock reservado."}
              {esDisciplina && " El importe sale de la cuenta corriente de la disciplina."}
            </DialogDescription>
          </DialogHeader>
          {donacion?.estado === "transferida" && (
            <div className="rounded-md border border-pink-200 bg-pink-50 p-3 text-xs text-pink-800">
              <p className="font-bold uppercase tracking-wider">Donación ya transferida a la Olla del Hogar</p>
              <p className="mt-1 leading-relaxed">
                La donación de {pesos(donacion.monto)} ya fue transferida y no se devuelve al cliente. Solo reembolsá
                la parte de productos: {pesos(pedido.total - donacion.monto)}.
              </p>
            </div>
          )}
          {donacion?.estado === "cobrada" && (
            <div className="rounded-md border border-pink-200 bg-pink-50 p-3 text-xs text-pink-800">
              Este pedido incluye una donación de {pesos(donacion.monto)} que aún no fue transferida a la Olla. Al
              cancelar, la donación también se cancela y se reembolsa el total al cliente.
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="motivo-cancelacion" className="text-sm">
              Motivo de cancelación
            </Label>
            <Textarea
              id="motivo-cancelacion"
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
            <Button variant="destructive" onClick={() => updateEstado("cancelado", motivo)} disabled={updating}>
              {updating ? <Loader2 className="size-4 animate-spin" /> : "Confirmar cancelación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rechazar transferencia */}
      <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar transferencia</DialogTitle>
            <DialogDescription>
              El pedido {pedido.numero_pedido} será cancelado y se liberará el stock reservado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-rechazo" className="text-sm">
              Motivo del rechazo
            </Label>
            <Textarea
              id="motivo-rechazo"
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              placeholder="Ej: Comprobante no corresponde, monto incorrecto..."
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectDialog(false)}>
              Volver
            </Button>
            <Button
              variant="destructive"
              onClick={() => verificarTransferencia("rechazar")}
              disabled={verifying || !motivoRechazo.trim()}
            >
              {verifying ? <Loader2 className="size-4 animate-spin" /> : "Confirmar rechazo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {puedeDevolver && (
        <DevolucionDialog
          pedido={pedido}
          open={devolucionDialog}
          onOpenChange={setDevolucionDialog}
          onHecho={() => {
            setDevolucionDialog(false);
            cargar();
          }}
        />
      )}
    </motion.div>
  );
}
