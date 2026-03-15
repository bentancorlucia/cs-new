"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Edit3,
  Save,
  X,
  Plus,
  Trash2,
  CreditCard,
  CheckCircle,
  AlertTriangle,
  XCircle,
  PauseCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase/client";
import { fadeInUp, staggerContainer, springSmooth } from "@/lib/motion";

interface PerfilDisciplina {
  id: number;
  disciplina_id: number;
  categoria: string | null;
  activa: boolean;
  fecha_ingreso: string;
  disciplinas: { id: number; nombre: string; slug: string } | null;
}

interface PagoSocio {
  id: number;
  monto: number;
  moneda: string;
  periodo_mes: number;
  periodo_anio: number;
  metodo_pago: string;
  referencia_pago: string | null;
  notas: string | null;
  created_at: string;
}

interface PerfilRol {
  id: number;
  rol_id: number;
  roles: { id: number; nombre: string; descripcion: string | null } | null;
}

interface SocioData {
  id: string;
  nombre: string;
  apellido: string;
  cedula: string | null;
  telefono: string | null;
  fecha_nacimiento: string | null;
  numero_socio: string | null;
  estado_socio: "activo" | "inactivo" | "moroso" | "suspendido";
  fecha_alta_socio: string | null;
  notas: string | null;
  perfil_disciplinas: PerfilDisciplina[];
  pagos_socios: PagoSocio[];
  perfil_roles: PerfilRol[];
}

interface Disciplina {
  id: number;
  nombre: string;
}

