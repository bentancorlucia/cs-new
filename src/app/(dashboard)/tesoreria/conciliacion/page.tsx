"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileSpreadsheet,
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  ArrowRightLeft,
  Eye,
  Plus,
  Ban,
  CheckCircle2,
  Clock,
  Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { staggerContainer, fadeInUp, springSmooth } from "@/lib/motion";
import { formatMonto, formatFecha, nombreMes } from "@/lib/tesoreria/format";
import { FORMATO_OPTIONS } from "@/lib/tesoreria/parsear-extracto";
import { toast } from "sonner";
import { useDocumentTitle } from "@/hooks/use-document-title";

interface CuentaFinanciera {
  id: number;
  nombre: string;
  tipo: string;
  moneda: "UYU" | "USD";
  saldo_actual: number;
}

interface Conciliacion {
  id: number;
  cuenta_id: number;
  periodo_desde: string;
  periodo_hasta: string;
  saldo_banco: number;
  saldo_sistema: number;
  diferencia: number;
  archivo_extracto_url: string | null;
  estado: "en_proceso" | "completada";
  movimientos_matcheados: number;
  movimientos_pendientes_banco: number;
  movimientos_pendientes_sistema: number;
  completada_at: string | null;
  created_at: string;
  cuenta?: { nombre: string; moneda: string };
}

interface ConciliacionItem {
  id: number;
  conciliacion_id: number;
  movimiento_id: number | null;
  fecha_banco: string | null;
  descripcion_banco: string | null;
  monto_banco: number | null;
  estado: "matcheado" | "pendiente_sistema" | "pendiente_banco" | "ignorado";
  movimiento?: {
    id: number;
    fecha: string;
    descripcion: string;
    monto: number;
    tipo: string;
  } | null;
}

