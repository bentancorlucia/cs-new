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
  Link2,
  CheckCircle,
  XCircle,
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
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase/client";
import { fadeInUp, staggerContainer, springSmooth } from "@/lib/motion";

interface PadronDisciplina {
  id: number;
  disciplina_id: number;
  categoria: string | null;
  activa: boolean;
  fecha_ingreso: string;
  disciplinas: { id: number; nombre: string; slug: string } | null;
}

interface PadronSocioData {
  id: number;
  nombre: string;
  apellido: string;
  cedula: string;
  telefono: string | null;
  fecha_nacimiento: string | null;
  activo: boolean;
  notas: string | null;
  perfil_id: string | null;
  vinculado_at: string | null;
  created_at: string;
  padron_disciplinas: PadronDisciplina[];
  perfiles: {
    id: string;
    nombre: string;
    apellido: string;
    avatar_url: string | null;
    cedula: string | null;
    telefono: string | null;
  } | null;
}

interface Disciplina {
  id: number;
  nombre: string;
}

export default function FichaSocioPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [socio, setSocio] = useState<PadronSocioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<PadronSocioData>>({});
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [addDisciplinaOpen, setAddDisciplinaOpen] = useState(false);

  const fetchSocio = useCallback(async () => {
    try {
      const res = await fetch(`/api/padron/${id}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 403) {
          toast.error("No tenés permisos para ver este socio");
        } else {
          toast.error(errorData.error || "Socio no encontrado");
        }
        router.push("/secretaria/socios");
        return;
      }
      const { socio: data } = await res.json();
      setSocio(data as PadronSocioData);
      setEditForm({
        nombre: data.nombre,
        apellido: data.apellido,
        cedula: data.cedula,
        telefono: data.telefono,
        fecha_nacimiento: data.fecha_nacimiento,
        notas: data.notas,
      });
    } catch {
      toast.error("Error al cargar socio");
      router.push("/secretaria/socios");
    } finally {
      setLoading(false);
    }
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
      const res = await fetch(`/api/padron/${id}`, {
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

  const handleToggleActivo = async () => {
    if (!socio) return;
    const nuevoEstado = !socio.activo;
    try {
      const res = await fetch(`/api/padron/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: nuevoEstado }),
      });
      if (!res.ok) {
        toast.error("Error al cambiar estado");
        return;
      }
      toast.success(`Socio ${nuevoEstado ? "activado" : "desactivado"}`);
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
      const res = await fetch(`/api/padron/${id}/disciplinas`, {
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

  const handleRemoveDisciplina = async (disciplinaId: number) => {
    try {
      const res = await fetch(
        `/api/padron/${id}/disciplinas?disciplina_id=${disciplinaId}`,
        { method: "DELETE" }
      );
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
              <Badge variant={socio.activo ? "default" : "secondary"}>
                {socio.activo ? "Activo" : "Inactivo"}
              </Badge>
              {socio.perfil_id ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-body">
                  <Link2 className="size-3.5" />
                  Vinculado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-body">
                  Sin vincular
                </span>
              )}
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
                        ? new Date(socio.fecha_nacimiento).toLocaleDateString("es-UY")
                        : null
                    }
                  />
                  <InfoRow
                    label="Socio desde"
                    value={
                      socio.created_at
                        ? new Date(socio.created_at).toLocaleDateString("es-UY")
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

        {/* Linked user info */}
        {socio.perfiles && (
          <motion.div variants={fadeInUp} transition={springSmooth}>
            <Card className="border-linea border-emerald-200 bg-emerald-50/30">
              <CardHeader>
                <CardTitle className="font-heading text-sm uppercase tracking-editorial text-emerald-800">
                  Usuario vinculado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-y-3 gap-x-8">
                  <InfoRow
                    label="Nombre (cuenta)"
                    value={`${socio.perfiles.nombre} ${socio.perfiles.apellido}`}
                  />
                  <InfoRow label="Cédula (cuenta)" value={socio.perfiles.cedula} />
                  <InfoRow label="Teléfono (cuenta)" value={socio.perfiles.telefono} />
                  <InfoRow
                    label="Vinculado el"
                    value={
                      socio.vinculado_at
                        ? new Date(socio.vinculado_at).toLocaleDateString("es-UY")
                        : null
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

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
                existing={socio.padron_disciplinas.map((pd) => pd.disciplina_id)}
                onAdd={handleAddDisciplina}
              />
            </CardHeader>
            <CardContent>
              {socio.padron_disciplinas.length === 0 ? (
                <p className="font-body text-sm text-muted-foreground">
                  Sin disciplinas asignadas
                </p>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {socio.padron_disciplinas.map((pd) => (
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
                          onClick={() => handleRemoveDisciplina(pd.disciplina_id)}
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

        {/* Actions */}
        <motion.div variants={fadeInUp} transition={springSmooth}>
          <Card className="border-linea">
            <CardHeader>
              <CardTitle className="font-heading text-sm uppercase tracking-editorial">
                Acciones
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <button
                onClick={handleToggleActivo}
                className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-body transition-colors ${
                  socio.activo
                    ? "border-red-200 text-red-600 hover:bg-red-50"
                    : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                }`}
              >
                {socio.activo ? (
                  <>
                    <XCircle className="size-4" />
                    Desactivar socio
                  </>
                ) : (
                  <>
                    <CheckCircle className="size-4" />
                    Reactivar socio
                  </>
                )}
              </button>
              <button
                onClick={async () => {
                  if (
                    !confirm(
                      "¿Estás seguro de dar de baja a este socio? Se marcará como inactivo."
                    )
                  )
                    return;
                  const res = await fetch(`/api/padron/${id}`, {
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
                    {selectedId
                      ? available.find((d) => String(d.id) === selectedId)?.nombre
                      : <SelectValue placeholder="Seleccionar..." />}
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