const ESTADO_CONFIG = {
  activo: { icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50", label: "Activo" },
  moroso: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50", label: "Moroso" },
  inactivo: { icon: XCircle, color: "text-gray-500", bg: "bg-gray-100", label: "Inactivo" },
  suspendido: { icon: PauseCircle, color: "text-red-600", bg: "bg-red-50", label: "Suspendido" },
};

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export default function FichaSocioPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [socio, setSocio] = useState<SocioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<SocioData>>({});
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [pagoDialogOpen, setPagoDialogOpen] = useState(false);
  const [addDisciplinaOpen, setAddDisciplinaOpen] = useState(false);

  const fetchSocio = useCallback(async () => {
    const supabase = createBrowserClient();
    const { data, error } = await supabase
      .from("perfiles")
      .select(
        `
        *,
        perfil_disciplinas (id, disciplina_id, categoria, activa, fecha_ingreso, disciplinas (id, nombre, slug)),
        pagos_socios (id, monto, moneda, periodo_mes, periodo_anio, metodo_pago, referencia_pago, notas, created_at),
        perfil_roles (id, rol_id, roles (id, nombre, descripcion))
      `
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      toast.error("Socio no encontrado");
      router.push("/secretaria/socios");
      return;
    }

    const socioData = data as unknown as SocioData;
    setSocio(socioData);
    setEditForm({
      nombre: socioData.nombre,
      apellido: socioData.apellido,
      cedula: socioData.cedula,
      telefono: socioData.telefono,
      fecha_nacimiento: socioData.fecha_nacimiento,
      notas: socioData.notas,
    });
    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    fetchSocio();
  }, [fetchSocio]);

  useEffect(() => {
    async function loadDisciplinas() {
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from("disciplinas")
        .select("id, nombre")
        .eq("activa", true)
        .order("nombre");
      setDisciplinas(data || []);
    }
    loadDisciplinas();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/socios/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Error al guardar");
        return;
      }
      toast.success("Datos actualizados");
      setEditing(false);
      fetchSocio();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const handleEstadoChange = async (nuevoEstado: string | null) => {
    if (!nuevoEstado) return;
    try {
      const res = await fetch(`/api/socios/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado_socio: nuevoEstado }),
      });
      if (!res.ok) {
        toast.error("Error al cambiar estado");
        return;
      }
      toast.success(`Estado actualizado a ${nuevoEstado}`);
      fetchSocio();
    } catch {
      toast.error("Error de conexión");
    }
  };

  const handleAddDisciplina = async (
    disciplinaId: number,
    categoria: string
  ) => {
    try {
      const res = await fetch(`/api/socios/${id}/disciplinas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disciplina_id: disciplinaId, categoria }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Error al asignar disciplina");
        return;
      }
      toast.success("Disciplina asignada");
      setAddDisciplinaOpen(false);
      fetchSocio();
    } catch {
      toast.error("Error de conexión");
    }
  };

  const handleRemoveDisciplina = async (perfilDisciplinaId: number) => {
    try {
      const res = await fetch(`/api/socios/${id}/disciplinas`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfil_disciplina_id: perfilDisciplinaId }),
      });
      if (!res.ok) {
        toast.error("Error al quitar disciplina");
        return;
      }
      toast.success("Disciplina removida");
      fetchSocio();
    } catch {
      toast.error("Error de conexión");
    }
  };

  if (loading || !socio) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const estadoConfig = ESTADO_CONFIG[socio.estado_socio];
  const EstadoIcon = estadoConfig.icon;
  const sortedPagos = [...(socio.pagos_socios || [])].sort(
    (a, b) =>
      b.periodo_anio - a.periodo_anio || b.periodo_mes - a.periodo_mes
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Link
          href="/secretaria/socios"
          className="inline-flex items-center gap-1.5 text-sm font-body text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="size-4" />
          Volver a socios
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
              {socio.nombre} {socio.apellido}
            </h1>
            <div className="flex items-center gap-3 mt-1">
              {socio.numero_socio && (
                <span className="font-body text-sm text-muted-foreground">
                  {socio.numero_socio}
                </span>
              )}
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-body font-medium ${estadoConfig.bg} ${estadoConfig.color}`}
              >
                <EstadoIcon className="size-3.5" />
                {estadoConfig.label}
              </div>
            </div>
          </div>
          <button
            onClick={() => (editing ? handleSave() : setEditing(true))}
            disabled={saving}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-body font-medium transition-colors ${
              editing
                ? "bg-bordo-800 text-white hover:bg-bordo-700"
                : "border border-linea text-foreground hover:bg-superficie"
            }`}
          >
            {editing ? (
              <>
                <Save className="size-4" />
                {saving ? "Guardando..." : "Guardar"}
              </>
            ) : (
              <>
                <Edit3 className="size-4" />
                Editar
              </>
            )}
          </button>
        </div>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* Personal Data */}
        <motion.div variants={fadeInUp} transition={springSmooth}>
          <Card className="border-linea">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-heading text-sm uppercase tracking-editorial">
                Datos Personales
              </CardTitle>
              {editing && (
                <button
                  onClick={() => setEditing(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </CardHeader>
            <CardContent>
              {editing ? (
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="font-body text-xs">Nombre</Label>
                    <Input
                      value={editForm.nombre || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, nombre: e.target.value }))
                      }
                      className="font-body"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-body text-xs">Apellido</Label>
                    <Input
                      value={editForm.apellido || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, apellido: e.target.value }))
                      }
                      className="font-body"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-body text-xs">Cédula</Label>
                    <Input
                      value={editForm.cedula || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, cedula: e.target.value }))
                      }
                      className="font-body"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-body text-xs">Teléfono</Label>
                    <Input
                      value={editForm.telefono || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, telefono: e.target.value }))
                      }
                      className="font-body"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-body text-xs">Fecha de nacimiento</Label>
                    <Input
                      type="date"
                      value={editForm.fecha_nacimiento || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          fecha_nacimiento: e.target.value,
                        }))
                      }
                      className="font-body"
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label className="font-body text-xs">Notas</Label>
                    <Textarea
                      value={editForm.notas || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, notas: e.target.value }))
                      }
                      className="font-body"
                      rows={2}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-y-3 gap-x-8">
                  <InfoRow label="Cédula" value={socio.cedula} />
                  <InfoRow label="Teléfono" value={socio.telefono} />
                  <InfoRow
                    label="Fecha de nacimiento"
                    value={
                      socio.fecha_nacimiento
                        ? new Date(socio.fecha_nacimiento).toLocaleDateString(
                            "es-UY"
                          )
                        : null
                    }
                  />
                  <InfoRow
                    label="Socio desde"
                    value={
                      socio.fecha_alta_socio
                        ? new Date(socio.fecha_alta_socio).toLocaleDateString(
                            "es-UY"
                          )
                        : null
                    }
                  />
                  {socio.notas && (
                    <div className="sm:col-span-2">
                      <InfoRow label="Notas" value={socio.notas} />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Disciplinas */}
        <motion.div variants={fadeInUp} transition={springSmooth}>
          <Card className="border-linea">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-heading text-sm uppercase tracking-editorial">
                Disciplinas
              </CardTitle>
              <AddDisciplinaDialog
                open={addDisciplinaOpen}
                onOpenChange={setAddDisciplinaOpen}
                disciplinas={disciplinas}
                existing={socio.perfil_disciplinas.map(
                  (pd) => pd.disciplina_id
                )}
                onAdd={handleAddDisciplina}
              />
            </CardHeader>
            <CardContent>
              {socio.perfil_disciplinas.length === 0 ? (
                <p className="font-body text-sm text-muted-foreground">
                  Sin disciplinas asignadas
                </p>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {socio.perfil_disciplinas.map((pd) => (
                      <motion.div
                        key={pd.id}
                        layout
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        className="flex items-center justify-between p-3 rounded-lg bg-superficie"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-body text-sm font-medium">
                            {pd.disciplinas?.nombre}
                          </span>
                          {pd.categoria && (
                            <Badge variant="outline" className="text-[10px]">
                              {pd.categoria}
                            </Badge>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveDisciplina(pd.id)}
                          className="text-muted-foreground hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Payment History */}
        <motion.div variants={fadeInUp} transition={springSmooth}>
          <Card className="border-linea">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-heading text-sm uppercase tracking-editorial">
                Historial de Cuotas
              </CardTitle>
              <PagoDialog
                open={pagoDialogOpen}
                onOpenChange={setPagoDialogOpen}
                socioId={id}
                onSuccess={fetchSocio}
              />
            </CardHeader>
            <CardContent>
              {sortedPagos.length === 0 ? (
                <p className="font-body text-sm text-muted-foreground">
                  Sin pagos registrados
                </p>
              ) : (
                <div className="rounded-lg border border-linea overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="font-heading uppercase tracking-editorial text-[10px]">
                          Período
                        </TableHead>
                        <TableHead className="font-heading uppercase tracking-editorial text-[10px]">
                          Monto
                        </TableHead>
                        <TableHead className="font-heading uppercase tracking-editorial text-[10px] hidden sm:table-cell">
                          Método
                        </TableHead>
                        <TableHead className="font-heading uppercase tracking-editorial text-[10px] hidden md:table-cell">
                          Fecha
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedPagos.map((pago) => (
                        <TableRow key={pago.id}>
                          <TableCell className="font-body text-sm">
                            {MESES[pago.periodo_mes - 1]} {pago.periodo_anio}
                          </TableCell>
                          <TableCell className="font-body text-sm font-medium">
                            ${pago.monto.toLocaleString("es-UY")}
                          </TableCell>
                          <TableCell className="font-body text-sm text-muted-foreground hidden sm:table-cell capitalize">
                            {pago.metodo_pago}
                          </TableCell>
                          <TableCell className="font-body text-xs text-muted-foreground hidden md:table-cell">
                            {new Date(pago.created_at).toLocaleDateString(
                              "es-UY"
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Actions */}
        <motion.div variants={fadeInUp} transition={springSmooth}>
          <Card className="border-linea">
            <CardHeader>
              <CardTitle className="font-heading text-sm uppercase tracking-editorial">
                Acciones
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Select
                value={socio.estado_socio}
                onValueChange={handleEstadoChange}
              >
                <SelectTrigger className="w-[180px] font-body">
                  <SelectValue placeholder="Cambiar estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="moroso">Moroso</SelectItem>
                  <SelectItem value="inactivo">Inactivo</SelectItem>
                  <SelectItem value="suspendido">Suspendido</SelectItem>
                </SelectContent>
              </Select>
              <button
                onClick={async () => {
                  if (
                    !confirm(
                      "¿Estás seguro de dar de baja a este socio? Se marcará como inactivo."
                    )
                  )
                    return;
                  const res = await fetch(`/api/socios/${id}`, {
                    method: "DELETE",
                  });
                  if (res.ok) {
                    toast.success("Socio dado de baja");
                    router.push("/secretaria/socios");
                  } else {
                    toast.error("Error al dar de baja");
                  }
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-body text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="size-4" />
                Dar de baja
              </button>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}

// --- Helper Components ---

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="font-body text-xs text-muted-foreground">{label}</dt>
      <dd className="font-body text-sm text-foreground mt-0.5">
        {value || "—"}
      </dd>
    </div>
  );
}

function PagoDialog({
  open,
  onOpenChange,
  socioId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  socioId: string;
  onSuccess: () => void;
}) {
  const [monto, setMonto] = useState("");
  const [mes, setMes] = useState(String(new Date().getMonth() + 1));
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [metodo, setMetodo] = useState("efectivo");
  const [referencia, setReferencia] = useState("");
  const [notas, setNotas] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!monto || parseFloat(monto) <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/socios/${socioId}/pagos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monto: parseFloat(monto),
          periodo_mes: parseInt(mes),
          periodo_anio: parseInt(anio),
          metodo_pago: metodo,
          referencia_pago: referencia || undefined,
          notas: notas || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Error al registrar pago");
        return;
      }

      toast.success("Pago registrado");
      onOpenChange(false);
      setMonto("");
      setReferencia("");
      setNotas("");
      onSuccess();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-bordo-800 px-3 py-1.5 text-xs font-body font-medium text-white hover:bg-bordo-700 transition-colors">
            <CreditCard className="size-3.5" />
            Registrar pago
          </button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-base uppercase tracking-editorial">
            Registrar pago de cuota
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="font-body text-sm">Monto ($)</Label>
            <Input
              type="number"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="480"
              className="font-body"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="font-body text-sm">Mes</Label>
              <Select value={mes} onValueChange={(v) => v && setMes(v)}>
                <SelectTrigger className="font-body">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESES.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-body text-sm">Año</Label>
              <Select value={anio} onValueChange={(v) => v && setAnio(v)}>
                <SelectTrigger className="font-body">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026, 2027].map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="font-body text-sm">Método de pago</Label>
            <Select value={metodo} onValueChange={(v) => v && setMetodo(v)}>
              <SelectTrigger className="font-body">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="mercadopago">MercadoPago</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="font-body text-sm">
              Referencia (opcional)
            </Label>
            <Input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Nro de transferencia..."
              className="font-body"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-body text-sm">Notas (opcional)</Label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="font-body"
              rows={2}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-bordo-800 px-4 py-2.5 text-sm font-body font-medium text-white hover:bg-bordo-700 transition-colors disabled:opacity-50"
          >
            {submitting ? "Registrando..." : "Registrar pago"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddDisciplinaDialog({
  open,
  onOpenChange,
  disciplinas,
  existing,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disciplinas: Disciplina[];
  existing: number[];
  onAdd: (disciplinaId: number, categoria: string) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [categoria, setCategoria] = useState("");

  const available = disciplinas.filter((d) => !existing.includes(d.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-linea px-3 py-1.5 text-xs font-body text-muted-foreground hover:text-foreground hover:bg-superficie transition-colors">
            <Plus className="size-3.5" />
            Agregar
          </button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading text-base uppercase tracking-editorial">
            Agregar disciplina
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {available.length === 0 ? (
            <p className="font-body text-sm text-muted-foreground">
              El socio ya está en todas las disciplinas disponibles
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="font-body text-sm">Disciplina</Label>
                <Select value={selectedId} onValueChange={(v) => v && setSelectedId(v)}>
                  <SelectTrigger className="font-body">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-body text-sm">
                  Categoría (opcional)
                </Label>
                <Input
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  placeholder="Ej: Primera, Sub-19..."
                  className="font-body"
                />
              </div>
              <button
                onClick={() => {
                  if (!selectedId) return;
                  onAdd(parseInt(selectedId), categoria);
                  setSelectedId("");
                  setCategoria("");
                }}
                disabled={!selectedId}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-bordo-800 px-4 py-2.5 text-sm font-body font-medium text-white hover:bg-bordo-700 transition-colors disabled:opacity-50"
              >
                Agregar disciplina
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
