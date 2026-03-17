"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock,
  Unlock,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Calendar,
  FileText,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { formatMonto, nombreMes } from "@/lib/tesoreria/format";
import { toast } from "sonner";

interface CierreMensual {
  id: number;
  anio: number;
  mes: number;
  total_ingresos: number;
  total_egresos: number;
  resultado: number;
  saldos_snapshot: Record<string, { nombre: string; moneda: string; saldo: number }>;
  categorias_snapshot: Record<string, { nombre: string; total: number }> | null;
  estado: "abierto" | "cerrado";
  cerrado_por: string | null;
  cerrado_at: string | null;
  notas: string | null;
}

interface ResumenMes {
  anio: number;
  mes: number;
  total_ingresos: number;
  total_egresos: number;
  resultado: number;
  saldos: Array<{ id: number; nombre: string; moneda: string; saldo_actual: number }>;
  categorias: Array<{ nombre: string; tipo: string; total: number }>;
  pendientes_conciliacion: number;
  total_movimientos: number;
}

export default function CierresPage() {
  const [cierres, setCierres] = useState<CierreMensual[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMes, setSelectedMes] = useState<{ anio: number; mes: number } | null>(null);
  const [resumen, setResumen] = useState<ResumenMes | null>(null);
  const [cierreExistente, setCierreExistente] = useState<CierreMensual | null>(null);
  const [loadingResumen, setLoadingResumen] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [notas, setNotas] = useState("");
  const [cerrando, setCerrando] = useState(false);

  const fetchCierres = useCallback(async () => {
    try {
      const res = await fetch("/api/tesoreria/cierres");
      const data = await res.json();
      setCierres(data.data || []);
    } catch {
      toast.error("Error al cargar cierres");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCierres();
  }, [fetchCierres]);

  const loadResumen = async (anio: number, mes: number) => {
    setSelectedMes({ anio, mes });
    setLoadingResumen(true);
    try {
      const res = await fetch(
        `/api/tesoreria/cierres?anio=${anio}&mes=${mes}`
      );
      const data = await res.json();
      setResumen(data.data?.resumen || null);
      setCierreExistente(data.data?.cierre || null);
    } catch {
      toast.error("Error al cargar resumen");
    } finally {
      setLoadingResumen(false);
    }
  };

  const handleCerrarMes = async () => {
    if (!selectedMes) return;
    setCerrando(true);
    try {
      const res = await fetch("/api/tesoreria/cierres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anio: selectedMes.anio,
          mes: selectedMes.mes,
          notas: notas || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(
        `Mes ${nombreMes(selectedMes.mes)} ${selectedMes.anio} cerrado correctamente`
      );
      setShowConfirmDialog(false);
      setNotas("");
      setSelectedMes(null);
      setResumen(null);
      fetchCierres();
    } catch (err: any) {
      toast.error(err.message || "Error al cerrar mes");
    } finally {
      setCerrando(false);
    }
  };

  // Generar los últimos 12 meses para mostrar
  const mesesDisponibles: Array<{ anio: number; mes: number }> = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    mesesDisponibles.push({ anio: d.getFullYear(), mes: d.getMonth() + 1 });
  }

  // Map de cierres por período
  const cierresMap: Record<string, CierreMensual> = {};
  for (const c of cierres) {
    cierresMap[`${c.anio}-${c.mes}`] = c;
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-8 space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // Detalle de un mes
  if (selectedMes && resumen) {
    const key = `${selectedMes.anio}-${selectedMes.mes}`;
    const cierre = cierresMap[key] || cierreExistente;
    const estaCerrado = cierre?.estado === "cerrado";

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
                setSelectedMes(null);
                setResumen(null);
              }}
              className="mb-2 -ml-2 text-muted-foreground"
            >
              &larr; Volver
            </Button>
            <h1 className="text-2xl font-display font-bold text-foreground">
              {nombreMes(selectedMes.mes)} {selectedMes.anio}
            </h1>
            <p className="text-muted-foreground text-sm">
              {resumen.total_movimientos} movimientos en el período
            </p>
          </div>
          <div className="flex items-center gap-2">
            {estaCerrado ? (
              <Badge className="bg-green-100 text-green-700 border-0 py-1.5 px-3">
                <Lock className="size-3.5 mr-1.5" />
                Período cerrado
              </Badge>
            ) : (
              <Button
                onClick={() => setShowConfirmDialog(true)}
                className="bg-bordo-800 hover:bg-bordo-900"
              >
                <Lock className="size-4 mr-2" />
                Cerrar mes
              </Button>
            )}
          </div>
        </div>

        {/* Advertencias */}
        {!estaCerrado && resumen.pendientes_conciliacion > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="py-3 flex items-center gap-3">
                <AlertTriangle className="size-5 text-amber-500 shrink-0" />
                <p className="text-sm text-amber-800">
                  Hay <strong>{resumen.pendientes_conciliacion}</strong> movimientos
                  sin conciliar en este período. Se recomienda conciliar antes de cerrar.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Stats */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid gap-4 sm:grid-cols-3"
        >
          <motion.div variants={fadeInUp}>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="size-4 text-green-500" />
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Total Ingresos
                  </p>
                </div>
                <p className="text-2xl font-bold text-green-600">
                  {formatMonto(resumen.total_ingresos)}
                </p>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div variants={fadeInUp}>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="size-4 text-red-500" />
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Total Egresos
                  </p>
                </div>
                <p className="text-2xl font-bold text-red-600">
                  {formatMonto(resumen.total_egresos)}
                </p>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div variants={fadeInUp}>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="size-4 text-bordo-600" />
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Resultado
                  </p>
                </div>
                <p
                  className={`text-2xl font-bold ${
                    resumen.resultado >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {formatMonto(resumen.resultado, "UYU", true)}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        {/* Saldos por cuenta */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Saldos por cuenta</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Moneda</TableHead>
                    <TableHead className="text-right">Saldo actual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resumen.saldos.map((cuenta, idx) => (
                    <motion.tr
                      key={cuenta.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      className="border-b"
                    >
                      <TableCell className="font-medium">{cuenta.nombre}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {cuenta.moneda}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatMonto(cuenta.saldo_actual, cuenta.moneda as any)}
                      </TableCell>
                    </motion.tr>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </motion.div>

        {/* Top categorías */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Categorías del período</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Ingresos */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                    Ingresos
                  </h4>
                  <div className="space-y-2">
                    {resumen.categorias
                      .filter((c) => c.tipo === "ingreso")
                      .map((cat, idx) => (
                        <motion.div
                          key={cat.nombre}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 + idx * 0.04 }}
                          className="flex justify-between items-center"
                        >
                          <span className="text-sm">{cat.nombre}</span>
                          <span className="text-sm font-mono text-green-600">
                            +{formatMonto(cat.total)}
                          </span>
                        </motion.div>
                      ))}
                  </div>
                </div>
                {/* Egresos */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                    Egresos
                  </h4>
                  <div className="space-y-2">
                    {resumen.categorias
                      .filter((c) => c.tipo === "egreso")
                      .map((cat, idx) => (
                        <motion.div
                          key={cat.nombre}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 + idx * 0.04 }}
                          className="flex justify-between items-center"
                        >
                          <span className="text-sm">{cat.nombre}</span>
                          <span className="text-sm font-mono text-red-600">
                            -{formatMonto(cat.total)}
                          </span>
                        </motion.div>
                      ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Notas del cierre (si está cerrado) */}
        {estaCerrado && cierre?.notas && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="bg-superficie/50">
              <CardContent className="py-4 flex items-start gap-3">
                <Info className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Notas del cierre
                  </p>
                  <p className="text-sm">{cierre.notas}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Dialog confirmar cierre */}
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="size-5 text-bordo-800" />
                Cerrar {nombreMes(selectedMes.mes)} {selectedMes.anio}
              </DialogTitle>
              <DialogDescription>
                Esta acción bloquea los movimientos del período. No se podrán
                crear, editar ni eliminar movimientos con fecha en este mes.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium">Acción irreversible</p>
                    <p className="mt-1">
                      Una vez cerrado, solo un super admin puede reabrir el período.
                      Verificá que toda la información sea correcta antes de continuar.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-lg font-bold text-green-600">
                    {formatMonto(resumen.total_ingresos)}
                  </p>
                  <p className="text-xs text-muted-foreground">Ingresos</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-lg font-bold text-red-600">
                    {formatMonto(resumen.total_egresos)}
                  </p>
                  <p className="text-xs text-muted-foreground">Egresos</p>
                </div>
                <div className="bg-bordo-50 rounded-lg p-3">
                  <p
                    className={`text-lg font-bold ${
                      resumen.resultado >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {formatMonto(resumen.resultado, "UYU", true)}
                  </p>
                  <p className="text-xs text-muted-foreground">Resultado</p>
                </div>
              </div>

              <div>
                <Label>Notas (opcional)</Label>
                <Textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Observaciones sobre el cierre..."
                  rows={3}
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleCerrarMes}
                disabled={cerrando}
                className="bg-bordo-800 hover:bg-bordo-900"
              >
                {cerrando ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Cerrando...
                  </>
                ) : (
                  <>
                    <Lock className="size-4 mr-2" />
                    Confirmar cierre
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>
    );
  }

  // Loading resumen
  if (selectedMes && loadingResumen) {
    return (
      <div className="p-4 lg:p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="size-8 animate-spin text-bordo-800 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Cargando resumen de {nombreMes(selectedMes.mes)} {selectedMes.anio}...
          </p>
        </div>
      </div>
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
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">
          Cierres Mensuales
        </h1>
        <p className="text-muted-foreground text-sm">
          Cerrá períodos para proteger los movimientos de modificaciones
        </p>
      </div>

      {/* Info card */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="border-blue-100 bg-blue-50/30">
          <CardContent className="py-3 flex items-start gap-3">
            <ShieldCheck className="size-5 text-blue-500 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-800">
              <p>
                Al cerrar un mes, se genera un snapshot de saldos y totales. Los movimientos
                de ese período quedan <strong>protegidos</strong> — no se pueden crear, editar
                ni eliminar.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Lista de meses */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-2"
      >
        {mesesDisponibles.map((m) => {
          const key = `${m.anio}-${m.mes}`;
          const cierre = cierresMap[key];
          const estaCerrado = cierre?.estado === "cerrado";
          const esActual =
            m.anio === now.getFullYear() && m.mes === now.getMonth() + 1;

          return (
            <motion.div key={key} variants={fadeInUp}>
              <Card
                className={`cursor-pointer transition-all hover:shadow-md ${
                  estaCerrado ? "bg-green-50/30 border-green-100" : ""
                } ${esActual ? "ring-2 ring-bordo-200" : ""}`}
                onClick={() => loadResumen(m.anio, m.mes)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`size-9 rounded-lg flex items-center justify-center ${
                          estaCerrado
                            ? "bg-green-100 text-green-600"
                            : "bg-superficie text-muted-foreground"
                        }`}
                      >
                        {estaCerrado ? (
                          <Lock className="size-4" />
                        ) : (
                          <Unlock className="size-4" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">
                            {nombreMes(m.mes)} {m.anio}
                          </p>
                          {esActual && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-bordo-200 text-bordo-600">
                              actual
                            </Badge>
                          )}
                        </div>
                        {estaCerrado && cierre && (
                          <p className="text-xs text-muted-foreground">
                            Resultado: {formatMonto(cierre.resultado, "UYU", true)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {estaCerrado ? (
                        <Badge className="bg-green-100 text-green-700 border-0 text-xs">
                          <CheckCircle2 className="size-3 mr-1" />
                          Cerrado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          <Calendar className="size-3 mr-1" />
                          Abierto
                        </Badge>
                      )}
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
