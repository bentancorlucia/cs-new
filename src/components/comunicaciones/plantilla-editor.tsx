"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Eye, FileText, Lock, Megaphone, PenLine, Save, Send, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { easeSmooth } from "@/lib/motion";
import { CATEGORIAS, REGEX_CLAVE, VARIABLES, type Categoria } from "@/lib/comunicaciones/esquemas";
import { eliminarPlantilla, guardarPlantilla } from "@/app/(dashboard)/comunicaciones/actions";
import { Switch } from "@/components/ui/switch";
import { Aviso, Boton, BotonLink, Campo, DialogoAccion, EncabezadoPagina, Panel, claseControl } from "./ui";
import { EditorCuerpo } from "./editor-cuerpo";
import { VistaPreviaDestinatarios } from "./vista-previa";
import type { PlantillaFila } from "./tipos";

/** De "Aviso de torneo" → "aviso_de_torneo". */
function claveDesde(nombre: string) {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

const EJEMPLOS = [
  { email: "maria.perez@ejemplo.com", nombre: "María Pérez", variables: Object.fromEntries(VARIABLES.map((v) => [v.clave, v.ejemplo])) },
  {
    email: "juan.rodriguez@ejemplo.com",
    nombre: "Juan Rodríguez",
    variables: {
      nombre: "Juan",
      apellido: "Rodríguez",
      numero_socio: "587",
      disciplinas: "Rugby",
      cuotas_vencidas: "0",
      deuda_vencida: "$ 0,00",
    },
  },
];

export function PlantillaEditor({
  plantilla,
  pie,
  puedeGestionar,
  usos,
}: {
  plantilla: PlantillaFila | null;
  pie: string | null;
  puedeGestionar: boolean;
  usos: string[];
}) {
  const router = useRouter();
  const nueva = !plantilla;
  const [nombre, setNombre] = useState(plantilla?.nombre ?? "");
  const [clave, setClave] = useState(plantilla?.clave ?? "");
  const [claveTocada, setClaveTocada] = useState(!nueva);
  const [categoria, setCategoria] = useState<Categoria>((plantilla?.categoria as Categoria) ?? "difusion");
  const [asunto, setAsunto] = useState(plantilla?.asunto ?? "");
  const [cuerpo, setCuerpo] = useState(plantilla?.cuerpo ?? "");
  const [activa, setActiva] = useState(plantilla?.activa ?? true);
  const [intento, setIntento] = useState(false);
  const [guardando, start] = useTransition();
  const [borrar, setBorrar] = useState(false);
  const soloLectura = !puedeGestionar;

  const claveEfectiva = claveTocada ? clave : claveDesde(nombre);
  const errores = {
    nombre: !nombre.trim() ? "Falta el nombre" : null,
    clave: !claveEfectiva
      ? "Falta la clave"
      : !REGEX_CLAVE.test(claveEfectiva)
        ? "Solo minúsculas, números y guión bajo"
        : null,
    asunto: !asunto.trim() ? "Falta el asunto" : null,
    cuerpo: !cuerpo.trim() ? "Falta el texto" : null,
  };
  const valido = !Object.values(errores).some(Boolean);
  const cambios =
    nueva ||
    nombre !== plantilla.nombre ||
    claveEfectiva !== plantilla.clave ||
    categoria !== plantilla.categoria ||
    asunto !== plantilla.asunto ||
    cuerpo !== plantilla.cuerpo ||
    activa !== plantilla.activa;

  function guardar() {
    setIntento(true);
    if (!valido) {
      toast.error("Revisá los campos marcados");
      return;
    }
    start(async () => {
      const r = await guardarPlantilla({ clave: claveEfectiva, nombre, categoria, asunto, cuerpo, activa }, plantilla?.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(nueva ? "Plantilla creada" : "Cambios guardados");
      if (nueva) router.replace(`/comunicaciones/plantillas/${r.data}`);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Comunicaciones · Plantillas"
        titulo={nueva ? "Nueva plantilla" : <span className="normal-case">{plantilla.nombre}</span>}
        descripcion={
          plantilla?.sistema
            ? "Plantilla del sistema: podés cambiar el texto o desactivarla, pero no borrarla ni cambiarle la clave."
            : "El texto admite párrafos, **negrita**, [enlaces](https://…), listas y datos del destinatario."
        }
      >
        <Link
          href="/comunicaciones/plantillas"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Plantillas
        </Link>
      </EncabezadoPagina>

      {usos.length > 0 && (
        <Aviso tono="info" icono={Workflow}>
          La usa la automatización {usos.join(", ")}: los cambios se aplican a las próximas corridas.
        </Aviso>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel titulo="Contenido" icono={PenLine} delay={0.05}>
          <fieldset disabled={soloLectura} className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Nombre" error={intento ? errores.nombre : null}>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} className={claseControl} placeholder="Ej: Aviso de torneo" />
              </Campo>
              <Campo
                etiqueta="Clave"
                error={intento || claveTocada ? errores.clave : null}
                ayuda={plantilla?.sistema ? "Fija (plantilla del sistema)" : "Identificador interno, sin espacios"}
              >
                <div className="relative">
                  <input
                    value={claveEfectiva}
                    disabled={plantilla?.sistema}
                    onChange={(e) => {
                      setClaveTocada(true);
                      setClave(e.target.value.toLowerCase());
                    }}
                    maxLength={60}
                    className={cn(claseControl, "font-mono text-[13px]", plantilla?.sistema && "pr-8")}
                  />
                  {plantilla?.sistema && <Lock className="absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" />}
                </div>
              </Campo>
            </div>

            <div className="space-y-1.5">
              <span className="px-0.5 text-[10px] uppercase tracking-editorial text-muted-foreground">Categoría</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(CATEGORIAS) as Categoria[]).map((c) => (
                  <motion.button
                    key={c}
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setCategoria(c)}
                    className={cn(
                      "flex gap-2.5 rounded-xl border p-3 text-left transition-colors disabled:cursor-default",
                      categoria === c ? "border-bordo-700 bg-bordo-50/60 ring-3 ring-bordo-800/10" : "border-linea hover:border-bordo-200"
                    )}
                  >
                    {c === "difusion" ? (
                      <Megaphone className="mt-0.5 size-4 shrink-0 text-bordo-700" />
                    ) : (
                      <FileText className="mt-0.5 size-4 shrink-0 text-bordo-700" />
                    )}
                    <span>
                      <span className="block text-sm font-medium">{CATEGORIAS[c].nombre}</span>
                      <span className="block text-xs text-muted-foreground">{CATEGORIAS[c].descripcion}</span>
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>

            <EditorCuerpo
              asunto={asunto}
              cuerpo={cuerpo}
              onAsunto={setAsunto}
              onCuerpo={setCuerpo}
              errorAsunto={intento ? errores.asunto : null}
              errorCuerpo={intento ? errores.cuerpo : null}
              deshabilitado={soloLectura}
            />

            <label className="flex items-center justify-between gap-3 rounded-xl border border-linea px-3 py-2.5">
              <span>
                <span className="block text-sm font-medium">Activa</span>
                <span className="block text-xs text-muted-foreground">Las desactivadas no se ofrecen al armar un envío.</span>
              </span>
              <Switch checked={activa} onCheckedChange={setActiva} disabled={soloLectura} />
            </label>
          </fieldset>
        </Panel>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...easeSmooth, delay: 0.1 }}
          className="min-w-0 space-y-2 xl:sticky xl:top-20 xl:h-fit"
        >
          <div className="flex items-center gap-2 px-1 font-heading text-sm">
            <Eye className="size-4 text-bordo-700" />
            Vista previa en vivo
            <span className="text-xs font-normal text-muted-foreground">con datos de ejemplo</span>
          </div>
          <VistaPreviaDestinatarios asunto={asunto} cuerpo={cuerpo} categoria={categoria} pie={pie} destinatarios={EJEMPLOS} />
        </motion.div>
      </div>

      {puedeGestionar && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...easeSmooth, delay: 0.15 }}
          className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-linea bg-white/95 p-3 shadow-lg backdrop-blur"
        >
          <div className="flex gap-2">
            {!nueva && !plantilla.sistema && (
              <Boton variante="peligro" onClick={() => setBorrar(true)} disabled={guardando}>
                <Trash2 className="size-4" />
                Borrar
              </Boton>
            )}
            {!nueva && plantilla.activa && (
              <BotonLink href={`/comunicaciones/envios/nuevo?plantilla=${plantilla.id}`} variante="secundario">
                <Send className="size-4" />
                <span className="sm:hidden">Usar</span>
                <span className="hidden sm:inline">Usar en un envío</span>
              </BotonLink>
            )}
          </div>
          <Boton onClick={guardar} pendiente={guardando} disabled={!cambios}>
            <Save className="size-4" />
            {nueva ? "Crear plantilla" : "Guardar cambios"}
          </Boton>
        </motion.div>
      )}

      {plantilla && (
        <DialogoAccion
          open={borrar}
          onOpenChange={setBorrar}
          icono={Trash2}
          destructivo
          titulo="Borrar plantilla"
          descripcion={`«${plantilla.nombre}» se borra. Los envíos que ya la usaron conservan su copia del texto.`}
          textoAccion="Borrar"
          mensajeOk="Plantilla borrada"
          ejecutar={() => eliminarPlantilla(plantilla.id)}
          irA="/comunicaciones/plantillas"
        />
      )}
    </div>
  );
}
