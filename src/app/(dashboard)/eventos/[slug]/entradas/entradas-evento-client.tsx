"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Ticket,
  DollarSign,
  Users,
  Download,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

interface Entrada {
  id: number;
  codigo: string;
  nombre_asistente: string;
  cedula_asistente: string | null;
  email_asistente: string | null;
  precio_pagado: number;
  estado: string;
  metodo_pago: string | null;
  created_at: string;
  usado_at: string | null;
  tipo_entradas: { nombre: string } | null;
  lotes_entrada: { nombre: string } | null;
}

interface Stats {
  total: number;
  pagadas: number;
  usadas: number;
  canceladas: number;
  recaudacion: number;
}

const ESTADO_ICONS: Record<string, React.ReactNode> = {
  pagada: <CheckCircle2 className="size-3.5 text-green-600" />,
  usada: <CheckCircle2 className="size-3.5 text-blue-600" />,
  pendiente: <Clock className="size-3.5 text-yellow-600" />,
  cancelada: <XCircle className="size-3.5 text-red-500" />,
  reembolsada: <XCircle className="size-3.5 text-red-500" />,
};

const ESTADO_COLORS: Record<string, string> = {
  pagada: "bg-green-100 text-green-700",
  usada: "bg-blue-100 text-blue-700",
  pendiente: "bg-yellow-100 text-yellow-700",
  cancelada: "bg-red-100 text-red-600",
  reembolsada: "bg-red-50 text-red-500",
};