export default function ConciliacionPage() {
  useDocumentTitle("Conciliación");
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
  const [conciliaciones, setConciliaciones] = useState<Conciliacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNueva, setShowNueva] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Detalle de conciliación
  const [detalle, setDetalle] = useState<(Conciliacion & { items: ConciliacionItem[] }) | null>(null);
  const [showDetalle, setShowDetalle] = useState(false);

  // Form nueva conciliación
  const [cuentaId, setCuentaId] = useState("");
  const [periodoDesde, setPeriodoDesde] = useState("");
  const [periodoHasta, setPeriodoHasta] = useState("");
  const [saldoBanco, setSaldoBanco] = useState("");
  const [formato, setFormato] = useState("generico");
  const [archivo, setArchivo] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Expandable sections
  const [expandMatcheados, setExpandMatcheados] = useState(true);
  const [expandPendSistema, setExpandPendSistema] = useState(true);
  const [expandPendBanco, setExpandPendBanco] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [cuentasRes, concRes] = await Promise.all([
        fetch("/api/tesoreria/cuentas?activas=true"),
        fetch("/api/tesoreria/conciliacion"),
      ]);
      const cuentasData = await cuentasRes.json();
      const concData = await concRes.json();
      setCuentas(cuentasData.data || []);
      setConciliaciones(concData.data || []);
    } catch {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleNuevaConciliacion = async () => {
    if (!cuentaId || !periodoDesde || !periodoHasta || !saldoBanco) {
      toast.error("Completá todos los campos requeridos");
      return;
    }

    setProcessing(true);
    try {
      const formData = new FormData();
      formData.append("cuenta_id", cuentaId);
      formData.append("periodo_desde", periodoDesde);
      formData.append("periodo_hasta", periodoHasta);
      formData.append("saldo_banco", saldoBanco);
      formData.append("formato", formato);
      if (archivo) {
        formData.append("archivo", archivo);
      }

      const res = await fetch("/api/tesoreria/conciliacion", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(
        `Conciliación creada: ${data.data.resumen.matcheados} matcheados, ${data.data.resumen.pendientes_banco + data.data.resumen.pendientes_sistema} pendientes`
      );

      setShowNueva(false);
      resetForm();
      fetchData();

      // Abrir detalle automáticamente
      loadDetalle(data.data.conciliacion.id);
    } catch (err: any) {
      toast.error(err.message || "Error al crear conciliación");
    } finally {
      setProcessing(false);
    }
  };

  const loadDetalle = async (id: number) => {
    try {
      const res = await fetch(`/api/tesoreria/conciliacion?id=${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDetalle(data.data);
      setShowDetalle(true);
    } catch (err: any) {
      toast.error("Error al cargar detalle");
    }
  };

  const handleItemAction = async (
    itemId: number,
    action: "confirmar" | "ignorar",
    movimientoId?: number
  ) => {
    try {
      const body: any = {
        action: action === "confirmar" ? "confirmar_item" : "ignorar_item",
        item_id: itemId,
      };
      if (action === "confirmar") {
        body.estado = "matcheado";
        body.movimiento_id = movimientoId;
      }

      const res = await fetch("/api/tesoreria/conciliacion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Error al actualizar");

      // Recargar detalle
      if (detalle) loadDetalle(detalle.id);
      toast.success(action === "confirmar" ? "Match confirmado" : "Item ignorado");
    } catch {
      toast.error("Error al actualizar item");
    }
  };

  const handleFinalizar = async () => {
    if (!detalle) return;
    try {
      const res = await fetch("/api/tesoreria/conciliacion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finalizar",
          conciliacion_id: detalle.id,
        }),
      });

      if (!res.ok) throw new Error("Error al finalizar");

      toast.success("Conciliación finalizada");
      setShowDetalle(false);
      setDetalle(null);
      fetchData();
    } catch {
      toast.error("Error al finalizar conciliación");
    }
  };

  const resetForm = () => {
    setCuentaId("");
    setPeriodoDesde("");
    setPeriodoHasta("");
    setSaldoBanco("");
    setFormato("generico");
    setArchivo(null);
  };

  const cuentaSeleccionada = cuentas.find((c) => c.id === parseInt(cuentaId));

  if (loading) {
    return (
      <div className="p-4 lg:p-8 space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // Detalle view
  if (showDetalle && detalle) {
    const matcheados = detalle.items.filter((i) => i.estado === "matcheado");
    const pendSistema = detalle.items.filter((i) => i.estado === "pendiente_sistema");
    const pendBanco = detalle.items.filter((i) => i.estado === "pendiente_banco");
    const ignorados = detalle.items.filter((i) => i.estado === "ignorado");
    const moneda = (detalle as any).cuenta?.moneda || "UYU";

    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 lg:p-8 space-y-6"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowDetalle(false);
                setDetalle(null);
              }}
              className="mb-2 -ml-2 text-muted-foreground"
            >
              &larr; Volver
            </Button>
            <h1 className="text-2xl font-display font-bold text-foreground">
              Conciliación #{detalle.id}
            </h1>
            <p className="text-muted-foreground text-sm">
              {formatFecha(detalle.periodo_desde)} — {formatFecha(detalle.periodo_hasta)}
            </p>
          </div>
          <div className="flex gap-2">
            <Badge
              variant="outline"
              className={
                detalle.estado === "completada"
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-yellow-50 text-yellow-700 border-yellow-200"
              }
            >
              {detalle.estado === "completada" ? "Completada" : "En proceso"}
            </Badge>
            {detalle.estado === "en_proceso" && (
              <Button onClick={handleFinalizar} className="bg-bordo-800 hover:bg-bordo-900">
                <CheckCircle2 className="size-4 mr-2" />
                Finalizar conciliación
              </Button>
            )}
          </div>
        </div>

        {/* Resumen */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {[
            { label: "Saldo banco", value: formatMonto(detalle.saldo_banco, moneda as any), color: "text-blue-600" },
            { label: "Saldo sistema", value: formatMonto(detalle.saldo_sistema, moneda as any), color: "text-bordo-800" },
            {
              label: "Diferencia",
              value: formatMonto(detalle.diferencia, moneda as any, true),
              color: Math.abs(detalle.diferencia) < 0.01 ? "text-green-600" : "text-amber-600",
            },
            { label: "Matcheados", value: `${matcheados.length} / ${detalle.items.length}`, color: "text-foreground" },
          ].map((stat) => (
            <motion.div key={stat.label} variants={fadeInUp}>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {stat.label}
                  </p>
                  <p className={`text-xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Sección: Matcheados automáticamente */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => setExpandMatcheados(!expandMatcheados)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-green-600" />
                  <CardTitle className="text-base">
                    Matcheados ({matcheados.length})
                  </CardTitle>
                </div>
                {expandMatcheados ? (
                  <ChevronUp className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
            <AnimatePresence>
              {expandMatcheados && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={springSmooth}
                >
                  <CardContent className="pt-0">
                    {matcheados.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        No se encontraron matches automáticos
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Sistema</TableHead>
                              <TableHead>Banco</TableHead>
                              <TableHead className="text-right">Monto</TableHead>
                              <TableHead>Estado</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            <AnimatePresence>
                              {matcheados.map((item, idx) => (
                                <motion.tr
                                  key={item.id}
                                  initial={{ opacity: 0, x: -8 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: idx * 0.03 }}
                                  className="border-b"
                                >
                                  <TableCell>
                                    <div className="text-sm">
                                      <span className="text-muted-foreground">
                                        {item.movimiento?.fecha ? formatFecha(item.movimiento.fecha) : "—"}
                                      </span>{" "}
                                      {item.movimiento?.descripcion || "—"}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="text-sm">
                                      <span className="text-muted-foreground">
                                        {item.fecha_banco ? formatFecha(item.fecha_banco) : "—"}
                                      </span>{" "}
                                      {item.descripcion_banco || "—"}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-sm">
                                    {item.monto_banco !== null
                                      ? formatMonto(Math.abs(item.monto_banco), moneda as any, true)
                                      : "—"}
                                  </TableCell>
                                  <TableCell>
                                    <Badge className="bg-green-100 text-green-700 border-0">
                                      <Check className="size-3 mr-1" />
                                      Match
                                    </Badge>
                                  </TableCell>
                                </motion.tr>
                              ))}
                            </AnimatePresence>
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>

        {/* Sección: Sin match en sistema (del banco sin par) */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => setExpandPendSistema(!expandPendSistema)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-5 text-amber-500" />
                  <CardTitle className="text-base">
                    Sin match en sistema ({pendSistema.length})
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    Movimientos del banco sin par en el sistema
                  </span>
                </div>
                {expandPendSistema ? (
                  <ChevronUp className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
            <AnimatePresence>
              {expandPendSistema && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={springSmooth}
                >
                  <CardContent className="pt-0">
                    {pendSistema.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        No hay movimientos del banco sin match
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {pendSistema.map((item, idx) => (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="flex items-center justify-between gap-4 p-3 bg-amber-50/50 rounded-lg border border-amber-100"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground font-mono">
                                  {item.fecha_banco ? formatFecha(item.fecha_banco) : "—"}
                                </span>
                                <span className="truncate font-medium">
                                  {item.descripcion_banco || "Sin descripción"}
                                </span>
                              </div>
                              <div className="text-sm font-mono mt-0.5">
                                {item.monto_banco !== null
                                  ? formatMonto(Math.abs(item.monto_banco), moneda as any, true)
                                  : "—"}
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs"
                                onClick={() => handleItemAction(item.id, "ignorar")}
                              >
                                <Ban className="size-3 mr-1" />
                                Ignorar
                              </Button>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>

        {/* Sección: Sin match en banco (del sistema sin par) */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          <Card>
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => setExpandPendBanco(!expandPendBanco)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Search className="size-5 text-blue-500" />
                  <CardTitle className="text-base">
                    Sin match en banco ({pendBanco.length})
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    Movimientos del sistema sin par en el banco
                  </span>
                </div>
                {expandPendBanco ? (
                  <ChevronUp className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
            <AnimatePresence>
              {expandPendBanco && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={springSmooth}
                >
                  <CardContent className="pt-0">
                    {pendBanco.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        No hay movimientos del sistema sin match
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {pendBanco.map((item, idx) => (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="flex items-center justify-between gap-4 p-3 bg-blue-50/50 rounded-lg border border-blue-100"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground font-mono">
                                  {item.movimiento?.fecha
                                    ? formatFecha(item.movimiento.fecha)
                                    : "—"}
                                </span>
                                <span className="truncate font-medium">
                                  {item.movimiento?.descripcion || "Sin descripción"}
                                </span>
                              </div>
                              <div className="text-sm font-mono mt-0.5">
                                {item.movimiento
                                  ? formatMonto(
                                      item.movimiento.monto,
                                      moneda as any,
                                      true
                                    )
                                  : "—"}
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs"
                                onClick={() => handleItemAction(item.id, "ignorar")}
                              >
                                <Clock className="size-3 mr-1" />
                                Posponer
                              </Button>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>

        {/* Ignorados */}
        {ignorados.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
            <Card className="opacity-60">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Ban className="size-4 text-muted-foreground" />
                  <CardTitle className="text-sm text-muted-foreground">
                    Ignorados ({ignorados.length})
                  </CardTitle>
                </div>
              </CardHeader>
            </Card>
          </motion.div>
        )}
      </motion.div>
    );
  }

  // Lista principal
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 lg:p-8 space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Conciliación Bancaria
          </h1>
          <p className="text-muted-foreground text-sm">
            Verificá que los movimientos del sistema coincidan con los del banco
          </p>
        </div>
        <Button
          onClick={() => setShowNueva(true)}
          className="bg-bordo-800 hover:bg-bordo-900"
        >
          <Plus className="size-4 mr-2" />
          Nueva conciliación
        </Button>
      </div>

      {/* Lista de conciliaciones */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-3"
      >
        {conciliaciones.length === 0 ? (
          <motion.div variants={fadeInUp}>
            <Card>
              <CardContent className="py-12 text-center">
                <ArrowRightLeft className="size-12 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">
                  No hay conciliaciones registradas
                </p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Subí un extracto bancario para empezar a conciliar
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          conciliaciones.map((conc) => (
            <motion.div key={conc.id} variants={fadeInUp}>
              <Card
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => loadDetalle(conc.id)}
              >
                <CardContent className="py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`size-10 rounded-lg flex items-center justify-center ${
                          conc.estado === "completada"
                            ? "bg-green-100 text-green-600"
                            : "bg-amber-100 text-amber-600"
                        }`}
                      >
                        {conc.estado === "completada" ? (
                          <CheckCircle2 className="size-5" />
                        ) : (
                          <Clock className="size-5" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {(conc as any).cuenta?.nombre || `Cuenta #${conc.cuenta_id}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatFecha(conc.periodo_desde)} — {formatFecha(conc.periodo_hasta)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Diferencia</p>
                        <p
                          className={`font-mono font-medium ${
                            Math.abs(conc.diferencia) < 0.01
                              ? "text-green-600"
                              : "text-amber-600"
                          }`}
                        >
                          {formatMonto(conc.diferencia, (conc as any).cuenta?.moneda || "UYU", true)}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                          {conc.movimientos_matcheados} match
                        </Badge>
                        {(conc.movimientos_pendientes_banco + conc.movimientos_pendientes_sistema) > 0 && (
                          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                            {conc.movimientos_pendientes_banco + conc.movimientos_pendientes_sistema} pend.
                          </Badge>
                        )}
                      </div>
                      <Eye className="size-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </motion.div>

      {/* Dialog: Nueva conciliación */}
      <Dialog open={showNueva} onOpenChange={setShowNueva}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva conciliación bancaria</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Cuenta</Label>
              <Select value={cuentaId} onValueChange={(v) => setCuentaId(v || "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cuenta..." />
                </SelectTrigger>
                <SelectContent>
                  {cuentas
                    .filter((c) => c.tipo === "bancaria")
                    .map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nombre} ({c.moneda})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Desde</Label>
                <Input
                  type="date"
                  value={periodoDesde}
                  onChange={(e) => setPeriodoDesde(e.target.value)}
                />
              </div>
              <div>
                <Label>Hasta</Label>
                <Input
                  type="date"
                  value={periodoHasta}
                  onChange={(e) => setPeriodoHasta(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label>Saldo según banco</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={saldoBanco}
                onChange={(e) => setSaldoBanco(e.target.value)}
              />
              {cuentaSeleccionada && (
                <p className="text-xs text-muted-foreground mt-1">
                  Saldo sistema: {formatMonto(cuentaSeleccionada.saldo_actual, cuentaSeleccionada.moneda)}
                </p>
              )}
            </div>

            <div>
              <Label>Formato del extracto</Label>
              <Select value={formato} onValueChange={(v) => setFormato(v || "generico")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMATO_OPTIONS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Extracto bancario (CSV / Excel)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => setArchivo(e.target.files?.[0] || null)}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`
                  mt-1 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
                  transition-colors hover:border-bordo-300 hover:bg-bordo-50/30
                  ${archivo ? "border-green-300 bg-green-50/30" : "border-muted"}
                `}
              >
                {archivo ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileSpreadsheet className="size-5 text-green-600" />
                    <span className="text-sm font-medium">{archivo.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setArchivo(null);
                      }}
                      className="ml-2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <Upload className="size-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Click para subir o arrastrá el archivo
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      CSV, XLS, XLSX
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNueva(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleNuevaConciliacion}
              disabled={processing}
              className="bg-bordo-800 hover:bg-bordo-900"
            >
              {processing ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <ArrowRightLeft className="size-4 mr-2" />
                  Conciliar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
