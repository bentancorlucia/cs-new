"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowRightLeft, Plus, ArrowRight } from "lucide-react";
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
import { staggerContainer, fadeInUp, springSmooth } from "@/lib/motion";
import { toast } from "sonner";

interface CuentaFinanciera {
  id: number;
  nombre: string;
  tipo: string;
  moneda: string;
  saldo_actual: number;
  color: string | null;
  activa: boolean;
}

interface Transferencia {
  id: number;
  fecha: string;
  cuenta_origen_id: number;
  cuenta_destino_id: number;
  cuenta_origen_nombre: string;
  cuenta_destino_nombre: string;
  cuenta_origen_color: string | null;
  cuenta_destino_color: string | null;
  cuenta_origen_moneda: string;
  cuenta_destino_moneda: string;
  monto: number;
  monto_destino: number | null;
  tipo_cambio: number | null;
  descripcion: string;
}

interface TransferenciasResponse {
  data: Transferencia[];
  total: number;
  page: number;
  limit: number;
}

const PAGE_SIZE = 15;

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

export default function TransferenciasPage() {
  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [monto, setMonto] = useState("");
  const [tipoCambio, setTipoCambio] = useState("");
  const [fecha, setFecha] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [descripcion, setDescripcion] = useState("");

  const fetchTransferencias = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/tesoreria/transferencias?page=${page}&limit=${PAGE_SIZE}`
      );
      if (!res.ok) throw new Error("Error al cargar transferencias");
      const json: TransferenciasResponse = await res.json();
      setTransferencias(json.data);
      setTotal(json.total);
    } catch {
      toast.error("No se pudieron cargar las transferencias");
    } finally {
      setLoading(false);
    }
  }, [page]);

  const fetchCuentas = useCallback(async () => {
    try {
      const res = await fetch("/api/tesoreria/cuentas?activas=true");
      if (!res.ok) throw new Error("Error al cargar cuentas");
      const json = await res.json();
      setCuentas(json.data || json);
    } catch {
      toast.error("No se pudieron cargar las cuentas");
    }
  }, []);

  useEffect(() => {
    fetchCuentas();
  }, [fetchCuentas]);

  useEffect(() => {
    fetchTransferencias();
  }, [fetchTransferencias]);

  const cuentaOrigen = cuentas.find((c) => String(c.id) === origenId);
  const cuentaDestino = cuentas.find((c) => String(c.id) === destinoId);
  const currenciesDiffer =
    cuentaOrigen && cuentaDestino && cuentaOrigen.moneda !== cuentaDestino.moneda;

  const montoNum = parseFloat(monto) || 0;
  const tipoCambioNum = parseFloat(tipoCambio) || 0;
  const montoDestino = currenciesDiffer ? montoNum * tipoCambioNum : montoNum;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function resetForm() {
    setOrigenId("");
    setDestinoId("");
    setMonto("");
    setTipoCambio("");
    setFecha(new Date().toISOString().split("T")[0]);
    setDescripcion("");
  }

  async function handleSubmit() {
    if (!origenId || !destinoId || !monto || !descripcion) {
      toast.error("Completar todos los campos obligatorios");
      return;
    }
    if (origenId === destinoId) {
      toast.error("La cuenta origen y destino deben ser diferentes");
      return;
    }
    if (montoNum <= 0) {
      toast.error("El monto debe ser mayor a cero");
      return;
    }
    if (currenciesDiffer && tipoCambioNum <= 0) {
      toast.error("Ingresar un tipo de cambio válido");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        cuenta_origen_id: parseInt(origenId),
        cuenta_destino_id: parseInt(destinoId),
        monto: montoNum,
        fecha,
        descripcion,
      };
      if (currenciesDiffer) {
        body.tipo_cambio = tipoCambioNum;
        body.monto_destino = montoDestino;
      }

      const res = await fetch("/api/tesoreria/transferencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Error al crear transferencia");
      }

      toast.success("Transferencia registrada correctamente");
      setDialogOpen(false);
      resetForm();
      setPage(1);
      fetchTransferencias();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al crear transferencia"
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
            Transferencias
          </h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            Movimientos entre cuentas del club
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-bordo-800 hover:bg-bordo-700 text-white rounded-lg w-full sm:w-auto"
        >
          <Plus className="size-4 mr-2" />
          Nueva Transferencia
        </Button>
      </motion.div>

      {/* Table */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={fadeInUp} transition={springSmooth}>
          <Card className="border-linea">
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-sm uppercase tracking-editorial">
                Historial de Transferencias
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded" />
                  ))}
                </div>
              ) : transferencias.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ArrowRightLeft className="size-10 text-muted-foreground/40 mb-3" />
                  <p className="font-body text-sm text-muted-foreground">
                    No hay transferencias registradas
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 font-body"
                    onClick={() => setDialogOpen(true)}
                  >
                    <Plus className="size-4 mr-1" />
                    Crear primera transferencia
                  </Button>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto -mx-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="font-heading text-xs uppercase">
                            Fecha
                          </TableHead>
                          <TableHead className="font-heading text-xs uppercase">
                            Origen
                          </TableHead>
                          <TableHead className="font-heading text-xs uppercase w-8" />
                          <TableHead className="font-heading text-xs uppercase">
                            Destino
                          </TableHead>
                          <TableHead className="font-heading text-xs uppercase text-right">
                            Monto
                          </TableHead>
                          <TableHead className="font-heading text-xs uppercase hidden md:table-cell">
                            Descripción
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transferencias.map((t, idx) => (
                          <motion.tr
                            key={t.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              delay: idx * 0.03,
                              ...springSmooth,
                            }}
                            className="border-b border-linea last:border-0"
                          >
                            <TableCell className="font-body text-sm text-muted-foreground whitespace-nowrap">
                              {formatDate(t.fecha)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span
                                  className="size-2 rounded-full shrink-0"
                                  style={{
                                    backgroundColor:
                                      t.cuenta_origen_color || "#730d32",
                                  }}
                                />
                                <span className="font-body text-sm text-foreground truncate max-w-[120px]">
                                  {t.cuenta_origen_nombre}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="px-1">
                              <ArrowRight className="size-3.5 text-muted-foreground" />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span
                                  className="size-2 rounded-full shrink-0"
                                  style={{
                                    backgroundColor:
                                      t.cuenta_destino_color || "#730d32",
                                  }}
                                />
                                <span className="font-body text-sm text-foreground truncate max-w-[120px]">
                                  {t.cuenta_destino_nombre}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <span className="font-body text-sm font-medium text-foreground">
                                {formatCurrency(t.monto, t.cuenta_origen_moneda)}
                              </span>
                              {t.tipo_cambio && (
                                <div className="mt-0.5">
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-body text-muted-foreground"
                                  >
                                    TC: {t.tipo_cambio.toFixed(4)}
                                  </Badge>
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="font-body text-sm text-muted-foreground hidden md:table-cell max-w-[200px] truncate">
                              {t.descripcion}
                            </TableCell>
                          </motion.tr>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4 border-t border-linea mt-4">
                      <p className="font-body text-xs text-muted-foreground">
                        Página {page} de {totalPages} ({total} registros)
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="font-body text-xs"
                          disabled={page <= 1}
                          onClick={() => setPage((p) => p - 1)}
                        >
                          Anterior
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="font-body text-xs"
                          disabled={page >= totalPages}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          Siguiente
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Create Transfer Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-sm uppercase tracking-editorial">
              Nueva Transferencia
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Cuenta Origen */}
            <div className="space-y-1.5">
              <Label className="font-body text-sm">Cuenta Origen</Label>
              <Select value={origenId} onValueChange={(v) => setOrigenId(v ?? "")}>
                <SelectTrigger className="font-body text-sm">
                  <SelectValue placeholder="Seleccionar cuenta origen" />
                </SelectTrigger>
                <SelectContent>
                  {cuentas
                    .filter((c) => String(c.id) !== destinoId)
                    .map((c) => (
                      <SelectItem
                        key={c.id}
                        value={String(c.id)}
                        className="font-body text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2 rounded-full shrink-0"
                            style={{
                              backgroundColor: c.color || "#730d32",
                            }}
                          />
                          <span>{c.nombre}</span>
                          <span className="text-muted-foreground">
                            ({c.moneda} {formatCurrency(c.saldo_actual, c.moneda)})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cuenta Destino */}
            <div className="space-y-1.5">
              <Label className="font-body text-sm">Cuenta Destino</Label>
              <Select value={destinoId} onValueChange={(v) => setDestinoId(v ?? "")}>
                <SelectTrigger className="font-body text-sm">
                  <SelectValue placeholder="Seleccionar cuenta destino" />
                </SelectTrigger>
                <SelectContent>
                  {cuentas
                    .filter((c) => String(c.id) !== origenId)
                    .map((c) => (
                      <SelectItem
                        key={c.id}
                        value={String(c.id)}
                        className="font-body text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2 rounded-full shrink-0"
                            style={{
                              backgroundColor: c.color || "#730d32",
                            }}
                          />
                          <span>{c.nombre}</span>
                          <span className="text-muted-foreground">
                            ({c.moneda} {formatCurrency(c.saldo_actual, c.moneda)})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Monto */}
            <div className="space-y-1.5">
              <Label className="font-body text-sm">
                Monto{cuentaOrigen ? ` (${cuentaOrigen.moneda})` : ""}
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                className="font-body text-sm"
              />
            </div>

            {/* Tipo de Cambio (only when currencies differ) */}
            {currenciesDiffer && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={springSmooth}
                className="space-y-3"
              >
                <div className="space-y-1.5">
                  <Label className="font-body text-sm">
                    Tipo de Cambio ({cuentaOrigen?.moneda} a{" "}
                    {cuentaDestino?.moneda})
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={tipoCambio}
                    onChange={(e) => setTipoCambio(e.target.value)}
                    placeholder="0.0000"
                    className="font-body text-sm"
                  />
                </div>

                {montoNum > 0 && tipoCambioNum > 0 && (
                  <div className="rounded-lg bg-superficie p-3">
                    <p className="font-body text-xs text-muted-foreground">
                      Monto destino calculado
                    </p>
                    <p className="font-display text-lg tracking-tightest text-foreground mt-0.5">
                      {formatCurrency(montoDestino, cuentaDestino?.moneda || "UYU")}
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {/* Fecha */}
            <div className="space-y-1.5">
              <Label className="font-body text-sm">Fecha</Label>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="font-body text-sm"
              />
            </div>

            {/* Descripción */}
            <div className="space-y-1.5">
              <Label className="font-body text-sm">Descripción *</Label>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Motivo de la transferencia"
                rows={3}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 font-body text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
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
              disabled={submitting}
              className="bg-bordo-800 hover:bg-bordo-700 text-white rounded-lg font-body text-sm"
            >
              {submitting ? "Registrando..." : "Registrar Transferencia"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
