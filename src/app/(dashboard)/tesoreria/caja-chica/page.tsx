"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Archive,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { staggerContainer, fadeInUp, springSmooth } from "@/lib/motion";
import { toast } from "sonner";

interface CuentaCajaChica {
  id: number;
  nombre: string;
  moneda: string;
  saldo_actual: number;
  color: string | null;
}

interface Arqueo {
  id: number;
  fecha: string;
  cuenta_id: number;
  cuenta_nombre: string;
  saldo_sistema: number;
  saldo_fisico: number;
  diferencia: number;
  registrado_por: string;
  notas: string | null;
  moneda: string;
}

interface ArqueosResponse {
  data: Arqueo[];
  total: number;
}

interface UltimoArqueo {
  fecha: string;
  diferencia: number;
}

interface CuentaConArqueo extends CuentaCajaChica {
  ultimo_arqueo: UltimoArqueo | null;
}

function AnimatedCounter({ value, moneda }: { value: number; moneda: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) {
      setDisplay(0);
      return;
    }
    const duration = 800;
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      current = Math.min(Math.round(increment * step), value);
      setDisplay(current);
      if (step >= steps) clearInterval(interval);
    }, duration / steps);

    return () => clearInterval(interval);
  }, [value]);

  const prefix = moneda === "USD" ? "U$" : "$";
  return (
    <span className="tabular-nums">
      {prefix}
      {display.toLocaleString("es-UY")}
    </span>
  );
}

