"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, UserPlus } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createBrowserClient } from "@/lib/supabase/client";
import { fadeInUp, staggerContainer, springSmooth } from "@/lib/motion";
import { useDocumentTitle } from "@/hooks/use-document-title";

const socioSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido").max(100),
  apellido: z.string().min(1, "Apellido requerido").max(100),
  cedula: z.string().min(1, "Cédula requerida").max(20),
  telefono: z.string().max(20).optional().or(z.literal("")),
  fecha_nacimiento: z.string().optional().or(z.literal("")),
  notas: z.string().optional().or(z.literal("")),
});

type SocioFormData = z.infer<typeof socioSchema>;

interface Disciplina {
  id: number;
  nombre: string;
  slug: string;
  activa: boolean;
}

interface SelectedDisciplina {
  disciplina_id: number;
  nombre: string;
  categoria: string;
}

export default function NuevoSocioPage() {
  useDocumentTitle("Nuevo Socio");
  const router = useRouter();
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [selectedDisciplinas, setSelectedDisciplinas] = useState<
    SelectedDisciplina[]
  >([]);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SocioFormData>({
    resolver: zodResolver(socioSchema),
  });

  useEffect(() => {
    async function load() {
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from("disciplinas")
        .select("id, nombre, slug, activa")
        .eq("activa", true)
        .order("nombre");
      setDisciplinas(data || []);
    }
    load();
  }, []);

  const toggleDisciplina = (disc: Disciplina) => {
    setSelectedDisciplinas((prev) => {
      const exists = prev.find((d) => d.disciplina_id === disc.id);
      if (exists) {
        return prev.filter((d) => d.disciplina_id !== disc.id);
      }
      return [...prev, { disciplina_id: disc.id, nombre: disc.nombre, categoria: "" }];
    });
  };

  const updateCategoria = (disciplinaId: number, categoria: string) => {
    setSelectedDisciplinas((prev) =>
      prev.map((d) =>
        d.disciplina_id === disciplinaId ? { ...d, categoria } : d
      )
    );
  };

  const onSubmit = async (data: SocioFormData) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/padron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          telefono: data.telefono || undefined,
          fecha_nacimiento: data.fecha_nacimiento || undefined,
          notas: data.notas || undefined,
          disciplinas: selectedDisciplinas.map((d) => ({
            disciplina_id: d.disciplina_id,
            categoria: d.categoria || undefined,
          })),
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        toast.error(result.error || "Error al crear socio");
        return;
      }

      toast.success("Socio creado correctamente");
      router.push(`/secretaria/socios/${result.socio.id}`);
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
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
        <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
          Nuevo Socio
        </h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          Alta de un nuevo socio en el padrón del club
        </p>
      </motion.div>

      <motion.form
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-6"
      >
        {/* Personal data */}
        <motion.div variants={fadeInUp} transition={springSmooth}>
          <Card className="border-linea">
            <CardHeader>
              <CardTitle className="font-heading text-sm uppercase tracking-editorial">
                Datos Personales
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="nombre" className="font-body text-sm">
                    Nombre *
                  </Label>
                  <Input
                    id="nombre"
                    {...register("nombre")}
                    className="font-body"
                  />
                  {errors.nombre && (
                    <p className="text-xs text-red-500 font-body">
                      {errors.nombre.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="apellido" className="font-body text-sm">
                    Apellido *
                  </Label>
                  <Input
                    id="apellido"
                    {...register("apellido")}
                    className="font-body"
                  />
                  {errors.apellido && (
                    <p className="text-xs text-red-500 font-body">
                      {errors.apellido.message}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cedula" className="font-body text-sm">
                    Cédula *
                  </Label>
                  <Input
                    id="cedula"
                    {...register("cedula")}
                    placeholder="1.234.567-8"
                    className="font-body"
                  />
                  {errors.cedula && (
                    <p className="text-xs text-red-500 font-body">
                      {errors.cedula.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="telefono" className="font-body text-sm">
                    Teléfono
                  </Label>
                  <Input
                    id="telefono"
                    {...register("telefono")}
                    placeholder="099 123 456"
                    className="font-body"
                  />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fecha_nacimiento" className="font-body text-sm">
                    Fecha de nacimiento
                  </Label>
                  <Input
                    id="fecha_nacimiento"
                    type="date"
                    {...register("fecha_nacimiento")}
                    className="font-body"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notas" className="font-body text-sm">
                  Notas
                </Label>
                <Textarea
                  id="notas"
                  {...register("notas")}
                  placeholder="Observaciones sobre el socio..."
                  className="font-body"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Disciplinas */}
        <motion.div variants={fadeInUp} transition={springSmooth}>
          <Card className="border-linea">
            <CardHeader>
              <CardTitle className="font-heading text-sm uppercase tracking-editorial">
                Disciplinas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {disciplinas.map((disc) => {
                  const isSelected = selectedDisciplinas.some(
                    (d) => d.disciplina_id === disc.id
                  );
                  return (
                    <button
                      key={disc.id}
                      type="button"
                      onClick={() => toggleDisciplina(disc)}
                      className={`flex items-center gap-2 p-3 rounded-lg border text-left text-sm font-body transition-all ${
                        isSelected
                          ? "border-bordo-800 bg-bordo-50 text-bordo-800"
                          : "border-linea hover:bg-superficie text-foreground"
                      }`}
                    >
                      <Checkbox checked={isSelected} className="pointer-events-none" />
                      {disc.nombre}
                    </button>
                  );
                })}
              </div>

              {selectedDisciplinas.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-linea">
                  <p className="font-body text-xs text-muted-foreground">
                    Categoría por disciplina (opcional):
                  </p>
                  {selectedDisciplinas.map((d) => (
                    <div
                      key={d.disciplina_id}
                      className="flex items-center gap-3"
                    >
                      <Badge variant="secondary" className="font-body shrink-0">
                        {d.nombre}
                      </Badge>
                      <Input
                        placeholder="Ej: Primera, Sub-19, Mami..."
                        value={d.categoria}
                        onChange={(e) =>
                          updateCategoria(d.disciplina_id, e.target.value)
                        }
                        className="font-body text-sm h-8"
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Submit */}
        <motion.div variants={fadeInUp} transition={springSmooth}>
          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-bordo-800 px-6 py-3 text-sm font-body font-medium text-white hover:bg-bordo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UserPlus className="size-4" />
            {submitting ? "Creando socio..." : "Crear socio"}
          </button>
        </motion.div>
      </motion.form>
    </div>
  );
}
