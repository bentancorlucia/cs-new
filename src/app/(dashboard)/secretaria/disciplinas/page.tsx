"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Edit3,
  Save,
  Users,
  Phone,
  Mail,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase/client";
import { staggerContainer, fadeInUp, springSmooth } from "@/lib/motion";

interface DisciplinaData {
  id: number;
  nombre: string;
  slug: string;
  descripcion: string | null;
  imagen_url: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_email: string | null;
  activa: boolean;
  created_at: string;
  socios_count: number;
}

export default function DisciplinasPage() {
  const [disciplinas, setDisciplinas] = useState<DisciplinaData[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const fetchDisciplinas = async () => {
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from("disciplinas")
      .select("*, perfil_disciplinas(id)")
      .order("nombre");

    if (!data) {
      setDisciplinas([]);
      setLoading(false);
      return;
    }

    const result = (data as unknown as (DisciplinaData & { perfil_disciplinas: unknown[] })[]).map(
      (d) => ({
        ...d,
        socios_count: d.perfil_disciplinas?.length || 0,
        perfil_disciplinas: undefined,
      })
    );

    setDisciplinas(result);
    setLoading(false);
  };

  useEffect(() => {
    fetchDisciplinas();
  }, []);

  const toggleActiva = async (disc: DisciplinaData) => {
    try {
      const res = await fetch("/api/disciplinas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: disc.id, activa: !disc.activa }),
      });
      if (!res.ok) {
        toast.error("Error al actualizar");
        return;
      }
      toast.success(
        disc.activa ? "Disciplina desactivada" : "Disciplina activada"
      );
      fetchDisciplinas();
    } catch {
      toast.error("Error de conexión");
    }
  };

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
            Disciplinas
          </h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            {disciplinas.length > 0 && `${disciplinas.length} disciplinas · `}Gestión de deportes y actividades del club
          </p>
        </div>
        <DisciplinaFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSuccess={fetchDisciplinas}
        />
      </motion.div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : disciplinas.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl border border-linea bg-white py-16 text-center"
        >
          <Users className="mx-auto mb-3 size-12 opacity-15 text-muted-foreground" />
          <p className="font-body text-sm text-muted-foreground">No hay disciplinas creadas</p>
        </motion.div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          <AnimatePresence mode="popLayout">
            {disciplinas.map((disc) => (
              <motion.div
                key={disc.id}
                variants={fadeInUp}
                layout
                transition={springSmooth}
              >
                <Card
                  className={`border-linea overflow-hidden transition-all hover:shadow-card h-full ${
                    !disc.activa ? "opacity-60" : ""
                  }`}
                >
                  <CardContent className="p-4 sm:p-5 space-y-3 flex flex-col h-full">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-heading text-sm sm:text-base font-semibold text-foreground truncate">
                          {disc.nombre}
                        </h3>
                        {disc.descripcion && (
                          <p className="font-body text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {disc.descripcion}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={disc.activa ? "default" : "secondary"}
                        className="text-[10px] shrink-0"
                      >
                        {disc.activa ? "Activa" : "Inactiva"}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="size-3.5 shrink-0" />
                      <span className="font-body text-xs">
                        {disc.socios_count} socios
                      </span>
                    </div>

                    {(disc.contacto_nombre ||
                      disc.contacto_telefono ||
                      disc.contacto_email) && (
                      <div className="pt-3 border-t border-linea space-y-1.5">
                        {disc.contacto_nombre && (
                          <p className="font-body text-xs text-foreground truncate">
                            {disc.contacto_nombre}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {disc.contacto_telefono && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-body">
                              <Phone className="size-3 shrink-0" />
                              <span className="truncate">{disc.contacto_telefono}</span>
                            </span>
                          )}
                          {disc.contacto_email && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-body">
                              <Mail className="size-3 shrink-0" />
                              <span className="truncate">{disc.contacto_email}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2 mt-auto">
                      <button
                        onClick={() => setEditId(disc.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-linea px-3 py-1.5 text-xs font-body text-muted-foreground hover:text-foreground hover:bg-superficie transition-colors"
                      >
                        <Edit3 className="size-3" />
                        Editar
                      </button>
                      <button
                        onClick={() => toggleActiva(disc)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-linea px-3 py-1.5 text-xs font-body text-muted-foreground hover:text-foreground hover:bg-superficie transition-colors"
                      >
                        {disc.activa ? (
                          <ToggleRight className="size-3" />
                        ) : (
                          <ToggleLeft className="size-3" />
                        )}
                        {disc.activa ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </CardContent>
                </Card>

                {editId === disc.id && (
                  <DisciplinaFormDialog
                    open={true}
                    onOpenChange={(open) => !open && setEditId(null)}
                    disciplina={disc}
                    onSuccess={() => {
                      setEditId(null);
                      fetchDisciplinas();
                    }}
                  />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}

// --- Form Dialog ---

function DisciplinaFormDialog({
  open,
  onOpenChange,
  disciplina,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disciplina?: DisciplinaData;
  onSuccess: () => void;
}) {
  const isEdit = !!disciplina;
  const [nombre, setNombre] = useState(disciplina?.nombre || "");
  const [descripcion, setDescripcion] = useState(
    disciplina?.descripcion || ""
  );
  const [contactoNombre, setContactoNombre] = useState(
    disciplina?.contacto_nombre || ""
  );
  const [contactoTelefono, setContactoTelefono] = useState(
    disciplina?.contacto_telefono || ""
  );
  const [contactoEmail, setContactoEmail] = useState(
    disciplina?.contacto_email || ""
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!nombre.trim()) {
      toast.error("El nombre es requerido");
      return;
    }

    setSubmitting(true);
    const slug = nombre
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    try {
      const res = await fetch("/api/disciplinas", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isEdit ? { id: disciplina.id } : {}),
          nombre: nombre.trim(),
          slug,
          descripcion: descripcion.trim() || undefined,
          contacto_nombre: contactoNombre.trim() || undefined,
          contacto_telefono: contactoTelefono.trim() || undefined,
          contacto_email: contactoEmail.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Error al guardar");
        return;
      }

      toast.success(
        isEdit ? "Disciplina actualizada" : "Disciplina creada"
      );
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  };

  const content = (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="font-heading text-base uppercase tracking-editorial">
          {isEdit ? "Editar disciplina" : "Nueva disciplina"}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4 pt-2">
        <div className="space-y-1.5">
          <Label className="font-body text-sm">Nombre *</Label>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Básquetbol"
            className="font-body"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="font-body text-sm">Descripción</Label>
          <Textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="font-body"
            rows={2}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="font-body text-sm">Coordinador</Label>
          <Input
            value={contactoNombre}
            onChange={(e) => setContactoNombre(e.target.value)}
            placeholder="Nombre del coordinador"
            className="font-body"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="font-body text-sm">Teléfono</Label>
            <Input
              value={contactoTelefono}
              onChange={(e) => setContactoTelefono(e.target.value)}
              placeholder="099 123 456"
              className="font-body"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-body text-sm">Email</Label>
            <Input
              value={contactoEmail}
              onChange={(e) => setContactoEmail(e.target.value)}
              placeholder="email@club.com"
              className="font-body"
            />
          </div>
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
              Crear disciplina
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
            Nueva disciplina
          </button>
        }
      />
      {content}
    </Dialog>
  );
}
