"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart,
  Wallet,
  History,
  Settings,
  Plus,
  Loader2,
  ExternalLink,
  Sparkles,
  Check,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { springSmooth } from "@/lib/motion";
import { DonacionStep } from "@/components/tienda/donacion-step";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { fadeInUp } from "@/lib/motion";
import { toast } from "sonner";
import { useDocumentTitle } from "@/hooks/use-document-title";

interface DonacionConfig {
  id: number;
  activo: boolean;
  monto_1: number;
  monto_2: number;
  monto_3: number;
  permitir_monto_custom: boolean;
  monto_custom_max: number;
  titulo: string;
  descripcion: string;
}

interface PendienteRow {
  id: number;
  monto: number;
  cobrada_at: string | null;
  created_at: string;
  pedido: {
    id: number;
    numero_pedido: string;
    cliente: string;
  };
}

interface TransferenciaRow {
  id: number;
  fecha_transferencia: string;
  monto_total: number;
  cantidad_donaciones: number;
  comprobante_url: string | null;
  notas: string | null;
  created_at: string;
}

interface Kpis {
  totalPendiente: number;
  cantidadPendiente: number;
  totalTransferido: number;
  totalRecaudado: number;
}

function formatFecha(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmt$(n: number) {
  return `$${n.toLocaleString("es-UY")}`;
}

export default function AdminDonacionesPage() {
  useDocumentTitle("Donaciones");
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<DonacionConfig | null>(null);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [pendientes, setPendientes] = useState<PendienteRow[]>([]);
  const [transferencias, setTransferencias] = useState<TransferenciaRow[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);
  const [transferDialog, setTransferDialog] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/donaciones");
      if (!res.ok) throw new Error("Error al cargar donaciones");
      const json = await res.json();
      setConfig(json.config);
      setKpis(json.kpis);
      setPendientes(json.pendientes || []);
      setTransferencias(json.transferencias || []);
    } catch {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function saveConfig() {
    if (!config) return;
    setSavingConfig(true);
    try {
      const res = await fetch("/api/admin/donaciones/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activo: config.activo,
          monto_1: Number(config.monto_1),
          monto_2: Number(config.monto_2),
          monto_3: Number(config.monto_3),
          permitir_monto_custom: config.permitir_monto_custom,
          monto_custom_max: Number(config.monto_custom_max),
          titulo: config.titulo,
          descripcion: config.descripcion,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      toast.success("Configuración guardada");
    } catch (e: any) {
      toast.error(e.message || "Error al guardar");
    } finally {
      setSavingConfig(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      className="space-y-6 p-4 sm:p-6"
    >
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Heart className="size-5 text-pink-700" />
            <h1 className="font-display text-title-2 uppercase tracking-tightest text-bordo-950">
              Donaciones
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Olla del Hogar de Cristo · gestión y transferencias mensuales
          </p>
        </div>
        {config?.activo ? (
          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            Feature activa
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Feature desactivada
          </span>
        )}
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-pink-50/40 p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-pink-700">
            <Wallet className="size-4" />
            Pendiente de transferir
          </div>
          <p className="mt-2 font-display text-3xl tracking-tight text-bordo-950">
            {fmt$(kpis?.totalPendiente || 0)}
          </p>
          <p className="text-xs text-muted-foreground">
            {kpis?.cantidadPendiente || 0} donaciones cobradas
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <History className="size-4" />
            Transferido a la Olla
          </div>
          <p className="mt-2 font-display text-3xl tracking-tight text-bordo-950">
            {fmt$(kpis?.totalTransferido || 0)}
          </p>
          <p className="text-xs text-muted-foreground">
            {transferencias.length} transferencias
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Heart className="size-4" />
            Recaudado total
          </div>
          <p className="mt-2 font-display text-3xl tracking-tight text-bordo-950">
            {fmt$(kpis?.totalRecaudado || 0)}
          </p>
          <p className="text-xs text-muted-foreground">desde el inicio</p>
        </div>
      </div>

      <Tabs defaultValue="pendientes" className="w-full">
        <TabsList>
          <TabsTrigger value="pendientes">
            Pendientes ({pendientes.length})
          </TabsTrigger>
          <TabsTrigger value="historial">
            Historial ({transferencias.length})
          </TabsTrigger>
          <TabsTrigger value="config">
            <Settings className="mr-1.5 size-3.5" />
            Configuración
          </TabsTrigger>
        </TabsList>

        {/* Pendientes */}
        <TabsContent value="pendientes" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Donaciones cobradas que aún no se transfirieron a la Olla.
            </p>
            <Button
              onClick={() => setTransferDialog(true)}
              disabled={pendientes.length === 0}
              className="gap-1.5"
            >
              <Plus className="size-4" />
              Registrar transferencia
            </Button>
          </div>

          <div className="rounded-xl border bg-white">
            {pendientes.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                <Heart className="mx-auto mb-3 size-10 text-pink-200" />
                No hay donaciones pendientes de transferir.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Cobrada</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendientes.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <Link
                          href={`/admin/pedidos/${d.pedido.id}`}
                          className="font-mono text-sm font-medium text-bordo-800 hover:underline"
                        >
                          {d.pedido.numero_pedido}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        {d.pedido.cliente}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatFecha(d.cobrada_at)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {fmt$(d.monto)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-pink-50/40 font-bold">
                    <TableCell colSpan={3} className="text-right">
                      Total a transferir
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt$(kpis?.totalPendiente || 0)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* Historial */}
        <TabsContent value="historial" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Transferencias registradas a la Olla del Hogar de Cristo.
          </p>
          <div className="rounded-xl border bg-white">
            {transferencias.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                Aún no hay transferencias registradas.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Notas</TableHead>
                    <TableHead>Comprobante</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transferencias.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm">
                        {formatFecha(t.fecha_transferencia)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {t.cantidad_donaciones} donaciones
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {t.notas || "—"}
                      </TableCell>
                      <TableCell>
                        {t.comprobante_url ? (
                          <a
                            href={t.comprobante_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-bordo-800 hover:underline"
                          >
                            Ver <ExternalLink className="size-3" />
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {fmt$(Number(t.monto_total))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* Config */}
        <TabsContent value="config" className="space-y-6">
          {config && (
            <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
              {/* Form */}
              <div className="space-y-6">
                {/* Toggle hero */}
                <motion.div
                  layout
                  transition={springSmooth}
                  className={cn(
                    "relative overflow-hidden rounded-2xl border-2 p-6 transition-colors",
                    config.activo
                      ? "border-bordo-800 bg-gradient-to-br from-bordo-800 to-bordo-900 text-white"
                      : "border-bordo-800/15 bg-white"
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Sparkles
                          className={cn(
                            "size-4",
                            config.activo ? "text-dorado-300" : "text-bordo-800/40"
                          )}
                        />
                        <span
                          className={cn(
                            "font-heading text-[10px] font-bold uppercase tracking-editorial",
                            config.activo
                              ? "text-dorado-300"
                              : "text-bordo-800/50"
                          )}
                        >
                          Estado de la feature
                        </span>
                      </div>
                      <h3
                        className={cn(
                          "mt-1 font-display text-title-3 uppercase tracking-tightest",
                          config.activo ? "text-white" : "text-bordo-950"
                        )}
                      >
                        {config.activo ? "Donaciones activas" : "Donaciones desactivadas"}
                      </h3>
                      <p
                        className={cn(
                          "mt-1.5 text-sm leading-relaxed max-w-md",
                          config.activo ? "text-white/70" : "text-bordo-800/50"
                        )}
                      >
                        {config.activo
                          ? "Los clientes ven la opción de donar en el checkout y pueden agregar el monto a su transferencia."
                          : "La opción de donar está oculta del checkout. Activala para empezar a recibir donaciones."}
                      </p>
                    </div>
                    <Switch
                      checked={config.activo}
                      onCheckedChange={(v) =>
                        setConfig({ ...config, activo: v })
                      }
                      className="scale-125 data-[state=checked]:bg-dorado-300 data-[state=checked]:[&>span]:bg-bordo-900"
                    />
                  </div>
                </motion.div>

                {/* Montos sugeridos */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="rounded-2xl border border-bordo-800/10 bg-white"
                >
                  <div className="border-b border-bordo-800/8 px-6 py-4">
                    <span className="font-heading text-[10px] font-bold uppercase tracking-editorial text-bordo-800/50">
                      Montos sugeridos
                    </span>
                    <p className="mt-0.5 text-sm text-bordo-800/60">
                      Tres botones que verá el cliente. Editalos según el contexto.
                    </p>
                  </div>
                  <div className="grid gap-4 p-6 sm:grid-cols-3">
                    {[1, 2, 3].map((i) => {
                      const key = `monto_${i}` as "monto_1" | "monto_2" | "monto_3";
                      return (
                        <div key={i}>
                          <Label className="font-heading text-[10px] font-bold uppercase tracking-editorial text-bordo-800/40">
                            Opción {i}
                          </Label>
                          <div className="mt-1 flex items-center gap-1 border-2 border-bordo-800/15 bg-white px-3 py-2 transition-colors focus-within:border-bordo-800">
                            <span className="font-display text-xl text-bordo-800/30">
                              $
                            </span>
                            <input
                              type="number"
                              min={1}
                              value={config[key]}
                              onChange={(e) =>
                                setConfig({
                                  ...config,
                                  [key]: Number(e.target.value) || 0,
                                })
                              }
                              className="flex-1 bg-transparent font-display text-xl tracking-tight text-bordo-950 outline-none"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>

                {/* Monto custom */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="rounded-2xl border border-bordo-800/10 bg-white"
                >
                  <div className="flex items-center justify-between gap-4 px-6 py-5">
                    <div className="min-w-0">
                      <span className="font-heading text-[10px] font-bold uppercase tracking-editorial text-bordo-800/50">
                        Monto libre
                      </span>
                      <p className="mt-0.5 text-sm text-bordo-800/60">
                        Permite al cliente ingresar un monto distinto a las opciones sugeridas.
                      </p>
                    </div>
                    <Switch
                      checked={config.permitir_monto_custom}
                      onCheckedChange={(v) =>
                        setConfig({ ...config, permitir_monto_custom: v })
                      }
                    />
                  </div>
                  <AnimatePresence>
                    {config.permitir_monto_custom && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden border-t border-bordo-800/8"
                      >
                        <div className="px-6 py-5">
                          <Label className="font-heading text-[10px] font-bold uppercase tracking-editorial text-bordo-800/40">
                            Tope máximo permitido
                          </Label>
                          <div className="mt-1 flex items-center gap-1 border-2 border-bordo-800/15 bg-white px-3 py-2 transition-colors focus-within:border-bordo-800 max-w-xs">
                            <span className="font-display text-base text-bordo-800/30">
                              $
                            </span>
                            <input
                              type="number"
                              min={1}
                              value={config.monto_custom_max}
                              onChange={(e) =>
                                setConfig({
                                  ...config,
                                  monto_custom_max: Number(e.target.value) || 0,
                                })
                              }
                              className="flex-1 bg-transparent font-display text-base tracking-tight text-bordo-950 outline-none"
                            />
                          </div>
                          <p className="mt-1.5 font-heading text-[10px] uppercase tracking-editorial text-bordo-800/40">
                            Evita montos accidentales muy altos
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Texto en checkout */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="rounded-2xl border border-bordo-800/10 bg-white"
                >
                  <div className="border-b border-bordo-800/8 px-6 py-4">
                    <span className="font-heading text-[10px] font-bold uppercase tracking-editorial text-bordo-800/50">
                      Texto en checkout
                    </span>
                    <p className="mt-0.5 text-sm text-bordo-800/60">
                      Lo que el cliente lee al elegir una donación.
                    </p>
                  </div>
                  <div className="space-y-4 p-6">
                    <div>
                      <Label className="font-heading text-[10px] font-bold uppercase tracking-editorial text-bordo-800/40">
                        Título
                      </Label>
                      <Input
                        value={config.titulo}
                        maxLength={120}
                        onChange={(e) =>
                          setConfig({ ...config, titulo: e.target.value })
                        }
                        className="mt-1 border-2 border-bordo-800/15 bg-white font-display text-base tracking-tight text-bordo-950 focus-visible:border-bordo-800 focus-visible:ring-0"
                      />
                      <p className="mt-1 font-heading text-[10px] uppercase tracking-editorial text-bordo-800/30">
                        {config.titulo.length}/120
                      </p>
                    </div>
                    <div>
                      <Label className="font-heading text-[10px] font-bold uppercase tracking-editorial text-bordo-800/40">
                        Descripción
                      </Label>
                      <Textarea
                        value={config.descripcion}
                        rows={4}
                        maxLength={2000}
                        onChange={(e) =>
                          setConfig({ ...config, descripcion: e.target.value })
                        }
                        className="mt-1 resize-none border-2 border-bordo-800/15 bg-white text-sm text-bordo-950 focus-visible:border-bordo-800 focus-visible:ring-0"
                      />
                      <p className="mt-1 font-heading text-[10px] uppercase tracking-editorial text-bordo-800/30">
                        {config.descripcion.length}/2000
                      </p>
                    </div>
                  </div>
                </motion.div>

                {/* Save */}
                <div className="sticky bottom-4 z-10 flex justify-end">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={saveConfig}
                    disabled={savingConfig}
                    className="flex items-center gap-2 bg-bordo-800 px-6 py-3 font-heading text-xs uppercase tracking-editorial text-white shadow-lg shadow-bordo-900/20 hover:bg-bordo-900 disabled:opacity-50"
                  >
                    {savingConfig ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Guardando
                      </>
                    ) : (
                      <>
                        <Check className="size-4" />
                        Guardar configuración
                      </>
                    )}
                  </motion.button>
                </div>
              </div>

              {/* Preview */}
              <div className="lg:sticky lg:top-6 lg:h-fit">
                <div className="overflow-hidden rounded-2xl border border-bordo-800/10 bg-superficie">
                  <div className="flex items-center gap-2 border-b border-bordo-800/10 bg-white px-5 py-3">
                    <Eye className="size-3.5 text-bordo-800/40" />
                    <span className="font-heading text-[10px] font-bold uppercase tracking-editorial text-bordo-800/50">
                      Preview en checkout
                    </span>
                  </div>
                  <div className="bg-white p-5">
                    <DonacionStep
                      key={`${config.monto_1}-${config.monto_2}-${config.monto_3}-${config.permitir_monto_custom}-${config.titulo}-${config.descripcion}`}
                      config={{
                        activo: true,
                        monto_1: Number(config.monto_1) || 0,
                        monto_2: Number(config.monto_2) || 0,
                        monto_3: Number(config.monto_3) || 0,
                        permitir_monto_custom: config.permitir_monto_custom,
                        monto_custom_max: Number(config.monto_custom_max) || 0,
                        titulo: config.titulo,
                        descripcion: config.descripcion,
                      }}
                      value={0}
                      onChange={() => {}}
                    />
                  </div>
                </div>
                <p className="mt-3 text-center font-heading text-[10px] uppercase tracking-editorial text-bordo-800/40">
                  Así lo ve el cliente
                </p>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <RegistrarTransferenciaDialog
        open={transferDialog}
        onOpenChange={setTransferDialog}
        montoPendiente={kpis?.totalPendiente || 0}
        cantidadPendiente={kpis?.cantidadPendiente || 0}
        onSuccess={() => {
          setTransferDialog(false);
          fetchData();
        }}
      />
    </motion.div>
  );
}

function RegistrarTransferenciaDialog({
  open,
  onOpenChange,
  montoPendiente,
  cantidadPendiente,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  montoPendiente: number;
  cantidadPendiente: number;
  onSuccess: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [fecha, setFecha] = useState(today);
  const [comprobanteUrl, setComprobanteUrl] = useState("");
  const [notas, setNotas] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/donaciones/transferencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha,
          comprobante_url: comprobanteUrl.trim() || null,
          notas: notas.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      toast.success(
        `Transferencia registrada: ${fmt$(json.monto_total)} (${json.cantidad} donaciones)`
      );
      setComprobanteUrl("");
      setNotas("");
      onSuccess();
    } catch (e: any) {
      toast.error(e.message || "Error al registrar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar transferencia a la Olla</DialogTitle>
          <DialogDescription>
            Confirmá que ya transferiste el monto pendiente. Esto marcará todas
            las donaciones cobradas como transferidas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-pink-200 bg-pink-50 p-3 text-sm text-pink-800">
            <div className="flex items-center justify-between">
              <span>Total a transferir:</span>
              <span className="font-display text-lg tracking-tight">
                {fmt$(montoPendiente)}
              </span>
            </div>
            <p className="mt-0.5 text-[11px]">
              {cantidadPendiente} donaciones cobradas
            </p>
          </div>

          <div>
            <Label>Fecha de la transferencia</Label>
            <Input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              max={today}
            />
          </div>

          <div>
            <Label>URL del comprobante (opcional)</Label>
            <Input
              type="url"
              placeholder="https://..."
              value={comprobanteUrl}
              onChange={(e) => setComprobanteUrl(e.target.value)}
            />
          </div>

          <div>
            <Label>Notas (opcional)</Label>
            <Textarea
              rows={3}
              placeholder="Ej: transferencia mensual mayo 2026"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !fecha}>
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" />
                Registrando...
              </>
            ) : (
              "Registrar transferencia"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
