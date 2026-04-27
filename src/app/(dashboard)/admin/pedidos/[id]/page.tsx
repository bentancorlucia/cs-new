"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
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
  Building2,
  FileImage,
  FileText,
  ZoomIn,
  ZoomOut,
  Loader2,
  AlertTriangle,
  ScanSearch,
  Banknote,
  Calendar,
  Hash,
  Landmark,
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
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { fadeInUp, staggerContainer, springSmooth } from "@/lib/motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/hooks/use-document-title";

type EstadoPedido = "pendiente" | "pendiente_verificacion" | "pagado" | "preparando" | "listo_retiro" | "retirado" | "cancelado";

const estadoSteps: { estado: EstadoPedido; label: string; icon: any }[] = [
  { estado: "pendiente_verificacion", label: "Verificación", icon: Building2 },
  { estado: "preparando", label: "Preparando", icon: Package },
  { estado: "listo_retiro", label: "Listo para retiro", icon: Truck },
  { estado: "retirado", label: "Retirado", icon: CheckCircle },
];

// For non-transfer orders, use the original steps
const estadoStepsNormal: { estado: EstadoPedido; label: string; icon: any }[] = [
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

function OcrIndicators({
  datos,
  totalPedido,
}: {
  datos: any;
  totalPedido: number;
}) {
  if (!datos || datos.confianza === undefined) return null;

  const confianza = datos.confianza as number;

  // Low confidence — manual check needed
  if (confianza < 0.3) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-600">
        <XCircle className="size-3.5 shrink-0" />
        <span className="font-medium">
          No se pudo extraer información suficiente — verificar manualmente
        </span>
      </div>
    );
  }

  const isItau =
    datos.banco_destino &&
    /itau|itaú/i.test(datos.banco_destino);
  const isCuentaCorrecta =
    datos.cuenta_destino && datos.cuenta_destino.includes("9500100");
  const isBeneficiarioCorrecto =
    datos.beneficiario &&
    /seminario|bordo/i.test(datos.beneficiario);
  const montoExacto =
    datos.monto !== null && Math.abs(datos.monto - totalPedido) < 0.01;
  const montoDiferente =
    datos.monto !== null && Math.abs(datos.monto - totalPedido) >= 0.01;

  const indicators = [
    {
      key: "banco",
      icon: Landmark,
      ok: isItau,
      label: isItau
        ? "Banco destino ITAU"
        : datos.banco_destino
          ? `Banco destino: ${datos.banco_destino}`
          : "Banco destino no detectado",
      warn: !isItau && !!datos.banco_destino,
    },
    {
      key: "cuenta",
      icon: Hash,
      ok: isCuentaCorrecta,
      label: isCuentaCorrecta
        ? "Cuenta correcta (9500100)"
        : datos.cuenta_destino
          ? `Cuenta: ${datos.cuenta_destino}`
          : "Cuenta destino no detectada",
      warn: !isCuentaCorrecta && !!datos.cuenta_destino,
    },
    {
      key: "beneficiario",
      icon: User,
      ok: isBeneficiarioCorrecto,
      label: isBeneficiarioCorrecto
        ? `Beneficiario: ${datos.beneficiario}`
        : datos.beneficiario
          ? `Beneficiario: ${datos.beneficiario}`
          : "Beneficiario no detectado",
      warn: !isBeneficiarioCorrecto && !!datos.beneficiario,
    },
    {
      key: "monto",
      icon: Banknote,
      ok: montoExacto,
      label: montoExacto
        ? `Monto coincide: $${datos.monto?.toLocaleString("es-UY")}`
        : montoDiferente
          ? `Monto: $${datos.monto?.toLocaleString("es-UY")} (pedido: $${totalPedido.toLocaleString("es-UY")})`
          : "Monto no detectado",
      warn: montoDiferente,
    },
    ...(datos.fecha
      ? [
          {
            key: "fecha",
            icon: Calendar,
            ok: true,
            label: `Fecha: ${datos.fecha}`,
            warn: false,
          },
        ]
      : []),
    ...(datos.banco_origen
      ? [
          {
            key: "origen",
            icon: Landmark,
            ok: true,
            label: `Banco origen: ${datos.banco_origen}`,
            warn: false,
          },
        ]
      : []),
    ...(datos.referencia
      ? [
          {
            key: "ref",
            icon: Hash,
            ok: true,
            label: `Referencia: ${datos.referencia}`,
            warn: false,
          },
        ]
      : []),
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="mt-3 space-y-1"
    >
      <div className="flex items-center gap-1.5 mb-2">
        <ScanSearch className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          Datos extraídos automáticamente
        </span>
        <span
          className={cn(
            "ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full",
            confianza >= 0.8
              ? "bg-green-100 text-green-700"
              : confianza >= 0.6
                ? "bg-amber-100 text-amber-700"
                : "bg-red-100 text-red-600"
          )}
        >
          {Math.round(confianza * 100)}% confianza
        </span>
      </div>
      <div className="space-y-0.5">
        {indicators.map((ind) => {
          const Icon = ind.icon;
          return (
            <div
              key={ind.key}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs",
                ind.ok && "bg-green-50 text-green-700",
                ind.warn && "bg-amber-50 text-amber-700",
                !ind.ok && !ind.warn && "bg-gray-50 text-muted-foreground"
              )}
            >
              {ind.ok ? (
                <CheckCircle className="size-3.5 shrink-0" />
              ) : ind.warn ? (
                <AlertTriangle className="size-3.5 shrink-0" />
              ) : (
                <Icon className="size-3.5 shrink-0 opacity-50" />
              )}
              <span>{ind.label}</span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

export default function DetallePedidoPage() {
  useDocumentTitle("Detalle de Pedido");
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [pedido, setPedido] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [rejectDialog, setRejectDialog] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [updating, setUpdating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [imageZoom, setImageZoom] = useState(false);

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

  async function verificarTransferencia(accion: "aprobar" | "rechazar") {
    setVerifying(true);
    try {
      const res = await fetch(`/api/admin/pedidos/${id}/verificar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion,
          motivo: accion === "rechazar" ? motivoRechazo : undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setPedido((prev: any) => ({
          ...prev,
          estado: data.estado,
          comprobantes: prev.comprobantes?.map((c: any) => ({
            ...c,
            estado: accion === "aprobar" ? "verificado" : "rechazado",
          })),
        }));
        toast.success(
          accion === "aprobar"
            ? "Transferencia aprobada — preparando pedido"
            : "Transferencia rechazada — pedido cancelado"
        );
        setRejectDialog(false);
      } else {
        toast.error(data.error || "Error al verificar");
      }
    } catch {
      toast.error("Error de conexión");
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
      <div className="mx-auto max-w-2xl pt-8 text-center">
        <Package className="mx-auto mb-3 size-12 opacity-15" />
        <p className="text-muted-foreground">Pedido no encontrado</p>
        <Link href="/admin/pedidos">
          <Button variant="outline" className="mt-4">Volver a pedidos</Button>
        </Link>
      </div>
    );
  }

  const isTransferencia = pedido.metodo_pago === "transferencia";
  const isPendingVerification = pedido.estado === "pendiente_verificacion";
  const steps = isTransferencia ? estadoSteps : estadoStepsNormal;
  const estadoActualIdx = steps.findIndex((s) => s.estado === pedido.estado);
  const cancelado = pedido.estado === "cancelado";
  const completado = pedido.estado === "retirado";
  const next = nextEstado[pedido.estado as string];
  const comprobante = pedido.comprobantes?.[0] || null;

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
            {isTransferencia && (
              <Badge className="bg-orange-50 text-orange-700 border-orange-200 text-[10px]">
                Transferencia
              </Badge>
            )}
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
            {steps.map((step, i) => {
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
                        isCurrent && isPendingVerification && "bg-orange-500 shadow-md ring-2 ring-orange-500/20 scale-110",
                        isCurrent && !isPendingVerification && "bg-bordo-800 shadow-md ring-2 ring-bordo-800/20 scale-110",
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
                  {i < steps.length - 1 && (
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

      {/* Comprobante viewer (only for transferencias) */}
      {isTransferencia && comprobante && (
        <motion.div variants={fadeInUp} className="mb-5 rounded-xl border border-linea bg-white overflow-hidden">
          <div className="p-4 sm:p-5">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
              {comprobante.tipo === "pdf" ? (
                <FileText className="size-3.5" />
              ) : (
                <FileImage className="size-3.5" />
              )}
              Comprobante de transferencia
            </h2>

            {/* Image viewer */}
            {comprobante.tipo === "imagen" && comprobante.url && (
              <div className="relative">
                <div
                  className={cn(
                    "relative w-full overflow-hidden rounded-lg bg-superficie transition-all",
                    imageZoom ? "max-h-[600px]" : "max-h-72"
                  )}
                >
                  <Image
                    src={comprobante.url}
                    alt="Comprobante de transferencia"
                    width={600}
                    height={800}
                    className={cn(
                      "w-full object-contain transition-all",
                      imageZoom ? "max-h-[600px]" : "max-h-72"
                    )}
                  />
                </div>
                <button
                  onClick={() => setImageZoom(!imageZoom)}
                  className="absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
                >
                  {imageZoom ? <ZoomOut className="size-4" /> : <ZoomIn className="size-4" />}
                </button>
              </div>
            )}

            {/* PDF viewer */}
            {comprobante.tipo === "pdf" && comprobante.url && (
              <div className="rounded-lg bg-superficie p-4">
                <div className="flex items-center gap-3">
                  <FileText className="size-10 text-bordo-800" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{comprobante.nombre_archivo}</p>
                    <p className="text-xs text-muted-foreground">
                      PDF · {comprobante.tamano_bytes ? `${(comprobante.tamano_bytes / 1024).toFixed(0)} KB` : ""}
                    </p>
                  </div>
                  <a
                    href={comprobante.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm" className="text-xs">
                      Abrir PDF
                    </Button>
                  </a>
                </div>
              </div>
            )}

            {/* Comprobante status badge */}
            {comprobante.estado && comprobante.estado !== "pendiente" && (
              <div className={cn(
                "mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium",
                comprobante.estado === "verificado" && "bg-green-50 text-green-700",
                comprobante.estado === "rechazado" && "bg-red-50 text-red-600",
              )}>
                {comprobante.estado === "verificado" && (
                  <>
                    <CheckCircle className="size-3.5" />
                    Comprobante verificado
                  </>
                )}
                {comprobante.estado === "rechazado" && (
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

            {/* OCR extracted data indicators */}
            {comprobante.datos_extraidos && (
              <OcrIndicators
                datos={comprobante.datos_extraidos}
                totalPedido={pedido.total}
              />
            )}

            {/* No OCR data warning */}
            {!comprobante.datos_extraidos && comprobante.estado === "pendiente" && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-muted-foreground">
                <ScanSearch className="size-3.5" />
                No se pudieron extraer datos del comprobante — verificar manualmente
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Verification actions (only for pendiente_verificacion) */}
      {isPendingVerification && (
        <motion.div variants={fadeInUp} className="mb-5 space-y-2">
          <Button
            size="lg"
            onClick={() => verificarTransferencia("aprobar")}
            disabled={verifying}
            className="w-full h-12 gap-2 text-sm font-medium bg-green-600 hover:bg-green-700"
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
          <Button
            variant="outline"
            size="lg"
            onClick={() => setRejectDialog(true)}
            disabled={verifying}
            className="w-full h-12 gap-2 text-sm font-medium text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
          >
            <XCircle className="size-4" />
            Rechazar transferencia
          </Button>
        </motion.div>
      )}

      {/* Main action button (for non-verification states) */}
      {!cancelado && !completado && !isPendingVerification && next && (
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
            {pedido.pedido_items?.map((item: any) => {
              const personalizacion = item.personalizacion as
                | Record<string, string | number>
                | null;
              const personalizacionEntries = personalizacion
                ? Object.entries(personalizacion)
                : [];
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-1 border-b border-border/30 pb-2 last:border-0 last:pb-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 text-sm min-w-0">
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        x{item.cantidad}
                      </span>
                      <div className="min-w-0">
                        <span className="truncate block">
                          {item.productos?.nombre}
                          {item.es_encargue && (
                            <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-700">
                              Encargue
                            </span>
                          )}
                        </span>
                        {item.producto_variantes?.nombre && (
                          <span className="text-xs text-muted-foreground">{item.producto_variantes.nombre}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-medium tabular-nums shrink-0">
                      ${item.subtotal.toLocaleString("es-UY")}
                    </span>
                  </div>
                  {item.es_encargue && personalizacionEntries.length > 0 && (
                    <div className="ml-7 flex flex-col gap-0.5 rounded-md bg-amber-50/80 px-2.5 py-1.5 text-[11px] text-amber-900">
                      {personalizacionEntries.map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3">
                          <span className="text-amber-800/70">{k}</span>
                          <span className="font-medium">{String(v)}</span>
                        </div>
                      ))}
                      {item.precio_extra_personalizacion ? (
                        <div className="flex justify-between gap-3 border-t border-amber-200 pt-0.5 mt-0.5">
                          <span className="text-amber-800/70">Sobrecargo</span>
                          <span className="font-medium">
                            +${Number(item.precio_extra_personalizacion).toLocaleString("es-UY")}
                          </span>
                        </div>
                      ) : null}
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
      {!cancelado && !completado && !isPendingVerification && (
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
            <DialogDescription>
              Esta acción no se puede deshacer. Se devolverá el stock reservado.
            </DialogDescription>
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

      {/* Reject transfer dialog */}
      <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar transferencia</DialogTitle>
            <DialogDescription>
              El pedido {pedido.numero_pedido} será cancelado y se liberará el stock reservado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-sm">Motivo del rechazo</Label>
            <Textarea
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
              {verifying ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Confirmar rechazo"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
