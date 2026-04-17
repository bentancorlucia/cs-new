"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Edit3,
  Save,
  Phone,
  Mail,
  ToggleLeft,
  ToggleRight,
  Search,
  Trash2,
  UserCog,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { staggerContainer, fadeInUp, springSmooth } from "@/lib/motion";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { ImportarStaffDialog } from "./_components/importar-excel-dialog";

interface DisciplinaMini {
  id: number;
  nombre: string;
  slug: string;
  activa: boolean;
}

interface StaffRow {
  id: number;
  nombre: string;
  apellido: string;
  cedula: string | null;
  cargo: string;
  disciplina_id: number | null;
  telefono: string | null;
  email: string | null;
  descripcion: string | null;
  activo: boolean;
  fecha_ingreso: string | null;
  notas: string | null;
  created_at: string;
  disciplinas: DisciplinaMini | null;
  padron_socio_id: number | null;
  socio_activo: boolean | null;
}

const SIN_DISCIPLINA_KEY = "__sin_disciplina__";

function initials(nombre: string, apellido: string) {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

export default function StaffPage() {
  useDocumentTitle("Staff");
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [disciplinas, setDisciplinas] = useState<DisciplinaMini[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editRow, setEditRow] = useState<StaffRow | null>(null);
  const [search, setSearch] = useState("");
  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  const fetchStaff = async () => {
    try {
      const res = await fetch("/api/staff");
      if (!res.ok) {
        setStaff([]);
        return;
      }
      const json = await res.json();
      setStaff(json.staff || []);
    } catch {
      setStaff([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchDisciplinas = async () => {
    try {
      const res = await fetch("/api/disciplinas");
      if (!res.ok) return;
      const json = await res.json();
      setDisciplinas(
        (json.disciplinas || [])
          .filter((d: DisciplinaMini) => d.activa)
          .sort((a: DisciplinaMini, b: DisciplinaMini) =>
            a.nombre.localeCompare(b.nombre)
          )
      );
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchStaff();
    fetchDisciplinas();
  }, []);

  const toggleActivo = async (row: StaffRow) => {
    try {
      const res = await fetch("/api/staff", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, activo: !row.activo }),
      });
      if (!res.ok) {
        toast.error("Error al actualizar");
        return;
      }
      toast.success(row.activo ? "Staff desactivado" : "Staff activado");
      fetchStaff();
    } catch {
      toast.error("Error de conexión");
    }
  };

  const eliminar = async (row: StaffRow) => {
    if (
      !confirm(
        `¿Eliminar definitivamente a ${row.nombre} ${row.apellido}? Esta acción no se puede deshacer.`
      )
    )
      return;
    try {
      const res = await fetch(`/api/staff/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Error al eliminar");
        return;
      }
      toast.success("Staff eliminado");
      fetchStaff();
    } catch {
      toast.error("Error de conexión");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((s) => {
      if (!mostrarInactivos && !s.activo) return false;
      if (!q) return true;
      return (
        s.nombre.toLowerCase().includes(q) ||
        s.apellido.toLowerCase().includes(q) ||
        s.cargo.toLowerCase().includes(q) ||
        (s.cedula?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [staff, search, mostrarInactivos]);

  // Group by disciplina
  const grouped = useMemo(() => {
    const groups = new Map<string, { label: string; rows: StaffRow[] }>();
    for (const row of filtered) {
      const key = row.disciplina_id
        ? String(row.disciplina_id)
        : SIN_DISCIPLINA_KEY;
      const label = row.disciplinas?.nombre || "Sin disciplina asignada";
      if (!groups.has(key)) groups.set(key, { label, rows: [] });
      groups.get(key)!.rows.push(row);
    }
    // Ordenar: disciplinas alfabéticamente, "sin disciplina" al final
    const entries = Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === SIN_DISCIPLINA_KEY) return 1;
      if (b[0] === SIN_DISCIPLINA_KEY) return -1;
      return a[1].label.localeCompare(b[1].label);
    });
    return entries;
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
            Staff
          </h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            {staff.length > 0 && `${staff.length} miembros · `}
            Entrenadores, administrativos y personal del club
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-linea bg-white px-4 py-2.5 text-sm font-body font-medium text-foreground hover:bg-superficie transition-colors"
          >
            <Upload className="size-4" />
            Importar Excel
          </button>
          <StaffFormDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            disciplinas={disciplinas}
            onSuccess={fetchStaff}
          />
        </div>
      </motion.div>

      <ImportarStaffDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={fetchStaff}
        disciplinasDisponibles={disciplinas.map((d) => ({
          id: d.id,
          nombre: d.nombre,
        }))}
      />

      {/* Filtros */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, cargo o cédula..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 font-body"
          />
        </div>
        <button
          onClick={() => setMostrarInactivos((v) => !v)}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-body transition-colors ${
            mostrarInactivos
              ? "border-bordo-800 bg-bordo-50 text-bordo-800"
              : "border-linea text-muted-foreground hover:text-foreground hover:bg-superficie"
          }`}
        >
          {mostrarInactivos ? (
            <ToggleRight className="size-4" />
          ) : (
            <ToggleLeft className="size-4" />
          )}
          Inactivos
        </button>
      </motion.div>

      {/* Secciones agrupadas */}
      {loading ? (
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <div className="space-y-1">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-14 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl border border-linea bg-white py-16 text-center"
        >
          <UserCog className="mx-auto mb-3 size-12 opacity-15 text-muted-foreground" />
          <p className="font-body text-sm text-muted-foreground">
            {search || (!mostrarInactivos && staff.some((s) => !s.activo))
              ? "No se encontraron miembros con esos filtros"
              : "No hay staff registrado"}
          </p>
        </motion.div>
      ) : (
        <div className="space-y-8">
          <AnimatePresence mode="popLayout">
            {grouped.map(([key, group]) => (
              <motion.section
                key={key}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="space-y-2"
              >
                <div className="flex items-baseline justify-between gap-3 border-b border-linea pb-2">
                  <h2 className="font-heading uppercase tracking-editorial text-sm text-foreground">
                    {group.label}
                  </h2>
                  <span className="font-body text-xs text-muted-foreground">
                    {group.rows.length} persona
                    {group.rows.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <motion.div
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                  className="rounded-xl border border-linea bg-white overflow-hidden divide-y divide-linea"
                >
                  <AnimatePresence mode="popLayout">
                    {group.rows.map((row) => (
                      <motion.div
                        key={row.id}
                        variants={fadeInUp}
                        layout
                        transition={springSmooth}
                        className={`group flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-superficie/40 transition-colors ${
                          !row.activo ? "opacity-60" : ""
                        }`}
                      >
                        <div className="shrink-0 size-9 rounded-full bg-bordo-50 text-bordo-800 flex items-center justify-center font-heading text-xs font-semibold">
                          {initials(row.nombre, row.apellido)}
                        </div>

                        <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 items-center">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <h3 className="font-body text-sm font-medium text-foreground truncate">
                                {row.nombre} {row.apellido}
                              </h3>
                              {row.padron_socio_id && (
                                <Badge
                                  variant="secondary"
                                  className="text-[9px] bg-amber-100 text-amber-900 border-amber-200 px-1.5 py-0 h-4"
                                >
                                  Socio
                                </Badge>
                              )}
                              {!row.activo && (
                                <Badge
                                  variant="secondary"
                                  className="text-[9px] px-1.5 py-0 h-4"
                                >
                                  Inactivo
                                </Badge>
                              )}
                            </div>
                            <p className="font-body text-xs text-muted-foreground truncate">
                              {row.cargo}
                            </p>
                          </div>

                          <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground font-body shrink-0">
                            {row.telefono && (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="size-3" />
                                {row.telefono}
                              </span>
                            )}
                            {row.email && (
                              <span className="inline-flex items-center gap-1 max-w-[200px] truncate">
                                <Mail className="size-3 shrink-0" />
                                <span className="truncate">{row.email}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setEditRow(row)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-superficie transition-colors"
                            title="Editar"
                          >
                            <Edit3 className="size-3.5" />
                          </button>
                          <button
                            onClick={() => toggleActivo(row)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-superficie transition-colors"
                            title={row.activo ? "Desactivar" : "Activar"}
                          >
                            {row.activo ? (
                              <ToggleRight className="size-3.5" />
                            ) : (
                              <ToggleLeft className="size-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => eliminar(row)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              </motion.section>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Edit dialog */}
      {editRow && (
        <StaffFormDialog
          open={true}
          onOpenChange={(open) => !open && setEditRow(null)}
          staff={editRow}
          disciplinas={disciplinas}
          onSuccess={() => {
            setEditRow(null);
            fetchStaff();
          }}
        />
      )}
    </div>
  );
}

// --- Form Dialog ---

function StaffFormDialog({
  open,
  onOpenChange,
  staff,
  disciplinas,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff?: StaffRow;
  disciplinas: DisciplinaMini[];
  onSuccess: () => void;
}) {
  const isEdit = !!staff;
  const [nombre, setNombre] = useState(staff?.nombre || "");
  const [apellido, setApellido] = useState(staff?.apellido || "");
  const [cedula, setCedula] = useState(staff?.cedula || "");
  const [cargo, setCargo] = useState(staff?.cargo || "");
  const [disciplinaId, setDisciplinaId] = useState<string>(
    staff?.disciplina_id ? String(staff.disciplina_id) : SIN_DISCIPLINA_KEY
  );
  const [telefono, setTelefono] = useState(staff?.telefono || "");
  const [email, setEmail] = useState(staff?.email || "");
  const [fechaIngreso, setFechaIngreso] = useState(
    staff?.fecha_ingreso || ""
  );
  const [descripcion, setDescripcion] = useState(staff?.descripcion || "");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!nombre.trim() || !apellido.trim()) {
      toast.error("Nombre y apellido son requeridos");
      return;
    }
    if (!cedula.trim()) {
      toast.error("La cédula es requerida");
      return;
    }
    if (!cargo.trim()) {
      toast.error("El cargo es requerido");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...(isEdit ? { id: staff.id } : {}),
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        cedula: cedula.trim(),
        cargo: cargo.trim(),
        disciplina_id:
          disciplinaId === SIN_DISCIPLINA_KEY ? null : parseInt(disciplinaId),
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        fecha_ingreso: fechaIngreso || null,
        descripcion: descripcion.trim() || null,
      };

      const res = await fetch("/api/staff", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Error al guardar");
        return;
      }

      toast.success(isEdit ? "Staff actualizado" : "Staff creado");
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  };

  const content = (
    <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="font-heading text-base uppercase tracking-editorial">
          {isEdit ? "Editar staff" : "Nuevo staff"}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4 pt-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="font-body text-sm">Nombre *</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="font-body"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-body text-sm">Apellido *</Label>
            <Input
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              className="font-body"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="font-body text-sm">Cédula *</Label>
            <Input
              value={cedula}
              onChange={(e) => setCedula(e.target.value)}
              placeholder="1.234.567-8"
              className="font-body"
            />
            <p className="text-[10px] font-body text-muted-foreground">
              Si coincide con un socio, se mostrará vinculado
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="font-body text-sm">Fecha ingreso</Label>
            <Input
              type="date"
              value={fechaIngreso}
              onChange={(e) => setFechaIngreso(e.target.value)}
              className="font-body"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="font-body text-sm">Cargo *</Label>
          <Input
            value={cargo}
            onChange={(e) => setCargo(e.target.value)}
            placeholder="Ej: Entrenador primera, Conserje, Secretaria administrativa"
            className="font-body"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="font-body text-sm">Disciplina</Label>
          <Select
            value={disciplinaId}
            onValueChange={(v) => v && setDisciplinaId(v)}
          >
            <SelectTrigger className="font-body w-full">
              <SelectValue placeholder="Seleccionar...">
                {(value) => {
                  if (value === SIN_DISCIPLINA_KEY) return "Sin disciplina";
                  const d = disciplinas.find(
                    (d) => String(d.id) === value
                  );
                  return d?.nombre ?? "Seleccionar...";
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_DISCIPLINA_KEY}>
                Sin disciplina
              </SelectItem>
              {disciplinas.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {d.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="font-body text-sm">Teléfono</Label>
            <Input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="099 123 456"
              className="font-body"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-body text-sm">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@ejemplo.com"
              className="font-body"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="font-body text-sm">Descripción</Label>
          <Textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="font-body"
            rows={2}
            placeholder="Notas breves visibles en la card"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-bordo-800 px-4 py-2.5 text-sm font-body font-medium text-white hover:bg-bordo-700 transition-colors disabled:opacity-50"
        >
          {submitting ? (
            "Guardando..."
          ) : isEdit ? (
            <>
              <Save className="size-4" />
              Guardar cambios
            </>
          ) : (
            <>
              <Plus className="size-4" />
              Crear staff
            </>
          )}
        </button>
      </div>
    </DialogContent>
  );

  if (isEdit) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        {content}
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-bordo-800 px-4 py-2.5 text-sm font-body font-medium text-white hover:bg-bordo-700 transition-colors w-full sm:w-auto">
            <Plus className="size-4" />
            Nuevo staff
          </button>
        }
      />
      {content}
    </Dialog>
  );
}
