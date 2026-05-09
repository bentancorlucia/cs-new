"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Heart,
  Wallet,
  History,
  Settings,
  Plus,
  Loader2,
  ExternalLink,
} from "lucide-react";
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
        <TabsContent value="config" className="space-y-4">
          {config && (
            <div className="space-y-4 rounded-xl border bg-white p-6">
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <p className="text-sm font-medium">
                    Habilitar donaciones en checkout
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Si está apagado, los clientes no ven la opción.
                  </p>
                </div>
                <Switch
                  checked={config.activo}
                  onCheckedChange={(v) =>
                    setConfig({ ...config, activo: v })
                  }
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label>Monto sugerido 1</Label>
                  <Input
                    type="number"
                    min={1}
                    value={config.monto_1}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        monto_1: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Monto sugerido 2</Label>
                  <Input
                    type="number"
                    min={1}
                    value={config.monto_2}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        monto_2: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Monto sugerido 3</Label>
                  <Input
                    type="number"
                    min={1}
                    value={config.monto_3}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        monto_3: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <div>
                  <p className="text-sm font-medium">Permitir monto libre</p>
                  <p className="text-xs text-muted-foreground">
                    El cliente puede ingresar un monto custom.
                  </p>
                </div>
                <Switch
                  checked={config.permitir_monto_custom}
                  onCheckedChange={(v) =>
                    setConfig({ ...config, permitir_monto_custom: v })
                  }
                />
              </div>

              {config.permitir_monto_custom && (
                <div>
                  <Label>Monto máximo permitido (custom)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={config.monto_custom_max}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        monto_custom_max: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              )}

              <div>
                <Label>Título</Label>
                <Input
                  value={config.titulo}
                  maxLength={120}
                  onChange={(e) =>
                    setConfig({ ...config, titulo: e.target.value })
                  }
                />
              </div>

              <div>
                <Label>Descripción (visible en checkout)</Label>
                <Textarea
                  value={config.descripcion}
                  rows={4}
                  maxLength={2000}
                  onChange={(e) =>
                    setConfig({ ...config, descripcion: e.target.value })
                  }
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={saveConfig} disabled={savingConfig}>
                  {savingConfig ? (
                    <>
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    "Guardar configuración"
                  )}
                </Button>
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
