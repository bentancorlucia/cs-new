"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Landmark,
  CreditCard,
  Banknote,
  Wallet,
  Settings2,
  ChevronRight,
  Pencil,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { staggerContainer, fadeInUp, springSmooth } from "@/lib/motion";
import { toast } from "sonner";
import { useDocumentTitle } from "@/hooks/use-document-title";

interface CuentaFinanciera {
  id: number;
  nombre: string;
  tipo: "bancaria" | "mercadopago" | "caja_chica" | "virtual";
  moneda: "UYU" | "USD";
  banco: string | null;
  numero_cuenta: string | null;
  saldo_actual: number;
  saldo_inicial: number;
  descripcion: string | null;
  color: string | null;
  activa: boolean;
  created_at: string;
}

interface CuentaForm {
  nombre: string;
  tipo: "bancaria" | "mercadopago" | "caja_chica" | "virtual";
  moneda: "UYU" | "USD";
  banco: string;
  numero_cuenta: string;
  saldo_inicial: number;
  descripcion: string;
  color: string;
  activa: boolean;
}

const TIPO_CONFIG = {
  bancaria: {
    label: "Bancaria",
    icon: Landmark,
    badgeBg: "bg-blue-100 text-blue-700",
  },
  mercadopago: {
    label: "MercadoPago",
    icon: CreditCard,
    badgeBg: "bg-sky-100 text-sky-700",
  },
  caja_chica: {
    label: "Caja Chica",
    icon: Banknote,
    badgeBg: "bg-amber-100 text-amber-700",
  },
  virtual: {
    label: "Virtual",
    icon: Wallet,
    badgeBg: "bg-gray-100 text-gray-700",
  },
};

const MONEDA_SYMBOL: Record<string, string> = {
  UYU: "$",
  USD: "U$S",
};

const DEFAULT_FORM: CuentaForm = {
  nombre: "",
  tipo: "bancaria",
  moneda: "UYU",
  banco: "",
  numero_cuenta: "",
  saldo_inicial: 0,
  descripcion: "",
  color: "#730d32",
  activa: true,
};

function AnimatedCounter({ value, prefix = "" }: { value: number; prefix?: string }) {
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

  return (
    <span className="tabular-nums">
      {prefix}
      {display.toLocaleString("es-UY")}
    </span>
  );
}