export function EntradasEventoClient({ eventoId }: { eventoId: number }) {
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, pagadas: 0, usadas: 0, canceladas: 0, recaudacion: 0 });
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [showVentaManual, setShowVentaManual] = useState(false);

  const fetchEntradas = async () => {
    try {
      const url = new URL(`/api/admin/eventos/${eventoId}/entradas`, window.location.origin);
      if (filtroEstado !== "todos") url.searchParams.set("estado", filtroEstado);

      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setEntradas(data.entradas);
        setStats(data.stats);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchEntradas();
  }, [eventoId, filtroEstado]);

  const entradasFiltradas = useMemo(() => {
    if (!search) return entradas;
    const q = search.toLowerCase();
    return entradas.filter(
      (e) =>
        e.nombre_asistente?.toLowerCase().includes(q) ||
        e.cedula_asistente?.toLowerCase().includes(q) ||
        e.codigo?.toLowerCase().includes(q)
    );
  }, [entradas, search]);

  const handleExportCSV = () => {
    const headers = ["Nombre", "Cédula", "Email", "Tipo", "Lote", "Estado", "Precio", "Fecha"];
    const rows = entradas.map((e) => [
      e.nombre_asistente,
      e.cedula_asistente || "",
      e.email_asistente || "",
      e.tipo_entradas?.nombre || "",
      e.lotes_entrada?.nombre || "",
      e.estado,
      e.precio_pagado,
      format(new Date(e.created_at), "dd/MM/yyyy HH:mm"),
    ]);

    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `entradas-evento-${eventoId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleVentaManual = async (data: {
    tipo_entrada_id: number;
    nombre_asistente: string;
    cedula_asistente: string;
    email_asistente: string;
    metodo_pago: "efectivo" | "cortesia";
    precio_pagado: number;
  }) => {
    try {
      const res = await fetch(`/api/admin/eventos/${eventoId}/entradas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      toast.success("Entrada emitida correctamente");
      setShowVentaManual(false);
      fetchEntradas();
    } catch (err: any) {
      toast.error(err.message || "Error al crear entrada");
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <Link
          href="/eventos/admin"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Eventos
        </Link>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Entradas del evento
        </h1>
      </motion.div>

      {/* Stats */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {[
          { label: "Total", value: stats.total, icon: Ticket },
          { label: "Pagadas", value: stats.pagadas, icon: CheckCircle2 },
          { label: "Usadas", value: stats.usadas, icon: Users },
          {
            label: "Recaudación",
            value: `$${stats.recaudacion.toLocaleString("es-UY")}`,
            icon: DollarSign,
          },
        ].map((s) => (
          <motion.div
            key={s.label}
            variants={fadeInUp}
            className="rounded-xl border border-linea bg-white p-4"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <s.icon className="size-4" />
              <span className="text-xs font-medium">{s.label}</span>
            </div>
            <p className="mt-1 font-display text-2xl font-bold text-foreground">
              {s.value}
            </p>
          </motion.div>
        ))}
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, cédula o código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filtroEstado} onValueChange={(v) => { if (v) setFiltroEstado(v); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pagada">Pagada</SelectItem>
              <SelectItem value="usada">Usada</SelectItem>
              <SelectItem value="pendiente">Pendiente</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="mr-1 size-3.5" />
            CSV
          </Button>
          <Button
            size="sm"
            className="bg-bordo hover:bg-bordo-900 text-white"
            onClick={() => setShowVentaManual(true)}
          >
            <Plus className="mr-1 size-3.5" />
            Venta manual
          </Button>
        </div>
      </motion.div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded" />
          ))}
        </div>
      ) : entradasFiltradas.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-2 py-16 text-muted-foreground"
        >
          <Ticket className="size-12 opacity-20" />
          <p className="font-medium">Sin entradas</p>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="rounded-xl border border-linea bg-white overflow-hidden"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asistente</TableHead>
                <TableHead>Cédula</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entradasFiltradas.map((entrada) => (
                <TableRow key={entrada.id}>
                  <TableCell className="font-medium">
                    {entrada.nombre_asistente}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {entrada.cedula_asistente || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {entrada.tipo_entradas?.nombre || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {entrada.lotes_entrada?.nombre || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`gap-1 ${ESTADO_COLORS[entrada.estado] || ""}`}
                    >
                      {ESTADO_ICONS[entrada.estado]}
                      {entrada.estado}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    ${entrada.precio_pagado.toLocaleString("es-UY")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(entrada.created_at), "d MMM HH:mm", {
                      locale: es,
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </motion.div>
      )}

      {/* Manual sale dialog */}
      <VentaManualDialog
        open={showVentaManual}
        onOpenChange={setShowVentaManual}
        eventoId={eventoId}
        onConfirmar={handleVentaManual}
      />
    </div>
  );
}

// --- Venta manual dialog ---

function VentaManualDialog({
  open,
  onOpenChange,
  eventoId,
  onConfirmar,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventoId: number;
  onConfirmar: (data: any) => void;
}) {
  const [tipos, setTipos] = useState<any[]>([]);
  const [nombre, setNombre] = useState("");
  const [cedula, setCedula] = useState("");
  const [email, setEmail] = useState("");
  const [tipoId, setTipoId] = useState<string>("");
  const [metodo, setMetodo] = useState<"efectivo" | "cortesia">("efectivo");
  const [precio, setPrecio] = useState(0);

  useEffect(() => {
    if (!open) return;
    async function fetchTipos() {
      const res = await fetch(`/api/admin/eventos/${eventoId}`);
      if (res.ok) {
        const data = await res.json();
        setTipos(data.tipo_entradas || []);
      }
    }
    fetchTipos();
  }, [open, eventoId]);

  useEffect(() => {
    if (metodo === "cortesia") setPrecio(0);
  }, [metodo]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Venta manual</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <Label>Tipo de entrada *</Label>
            <Select value={tipoId} onValueChange={(v) => {
              if (!v) return;
              setTipoId(v);
              const tipo = tipos.find((t: any) => String(t.id) === v);
              if (tipo) setPrecio(tipo.precio);
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                {tipos.map((t: any) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.nombre} — ${t.precio}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Nombre *</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div>
            <Label>Cédula</Label>
            <Input value={cedula} onChange={(e) => setCedula(e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </div>

          <div className="flex gap-4">
            <div>
              <Label>Método</Label>
              <Select value={metodo} onValueChange={(v: any) => setMetodo(v)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="cortesia">Cortesía</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Precio</Label>
              <Input
                type="number"
                value={precio}
                onChange={(e) => setPrecio(Number(e.target.value))}
                disabled={metodo === "cortesia"}
              />
            </div>
          </div>

          <Button
            className="w-full bg-bordo hover:bg-bordo-900 text-white"
            disabled={!tipoId || !nombre}
            onClick={() =>
              onConfirmar({
                tipo_entrada_id: Number(tipoId),
                nombre_asistente: nombre,
                cedula_asistente: cedula,
                email_asistente: email || undefined,
                metodo_pago: metodo,
                precio_pagado: precio,
              })
            }
          >
            Emitir entrada
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
