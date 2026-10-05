"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Link2, Mail, Pencil, Phone, Plus, ShieldCheck, Trash2, UserRoundCheck, UserRoundX, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { easeSmooth } from "@/lib/motion";
import type { Representante } from "@/lib/socios/cambios-debito";
import { guardarRepresentante, quitarRepresentante } from "@/app/(dashboard)/secretaria/disciplinas/actions";
import { Boton, Campo, DialogoAccion, Explicacion, Panel, Vacio, claseControl } from "@/components/socios/cuotas/ui";
import type { DatosDisciplina } from "./form-disciplina";

const pill =
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap";

function Si({ si, texto }: { si: boolean; texto: string }) {
  return (
    <span className={cn(pill, si ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-linea bg-superficie text-muted-foreground")}>
      {si ? <Check className="size-3" /> : <X className="size-3" />}
      {texto}
    </span>
  );
}

/**
 * Representantes de la disciplina: reciben el resumen de cada liquidación
 * por mail y, si tienen cuenta en el sitio, entran al panel de la
 * disciplina. La cuenta se vincula sola cuando se registran con ese correo.
 */
export function RepresentantesVista({
  disciplina,
  representantes,
  error,
  puedeEditar,
}: {
  disciplina: DatosDisciplina;
  representantes: Representante[];
  error: string | null;
  puedeEditar: boolean;
}) {
  const [editar, setEditar] = useState<Representante | "nuevo" | null>(null);
  const [quitar, setQuitar] = useState<Representante | null>(null);
  const reciben = representantes.filter((r) => r.recibe_liquidacion).length;

  return (
    <>
      <Panel
        titulo="Representantes"
        icono={Users}
        accion={
          puedeEditar ? (
            <Boton className="h-8 px-3 text-xs" onClick={() => setEditar("nuevo")}>
              <Plus className="size-3.5" />
              Agregar
            </Boton>
          ) : undefined
        }
      >
        {error ? (
          <p className="p-4 text-sm text-rose-700">{error}</p>
        ) : representantes.length === 0 ? (
          <div className="p-4">
            <Vacio
              icono={Users}
              titulo="La disciplina no tiene representantes"
              texto="Sin representantes, nadie recibe el resumen de la liquidación mensual ni puede entrar al panel de la disciplina."
            >
              {puedeEditar && (
                <Boton onClick={() => setEditar("nuevo")}>
                  <Plus className="size-4" />
                  Agregar representante
                </Boton>
              )}
            </Vacio>
          </div>
        ) : (
          <ul className="divide-y divide-linea">
            <AnimatePresence initial={false}>
              {representantes.map((r, i) => (
                <motion.li
                  key={r.id}
                  layout="position"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ ...easeSmooth, delay: Math.min(i, 10) * 0.03 }}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-superficie/40 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-medium">{r.nombre}</span>
                      {r.cargo && <span className="text-xs text-muted-foreground">· {r.cargo}</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <a href={`mailto:${r.email}`} className="inline-flex min-w-0 items-center gap-1 transition-colors hover:text-bordo-800">
                        <Mail className="size-3.5 shrink-0" />
                        <span className="truncate">{r.email}</span>
                      </a>
                      {r.telefono && (
                        <a href={`tel:${r.telefono.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 transition-colors hover:text-bordo-800">
                          <Phone className="size-3.5" />
                          {r.telefono}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 row-start-2 flex flex-col gap-1.5 md:col-span-1 md:row-start-auto">
                    <div className="flex flex-wrap gap-1.5">
                      <Si si={r.recibe_liquidacion} texto="Recibe la liquidación" />
                      <Si si={r.acceso_panel} texto="Acceso al panel" />
                    </div>
                    {r.tieneCuenta ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                        <UserRoundCheck className="size-3.5" />
                        Tiene cuenta en el sitio
                      </span>
                    ) : (
                      <span className="inline-flex items-start gap-1 text-[11px] text-muted-foreground">
                        <UserRoundX className="mt-px size-3.5 shrink-0" />
                        Sin cuenta todavía: se vincula cuando cree su usuario con ese correo
                      </span>
                    )}
                  </div>
                  {puedeEditar && (
                    <div className="flex items-start justify-end gap-1">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        whileHover={{ scale: 1.05 }}
                        onClick={() => setEditar(r)}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-superficie hover:text-bordo-800"
                        aria-label={`Editar a ${r.nombre}`}
                      >
                        <Pencil className="size-4" />
                      </motion.button>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        whileHover={{ scale: 1.05 }}
                        onClick={() => setQuitar(r)}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-700"
                        aria-label={`Quitar a ${r.nombre}`}
                      >
                        <Trash2 className="size-4" />
                      </motion.button>
                    </div>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
        <div className="space-y-1 border-t border-linea px-4 py-2">
          {!error && representantes.length > 0 && reciben === 0 && (
            <p className="text-[11px] font-medium text-rose-700">Nadie recibe el resumen de la liquidación: marcá al menos a uno.</p>
          )}
          <Explicacion>
            Los que reciben la liquidación tienen el resumen por mail cada mes. Con acceso al panel ven los socios, las liquidaciones y la cuenta de la
            disciplina, y pueden dar altas y bajas: lo que cambian queda en la pestaña Cambios.
          </Explicacion>
        </div>
      </Panel>

      {editar && (
        <DialogoRepresentante
          key={editar === "nuevo" ? "nuevo" : editar.id}
          disciplina={disciplina}
          representante={editar === "nuevo" ? null : editar}
          onClose={() => setEditar(null)}
        />
      )}

      <DialogoAccion
        open={!!quitar}
        onOpenChange={(o) => !o && setQuitar(null)}
        icono={Trash2}
        destructivo
        titulo={`Quitar a ${quitar?.nombre ?? ""}`}
        descripcion={
          <span>
            Deja de ser representante de {disciplina.nombre}: no recibe más las liquidaciones
            {quitar?.tieneCuenta ? " y pierde el acceso al panel de la disciplina" : ""}. Queda registrado en los cambios.
          </span>
        }
        textoAccion="Quitar"
        mensaje="Representante quitado"
        ejecutar={async () => {
          const r = await quitarRepresentante({ id: quitar!.id, disciplina_id: disciplina.id });
          return r.ok ? { ok: true } : r;
        }}
      />
    </>
  );
}

function DialogoRepresentante({
  disciplina,
  representante: r,
  onClose,
}: {
  disciplina: DatosDisciplina;
  representante: Representante | null;
  onClose: () => void;
}) {
  const [nombre, setNombre] = useState(r?.nombre ?? "");
  const [email, setEmail] = useState(r?.email ?? "");
  const [telefono, setTelefono] = useState(r?.telefono ?? "");
  const [cargo, setCargo] = useState(r?.cargo ?? "");
  const [recibe, setRecibe] = useState(r?.recibe_liquidacion ?? true);
  const [acceso, setAcceso] = useState(r?.acceso_panel ?? true);
  const emailValido = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  return (
    <DialogoAccion
      open
      onOpenChange={(o) => !o && onClose()}
      icono={r ? Pencil : Plus}
      titulo={r ? `Editar a ${r.nombre}` : `Nuevo representante de ${disciplina.nombre}`}
      descripcion="Si todavía no tiene cuenta en el sitio, se vincula sola cuando se registre con este correo."
      textoAccion={r ? "Guardar" : "Agregar"}
      mensaje={r ? "Representante guardado" : "Representante agregado"}
      deshabilitado={nombre.trim().length < 2 || !emailValido}
      ejecutar={async () => {
        const res = await guardarRepresentante({
          id: r?.id ?? null,
          disciplina_id: disciplina.id,
          nombre: nombre.trim(),
          email: email.trim(),
          telefono: telefono.trim() || null,
          cargo: cargo.trim() || null,
          recibe_liquidacion: recibe,
          acceso_panel: acceso,
        });
        return res.ok ? { ok: true } : res;
      }}
    >
      <Campo etiqueta="Nombre">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus maxLength={120} className={claseControl} placeholder="Nombre y apellido" />
      </Campo>
      <Campo etiqueta="Correo" error={email.trim() && !emailValido ? "Correo inválido" : null}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={200}
          aria-invalid={!!email.trim() && !emailValido}
          className={claseControl}
          placeholder="nombre@correo.com"
        />
      </Campo>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Teléfono">
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={30} inputMode="tel" className={claseControl} placeholder="Opcional" />
        </Campo>
        <Campo etiqueta="Cargo">
          <input value={cargo} onChange={(e) => setCargo(e.target.value)} maxLength={80} className={claseControl} placeholder="Tesorero, delegado…" />
        </Campo>
      </div>
      <div className="space-y-2">
        <Interruptor
          activo={recibe}
          onChange={setRecibe}
          icono={Mail}
          titulo="Recibe la liquidación"
          texto="Le llega por mail el resumen de cada liquidación mensual."
        />
        <Interruptor
          activo={acceso}
          onChange={setAcceso}
          icono={ShieldCheck}
          titulo="Acceso al panel"
          texto="Entra al panel de la disciplina con su cuenta del sitio."
        />
      </div>
      {r && !r.tieneCuenta && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Link2 className="size-3.5" />
          Todavía no tiene cuenta: si cambiás el correo, se va a vincular con el nuevo.
        </p>
      )}
    </DialogoAccion>
  );
}

function Interruptor({
  activo,
  onChange,
  icono: Icono,
  titulo,
  texto,
}: {
  activo: boolean;
  onChange: (v: boolean) => void;
  icono: typeof Mail;
  titulo: string;
  texto: string;
}) {
  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={activo}
      whileTap={{ scale: 0.99 }}
      onClick={() => onChange(!activo)}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
        activo ? "border-bordo-200 bg-bordo-50/50" : "border-linea hover:bg-superficie"
      )}
    >
      <Icono className={cn("size-4 shrink-0", activo ? "text-bordo-800" : "text-muted-foreground")} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{titulo}</span>
        <span className="block text-[11px] text-muted-foreground">{texto}</span>
      </span>
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", activo ? "bg-bordo-800" : "bg-linea")}>
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow-sm", activo ? "right-0.5" : "left-0.5")}
        />
      </span>
    </motion.button>
  );
}