export default function CuentasFinancierasPage() {
  useDocumentTitle("Cuentas");
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CuentaForm>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);

  const fetchCuentas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tesoreria/cuentas");
      if (!res.ok) throw new Error("Error al cargar cuentas");
      const data = await res.json();
      setCuentas(data.data || []);
    } catch {
      toast.error("Error al cargar las cuentas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCuentas();
  }, [fetchCuentas]);

  function openCreateDialog() {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setDialogOpen(true);
  }

  function openEditDialog(cuenta: CuentaFinanciera) {
    setEditingId(cuenta.id);
    setForm({
      nombre: cuenta.nombre,
      tipo: cuenta.tipo,
      moneda: cuenta.moneda,
      banco: cuenta.banco || "",
      numero_cuenta: cuenta.numero_cuenta || "",
      saldo_inicial: cuenta.saldo_inicial,
      descripcion: cuenta.descripcion || "",
      color: cuenta.color || "#730d32",
      activa: cuenta.activa,
    });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!form.nombre.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }

    setSubmitting(true);
    try {
      const url = "/api/tesoreria/cuentas";
      const method = editingId ? "PUT" : "POST";

      const body = {
        ...(editingId ? { id: editingId } : {}),
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        moneda: form.moneda,
        banco: form.banco.trim() || undefined,
        numero_cuenta: form.numero_cuenta.trim() || undefined,
        saldo_inicial: form.saldo_inicial,
        descripcion: form.descripcion.trim() || undefined,
        color: form.color,
        activa: form.activa,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Error al guardar la cuenta");
        return;
      }

      toast.success(editingId ? "Cuenta actualizada" : "Cuenta creada");
      setDialogOpen(false);
      setEditingId(null);
      setForm(DEFAULT_FORM);
      fetchCuentas();
    } catch {
      toast.error("Error de conexion");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActiva(cuenta: CuentaFinanciera) {
    try {
      const res = await fetch("/api/tesoreria/cuentas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cuenta.id, activa: !cuenta.activa }),
      });

      if (!res.ok) {
        toast.error("Error al cambiar estado");
        return;
      }

      toast.success(cuenta.activa ? "Cuenta desactivada" : "Cuenta activada");
      fetchCuentas();
    } catch {
      toast.error("Error de conexion");
    }
  }

  const totalUYU = cuentas
    .filter((c) => c.moneda === "UYU" && c.activa)
    .reduce((sum, c) => sum + c.saldo_actual, 0);
  const totalUSD = cuentas
    .filter((c) => c.moneda === "USD" && c.activa)
    .reduce((sum, c) => sum + c.saldo_actual, 0);

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
            Cuentas Financieras
          </h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            {cuentas.length > 0 && `${cuentas.length} cuentas`}
            {cuentas.length > 0 && " \u00B7 "}
            Gestion de cuentas del club
          </p>
        </div>
        <Button onClick={openCreateDialog} className="w-full sm:w-auto">
          <Plus className="size-4" />
          Nueva Cuenta
        </Button>
      </motion.div>

      {/* Summary */}
      {!loading && cuentas.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="flex flex-wrap gap-4"
        >
          <div className="flex items-center gap-2 rounded-lg border border-linea bg-white px-4 py-2.5">
            <span className="font-body text-xs text-muted-foreground">Total UYU:</span>
            <span className="font-display text-lg uppercase tracking-tightest text-foreground">
              <AnimatedCounter value={totalUYU} prefix="$" />
            </span>
          </div>
          {totalUSD > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-linea bg-white px-4 py-2.5">
              <span className="font-body text-xs text-muted-foreground">Total USD:</span>
              <span className="font-display text-lg uppercase tracking-tightest text-foreground">
                <AnimatedCounter value={totalUSD} prefix="U$S " />
              </span>
            </div>
          )}
        </motion.div>
      )}

      {/* Accounts Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-44 rounded-xl border border-linea bg-white animate-pulse"
            />
          ))}
        </div>
      ) : cuentas.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <Settings2 className="size-12 text-muted-foreground/20 mb-3" />
          <p className="font-body text-sm text-muted-foreground">
            No hay cuentas registradas
          </p>
          <button
            onClick={openCreateDialog}
            className="mt-3 text-sm text-bordo-700 hover:text-bordo-800 font-body font-medium"
          >
            Crear primera cuenta
          </button>
        </motion.div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <AnimatePresence>
            {cuentas.map((cuenta) => {
              const tipoConfig = TIPO_CONFIG[cuenta.tipo];
              const TipoIcon = tipoConfig.icon;
              const symbol = MONEDA_SYMBOL[cuenta.moneda] || "$";

              return (
                <motion.div
                  key={cuenta.id}
                  variants={fadeInUp}
                  transition={springSmooth}
                  layout
                >
                  <Card
                    className={`relative overflow-hidden border-linea h-full transition-shadow hover:shadow-md ${
                      !cuenta.activa ? "opacity-60" : ""
                    }`}
                  >
                    {/* Color stripe */}
                    <div
                      className="absolute top-0 left-0 w-1 h-full rounded-l-xl"
                      style={{ backgroundColor: cuenta.color || "#730d32" }}
                    />

                    <CardContent className="p-5 pl-6">
                      {/* Top row: icon + badges + edit */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-superficie shrink-0">
                            <TipoIcon className="size-4 text-muted-foreground" strokeWidth={1.5} />
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant="secondary"
                              className={`text-[10px] font-body ${tipoConfig.badgeBg}`}
                            >
                              {tipoConfig.label}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] font-body">
                              {cuenta.moneda}
                            </Badge>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            openEditDialog(cuenta);
                          }}
                          className="text-muted-foreground hover:text-foreground transition-colors p-1"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      </div>

                      {/* Name + bank */}
                      <Link
                        href={`/tesoreria/cuentas/${cuenta.id}`}
                        className="group block"
                      >
                        <h3 className="font-heading text-sm uppercase tracking-editorial text-foreground group-hover:text-bordo-700 transition-colors line-clamp-1">
                          {cuenta.nombre}
                        </h3>
                        {cuenta.banco && (
                          <p className="font-body text-xs text-muted-foreground mt-0.5">
                            {cuenta.banco}
                            {cuenta.numero_cuenta && ` \u00B7 ${cuenta.numero_cuenta}`}
                          </p>
                        )}
                      </Link>

                      {/* Balance */}
                      <div className="mt-4">
                        <p className="font-body text-[11px] text-muted-foreground mb-0.5">
                          Saldo actual
                        </p>
                        <p className="font-display text-xl sm:text-2xl uppercase tracking-tightest text-foreground">
                          <AnimatedCounter
                            value={cuenta.saldo_actual}
                            prefix={`${symbol} `}
                          />
                        </p>
                      </div>

                      {/* Footer: toggle + link */}
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-linea">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={cuenta.activa}
                            onCheckedChange={() => handleToggleActiva(cuenta)}
                          />
                          <span className="font-body text-xs text-muted-foreground">
                            {cuenta.activa ? "Activa" : "Inactiva"}
                          </span>
                        </div>
                        <Link
                          href={`/tesoreria/cuentas/${cuenta.id}`}
                          className="inline-flex items-center gap-1 text-xs font-body font-medium text-bordo-700 hover:text-bordo-800 transition-colors"
                        >
                          Ver detalle
                          <ChevronRight className="size-3.5" />
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-base uppercase tracking-editorial">
              {editingId ? "Editar cuenta" : "Nueva cuenta financiera"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Nombre */}
            <div className="space-y-1.5">
              <Label className="font-body text-sm">Nombre *</Label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Cuenta Club Principal"
                className="font-body"
              />
            </div>

            {/* Tipo + Moneda */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-body text-sm">Tipo *</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) =>
                    v && setForm((f) => ({ ...f, tipo: v as CuentaForm["tipo"] }))
                  }
                >
                  <SelectTrigger className="font-body">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bancaria">Bancaria</SelectItem>
                    <SelectItem value="mercadopago">MercadoPago</SelectItem>
                    <SelectItem value="caja_chica">Caja Chica</SelectItem>
                    <SelectItem value="virtual">Virtual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-body text-sm">Moneda *</Label>
                <Select
                  value={form.moneda}
                  onValueChange={(v) =>
                    v && setForm((f) => ({ ...f, moneda: v as CuentaForm["moneda"] }))
                  }
                >
                  <SelectTrigger className="font-body">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UYU">UYU (Pesos)</SelectItem>
                    <SelectItem value="USD">USD (Dolares)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Banco + Numero cuenta */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-body text-sm">Banco</Label>
                <Input
                  value={form.banco}
                  onChange={(e) => setForm((f) => ({ ...f, banco: e.target.value }))}
                  placeholder="Ej: Itau, BROU..."
                  className="font-body"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-body text-sm">Nro. de cuenta</Label>
                <Input
                  value={form.numero_cuenta}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, numero_cuenta: e.target.value }))
                  }
                  placeholder="Ej: 123-456789"
                  className="font-body"
                />
              </div>
            </div>

            {/* Saldo inicial */}
            <div className="space-y-1.5">
              <Label className="font-body text-sm">Saldo inicial</Label>
              <Input
                type="number"
                value={form.saldo_inicial}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    saldo_inicial: parseFloat(e.target.value) || 0,
                  }))
                }
                placeholder="0"
                className="font-body"
              />
            </div>

            {/* Descripcion */}
            <div className="space-y-1.5">
              <Label className="font-body text-sm">Descripcion</Label>
              <Textarea
                value={form.descripcion}
                onChange={(e) =>
                  setForm((f) => ({ ...f, descripcion: e.target.value }))
                }
                placeholder="Descripcion opcional de la cuenta..."
                className="font-body"
                rows={2}
              />
            </div>

            {/* Color + Activa */}
            <div className="flex items-end gap-4">
              <div className="space-y-1.5">
                <Label className="font-body text-sm">Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, color: e.target.value }))
                    }
                    className="size-9 rounded-lg border border-linea cursor-pointer"
                  />
                  <span className="font-body text-xs text-muted-foreground">
                    {form.color}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Switch
                  checked={form.activa}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, activa: checked }))
                  }
                />
                <Label className="font-body text-sm">
                  {form.activa ? "Activa" : "Inactiva"}
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="font-body"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="font-body"
            >
              {submitting
                ? "Guardando..."
                : editingId
                  ? "Guardar cambios"
                  : "Crear cuenta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