function formatCurrency(monto: number, moneda: string): string {
  const prefix = moneda === "USD" ? "U$" : "$";
  return `${prefix}${Math.abs(monto).toLocaleString("es-UY")}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function DiferenciaDisplay({ diferencia, moneda }: { diferencia: number; moneda: string }) {
  if (diferencia === 0) {
    return (
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="size-3.5 text-emerald-600" />
        <span className="font-body text-sm text-emerald-600 font-medium">
          Sin diferencia
        </span>
      </div>
    );
  }
  if (diferencia > 0) {
    return (
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="size-3.5 text-amber-600" />
        <span className="font-body text-sm text-amber-600 font-medium">
          +{formatCurrency(diferencia, moneda)} sobrante
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <XCircle className="size-3.5 text-red-600" />
      <span className="font-body text-sm text-red-600 font-medium">
        -{formatCurrency(Math.abs(diferencia), moneda)} faltante
      </span>
    </div>
  );
}

function DiferenciaBadge({ diferencia, moneda }: { diferencia: number; moneda: string }) {
  if (diferencia === 0) {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 font-body text-xs">
        {formatCurrency(0, moneda)}
      </Badge>
    );
  }
  if (diferencia > 0) {
    return (
      <Badge className="bg-amber-100 text-amber-700 font-body text-xs">
        +{formatCurrency(diferencia, moneda)}
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-100 text-red-700 font-body text-xs">
      -{formatCurrency(Math.abs(diferencia), moneda)}
    </Badge>
  );
}

export default function CajaChicaPage() {
  const [cuentas, setCuentas] = useState<CuentaConArqueo[]>([]);
  const [arqueos, setArqueos] = useState<Arqueo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingArqueos, setLoadingArqueos] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [selectedCuentaId, setSelectedCuentaId] = useState<number | null>(null);
  const [saldoFisico, setSaldoFisico] = useState("");
  const [notas, setNotas] = useState("");

  const selectedCuenta = cuentas.find((c) => c.id === selectedCuentaId);
  const saldoFisicoNum = parseFloat(saldoFisico) || 0;
  const diferencia = selectedCuenta
    ? saldoFisicoNum - selectedCuenta.saldo_actual
    : 0;

  const fetchCuentas = useCallback(async () => {
    try {
      const res = await fetch("/api/tesoreria/cuentas?activas=true");
      if (!res.ok) throw new Error("Error al cargar cuentas");
      const json = await res.json();
      const allCuentas: CuentaCajaChica[] = json.data || json;
      const cajaChicaCuentas = allCuentas.filter(
        (c: CuentaCajaChica & { tipo?: string }) =>
          (c as CuentaCajaChica & { tipo: string }).tipo === "caja_chica"
      );

      // Fetch last arqueo for each account
      const cuentasConArqueo: CuentaConArqueo[] = await Promise.all(
        cajaChicaCuentas.map(async (cuenta) => {
          try {
            const arqueosRes = await fetch(
              `/api/tesoreria/caja-chica?cuenta_id=${cuenta.id}&limit=1`
            );
            if (arqueosRes.ok) {
              const arqueosJson = await arqueosRes.json();
              const ultimoArqueo =
                arqueosJson.data && arqueosJson.data.length > 0
                  ? {
                      fecha: arqueosJson.data[0].fecha,
                      diferencia: arqueosJson.data[0].diferencia,
                    }
                  : null;
              return { ...cuenta, ultimo_arqueo: ultimoArqueo };
            }
          } catch {
            // Ignore individual fetch errors
          }
          return { ...cuenta, ultimo_arqueo: null };
        })
      );

      setCuentas(cuentasConArqueo);
    } catch {
      toast.error("No se pudieron cargar las cuentas de caja chica");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchArqueos = useCallback(async () => {
    setLoadingArqueos(true);
    try {
      const res = await fetch("/api/tesoreria/caja-chica");
      if (!res.ok) throw new Error("Error al cargar arqueos");
      const json: ArqueosResponse = await res.json();
      setArqueos(json.data);
    } catch {
      toast.error("No se pudieron cargar los arqueos");
    } finally {
      setLoadingArqueos(false);
    }
  }, []);

  useEffect(() => {
    fetchCuentas();
    fetchArqueos();
  }, [fetchCuentas, fetchArqueos]);

  function resetForm() {
    setSelectedCuentaId(null);
    setSaldoFisico("");
    setNotas("");
  }

  async function handleSubmit() {
    if (!selectedCuentaId) {
      toast.error("Seleccionar una cuenta de caja chica");
      return;
    }
    if (!saldoFisico || saldoFisicoNum < 0) {
      toast.error("Ingresar el saldo físico contado");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/tesoreria/caja-chica", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cuenta_id: selectedCuentaId,
          saldo_fisico: saldoFisicoNum,
          notas: notas || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Error al registrar arqueo");
      }

      toast.success("Arqueo registrado correctamente");
      setDialogOpen(false);
      resetForm();
      fetchCuentas();
      fetchArqueos();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al registrar arqueo"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
            Caja Chica
          </h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            Control y arqueos de caja chica
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-bordo-800 hover:bg-bordo-700 text-white rounded-lg w-full sm:w-auto"
        >
          <ClipboardCheck className="size-4 mr-2" />
          Arqueo
        </Button>
      </motion.div>

      {/* Account Cards */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4"
      >
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <motion.div key={i} variants={fadeInUp} transition={springSmooth}>
              <Card className="border-linea">
                <CardContent className="p-5">
                  <Skeleton className="h-5 w-32 mb-3" />
                  <Skeleton className="h-9 w-24 mb-4" />
                  <Skeleton className="h-4 w-40" />
                </CardContent>
              </Card>
            </motion.div>
          ))
        ) : cuentas.length === 0 ? (
          <motion.div
            variants={fadeInUp}
            transition={springSmooth}
            className="col-span-full"
          >
            <Card className="border-linea">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Archive className="size-10 text-muted-foreground/40 mb-3" />
                <p className="font-body text-sm text-muted-foreground">
                  No hay cuentas de caja chica configuradas
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          cuentas.map((cuenta) => (
            <motion.div
              key={cuenta.id}
              variants={fadeInUp}
              transition={springSmooth}
            >
              <Card className="border-linea h-full">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="size-2.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: cuenta.color || "#730d32",
                      }}
                    />
                    <p className="font-body text-sm font-medium text-foreground">
                      {cuenta.nombre}
                    </p>
                  </div>

                  <p className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground mb-3">
                    <AnimatedCounter
                      value={Math.round(cuenta.saldo_actual)}
                      moneda={cuenta.moneda}
                    />
                  </p>

                  {cuenta.ultimo_arqueo ? (
                    <div className="space-y-1">
                      <p className="font-body text-[11px] text-muted-foreground">
                        Último arqueo: {formatDate(cuenta.ultimo_arqueo.fecha)}
                      </p>
                      <DiferenciaDisplay
                        diferencia={cuenta.ultimo_arqueo.diferencia}
                        moneda={cuenta.moneda}
                      />
                    </div>
                  ) : (
                    <p className="font-body text-[11px] text-muted-foreground">
                      Sin arqueos registrados
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </motion.div>

      {/* Arqueos History */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        <Card className="border-linea">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-sm uppercase tracking-editorial">
              Historial de Arqueos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingArqueos ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded" />
                ))}
              </div>
            ) : arqueos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ClipboardCheck className="size-10 text-muted-foreground/40 mb-3" />
                <p className="font-body text-sm text-muted-foreground">
                  No hay arqueos registrados
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 font-body"
                  onClick={() => setDialogOpen(true)}
                >
                  <ClipboardCheck className="size-4 mr-1" />
                  Realizar primer arqueo
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-heading text-xs uppercase">
                        Fecha
                      </TableHead>
                      <TableHead className="font-heading text-xs uppercase">
                        Cuenta
                      </TableHead>
                      <TableHead className="font-heading text-xs uppercase text-right">
                        Saldo Sistema
                      </TableHead>
                      <TableHead className="font-heading text-xs uppercase text-right">
                        Saldo Físico
                      </TableHead>
                      <TableHead className="font-heading text-xs uppercase text-right">
                        Diferencia
                      </TableHead>
                      <TableHead className="font-heading text-xs uppercase hidden md:table-cell">
                        Registrado por
                      </TableHead>
                      <TableHead className="font-heading text-xs uppercase hidden lg:table-cell">
                        Notas
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {arqueos.map((arqueo, idx) => (
                      <motion.tr
                        key={arqueo.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          delay: idx * 0.03,
                          ...springSmooth,
                        }}
                        className="border-b border-linea last:border-0"
                      >
                        <TableCell className="font-body text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(arqueo.fecha)}
                        </TableCell>
                        <TableCell className="font-body text-sm text-foreground">
                          {arqueo.cuenta_nombre}
                        </TableCell>
                        <TableCell className="font-body text-sm text-foreground text-right tabular-nums">
                          {formatCurrency(arqueo.saldo_sistema, arqueo.moneda)}
                        </TableCell>
                        <TableCell className="font-body text-sm text-foreground text-right tabular-nums">
                          {formatCurrency(arqueo.saldo_fisico, arqueo.moneda)}
                        </TableCell>
                        <TableCell className="text-right">
                          <DiferenciaBadge
                            diferencia={arqueo.diferencia}
                            moneda={arqueo.moneda}
                          />
                        </TableCell>
                        <TableCell className="font-body text-sm text-muted-foreground hidden md:table-cell">
                          {arqueo.registrado_por}
                        </TableCell>
                        <TableCell className="font-body text-sm text-muted-foreground hidden lg:table-cell max-w-[180px] truncate">
                          {arqueo.notas || "-"}
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Arqueo Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-sm uppercase tracking-editorial">
              Nuevo Arqueo de Caja Chica
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Select Account */}
            <div className="space-y-1.5">
              <Label className="font-body text-sm">Cuenta Caja Chica</Label>
              <div className="grid gap-2">
                {cuentas.map((cuenta) => (
                  <button
                    key={cuenta.id}
                    type="button"
                    onClick={() => setSelectedCuentaId(cuenta.id)}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${
                      selectedCuentaId === cuenta.id
                        ? "border-bordo-800 bg-bordo-50"
                        : "border-linea hover:bg-superficie"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: cuenta.color || "#730d32",
                        }}
                      />
                      <span className="font-body text-sm font-medium text-foreground">
                        {cuenta.nombre}
                      </span>
                    </div>
                    <span className="font-body text-sm text-muted-foreground">
                      {formatCurrency(cuenta.saldo_actual, cuenta.moneda)}
                    </span>
                  </button>
                ))}
                {cuentas.length === 0 && !loading && (
                  <p className="font-body text-sm text-muted-foreground text-center py-4">
                    No hay cuentas de caja chica
                  </p>
                )}
              </div>
            </div>

            {/* System Balance (read-only) */}
            {selectedCuenta && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={springSmooth}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <Label className="font-body text-sm">
                    Saldo en Sistema ({selectedCuenta.moneda})
                  </Label>
                  <div className="rounded-lg bg-superficie p-3">
                    <p className="font-display text-lg tracking-tightest text-foreground tabular-nums">
                      {formatCurrency(
                        selectedCuenta.saldo_actual,
                        selectedCuenta.moneda
                      )}
                    </p>
                  </div>
                </div>

                {/* Physical Balance */}
                <div className="space-y-1.5">
                  <Label className="font-body text-sm">
                    Saldo Físico Contado ({selectedCuenta.moneda})
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={saldoFisico}
                    onChange={(e) => setSaldoFisico(e.target.value)}
                    placeholder="0.00"
                    className="font-body text-sm"
                  />
                </div>

                {/* Calculated Difference */}
                {saldoFisico !== "" && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={springSmooth}
                    className={`rounded-lg p-3 ${
                      diferencia === 0
                        ? "bg-emerald-50"
                        : diferencia > 0
                          ? "bg-amber-50"
                          : "bg-red-50"
                    }`}
                  >
                    <p className="font-body text-xs text-muted-foreground mb-1">
                      Diferencia
                    </p>
                    <div className="flex items-center gap-2">
                      {diferencia === 0 ? (
                        <CheckCircle2 className="size-5 text-emerald-600" />
                      ) : diferencia > 0 ? (
                        <AlertTriangle className="size-5 text-amber-600" />
                      ) : (
                        <XCircle className="size-5 text-red-600" />
                      )}
                      <span
                        className={`font-display text-xl tracking-tightest tabular-nums ${
                          diferencia === 0
                            ? "text-emerald-700"
                            : diferencia > 0
                              ? "text-amber-700"
                              : "text-red-700"
                        }`}
                      >
                        {diferencia > 0 ? "+" : ""}
                        {formatCurrency(
                          diferencia,
                          selectedCuenta.moneda
                        )}
                      </span>
                    </div>
                    <p className="font-body text-xs mt-1 text-muted-foreground">
                      {diferencia === 0
                        ? "El saldo físico coincide con el sistema"
                        : diferencia > 0
                          ? "Sobrante de efectivo"
                          : "Faltante de efectivo"}
                    </p>
                  </motion.div>
                )}

                {/* Notas */}
                <div className="space-y-1.5">
                  <Label className="font-body text-sm">Notas</Label>
                  <Textarea
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    placeholder="Observaciones del arqueo..."
                    rows={3}
                    className="font-body text-sm"
                  />
                </div>
              </motion.div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                resetForm();
              }}
              className="font-body text-sm"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !selectedCuentaId}
              className="bg-bordo-800 hover:bg-bordo-700 text-white rounded-lg font-body text-sm"
            >
              {submitting ? "Registrando..." : "Registrar Arqueo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
