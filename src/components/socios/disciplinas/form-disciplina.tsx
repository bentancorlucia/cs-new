"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dumbbell, ImageIcon, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Campo, DialogoAccion, claseControl } from "@/components/socios/cuotas/ui";
import { crearDisciplina, editarDisciplina, type DisciplinaInput } from "@/app/(dashboard)/secretaria/disciplinas/actions";

export interface DatosDisciplina {
  id: number;
  nombre: string;
  slug: string;
  descripcion: string | null;
  imagen_url: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_email: string | null;
  activa: boolean;
}

function slugDe(nombre: string) {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Alta o edición de una disciplina (nombre, slug, descripción, contacto, imagen y si está activa). */
export function DialogoDisciplina({
  open,
  onOpenChange,
  disciplina,
  alCrear,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  disciplina?: DatosDisciplina | null;
  alCrear?: (id: number) => void;
}) {
  const edicion = !!disciplina;
  const [nombre, setNombre] = useState(disciplina?.nombre ?? "");
  const [slug, setSlug] = useState(disciplina?.slug ?? "");
  const [slugManual, setSlugManual] = useState(edicion);
  const [descripcion, setDescripcion] = useState(disciplina?.descripcion ?? "");
  const [imagen, setImagen] = useState(disciplina?.imagen_url ?? "");
  const [contacto, setContacto] = useState(disciplina?.contacto_nombre ?? "");
  const [telefono, setTelefono] = useState(disciplina?.contacto_telefono ?? "");
  const [email, setEmail] = useState(disciplina?.contacto_email ?? "");
  const [activa, setActiva] = useState(disciplina?.activa ?? true);
  const [imagenRota, setImagenRota] = useState(false);

  const slugFinal = slugManual ? slug : slugDe(nombre);
  const datos: DisciplinaInput = {
    nombre,
    slug: slugFinal,
    descripcion,
    imagen_url: imagen,
    contacto_nombre: contacto,
    contacto_telefono: telefono,
    contacto_email: email,
    activa,
  };
  const imagenValida = imagen.trim().startsWith("/") || /^https?:\/\/\S+$/.test(imagen.trim());

  return (
    <DialogoAccion
      open={open}
      onOpenChange={onOpenChange}
      icono={edicion ? Pencil : Dumbbell}
      titulo={edicion ? `Editar ${disciplina!.nombre}` : "Nueva disciplina"}
      descripcion={edicion ? "Los cambios se ven también en el sitio público." : "Después podés cargarle planes (categorías) en Planes y cuotas."}
      textoAccion={edicion ? "Guardar cambios" : "Crear disciplina"}
      mensaje={edicion ? "Disciplina actualizada" : "Disciplina creada"}
      ancho="sm:max-w-lg"
      deshabilitado={nombre.trim().length === 0}
      ejecutar={async () => {
        if (edicion) {
          const r = await editarDisciplina(disciplina!.id, datos);
          return r.ok ? { ok: true } : r;
        }
        const r = await crearDisciplina(datos);
        if (r.ok) {
          alCrear?.(r.data);
          return { ok: true };
        }
        return r;
      }}
    >
      <Campo etiqueta="Nombre">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Hockey Femenino" className={claseControl} maxLength={100} autoFocus />
      </Campo>
      <Campo etiqueta="Slug" ayuda={slugManual ? "Dirección en el sitio: /deportes/…" : "Se arma solo con el nombre; tocalo para cambiarlo."}>
        <input
          value={slugFinal}
          onChange={(e) => {
            setSlugManual(true);
            setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
          }}
          className={cn(claseControl, "font-mono text-xs")}
          maxLength={100}
        />
      </Campo>
      <Campo etiqueta="Descripción">
        <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} className={cn(claseControl, "h-auto py-2")} maxLength={2000} />
      </Campo>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_4.5rem] sm:items-end">
        <Campo etiqueta="Imagen (URL)" ayuda="https://… o una ruta del sitio (/images/…).">
          <input
            value={imagen}
            onChange={(e) => {
              setImagen(e.target.value);
              setImagenRota(false);
            }}
            placeholder="https://…"
            className={claseControl}
            maxLength={1000}
          />
        </Campo>
        <div className="hidden h-[4.5rem] items-center justify-center overflow-hidden rounded-xl border border-linea bg-superficie sm:mb-5 sm:flex">
          <AnimatePresence mode="wait">
            {imagenValida && !imagenRota ? (
              <motion.img
                key={imagen}
                src={imagen.trim()}
                alt=""
                initial={{ opacity: 0, scale: 1.05 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                onError={() => setImagenRota(true)}
                className="size-full object-cover"
              />
            ) : (
              <motion.span key="vacio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ImageIcon className="size-5 text-muted-foreground/50" />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
      <Campo etiqueta="Coordinador o contacto">
        <input value={contacto} onChange={(e) => setContacto(e.target.value)} className={claseControl} maxLength={100} />
      </Campo>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Teléfono">
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" placeholder="099 123 456" className={claseControl} maxLength={20} />
        </Campo>
        <Campo etiqueta="Email">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="disciplina@…" className={claseControl} maxLength={200} />
        </Campo>
      </div>
      <motion.button
        type="button"
        whileTap={{ scale: 0.98 }}
        onClick={() => setActiva((a) => !a)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-linea bg-white px-3 py-2.5 text-left transition-colors hover:bg-superficie"
        role="switch"
        aria-checked={activa}
      >
        <span>
          <span className="block text-sm font-medium">{activa ? "Activa" : "Inactiva"}</span>
          <span className="block text-[11px] text-muted-foreground">
            {activa ? "Aparece en el sitio, en los pedidos y en las altas." : "No aparece en el sitio ni para pedidos nuevos; la historia se conserva."}
          </span>
        </span>
        <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", activa ? "bg-bordo-800" : "bg-slate-300")}>
          <motion.span
            layout
            transition={{ type: "spring", stiffness: 500, damping: 32 }}
            className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow", activa ? "right-0.5" : "left-0.5")}
          />
        </span>
      </motion.button>
    </DialogoAccion>
  );
}
