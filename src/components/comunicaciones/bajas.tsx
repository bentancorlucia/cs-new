"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, MailCheck, MailX, Plus, Search, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { easeSmooth } from "@/lib/motion";
import {
  NOMBRE_ALCANCE,
  NOMBRE_MOTIVO_BAJA,
  NOMBRE_ORIGEN_BAJA,
  REGEX_EMAIL,
  formatCorta,
} from "@/lib/comunicaciones/esquemas";
import { revocarSupresion, suprimirEmail } from "@/app/(dashboard)/comunicaciones/actions";
import { Aviso, Boton, Campo, DialogoAccion, EncabezadoPagina, Filtros, Kpi, NumeroAnimado, Vacio, claseControl, pill } from "./ui";

export type SupresionFila = {
  id: number;
  email: string;
  alcance: string;
  motivo: string;
  origen: string;
  notas: string | null;
  created_at: string;
  revocada_at: string | null;
  mensaje_id: string | null;
};

type Filtro = "vigentes" | "revocadas" | "todas";

export function Bajas({
  supresiones,
  puedeGestionar,
  error,
}: {
  supresiones: SupresionFila[];
  puedeGestionar: boolean;
  error: string | null;
}) {
  const [filtro, setFiltro] = useState<Filtro>("vigentes");
  const [texto, setTexto] = useState("");
  const q = useDeferredValue(texto.trim().toLowerCase());
  const vigentes = supresiones.filter((s) => !s.revocada_at);
  const lista = useMemo(
    () =>
      supresiones.filter((s) => {
        if (filtro === "vigentes" && s.revocada_at) return false;
        if (filtro === "revocadas" && !s.revocada_at) return false;
        return !q || `${s.email} ${s.notas ?? ""}`.toLowerCase().includes(q);
      }),
    [supresiones, filtro, q]
  );

  // Alta manual
  const [alta, setAlta] = useState(false);
  const [email, setEmail] = useState("");
  const [alcance, setAlcance] = useState<"difusion" | "personal" | "total">("difusion");
  const [motivo, setMotivo] = useState<"baja" | "rebote" | "queja" | "manual">("baja");
  const [notas, setNotas] = useState("");
  const [errorEmail, setErrorEmail] = useState<string | null>(null);

  // Revocar
  const [revocar, setRevocar] = useState<SupresionFila | null>(null);

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Comunicaciones"
        titulo="Bajas"
        descripcion="Direcciones que no reciben correos. Nunca se borran: si alguien vuelve a querer recibirlos, la baja se revoca y queda el registro."
      >
        {puedeGestionar && (
          <Boton onClick={() => setAlta(true)}>
            <Plus className="size-4" />
            Registrar baja
          </Boton>
        )}
      </EncabezadoPagina>

      {error && <Aviso tono="error" icono={AlertTriangle}>{error}</Aviso>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Bajas de difusión" delay={0.02} detalle="Siguen recibiendo lo institucional">
          <NumeroAnimado valor={vigentes.filter((s) => s.alcance === "difusion").length} />
        </Kpi>
        <Kpi etiqueta="Bajas de saludos" delay={0.04} detalle="No reciben cumpleaños ni bienvenida">
          <NumeroAnimado valor={vigentes.filter((s) => s.alcance === "personal").length} />
        </Kpi>
        <Kpi etiqueta="Bajas totales" delay={0.06} detalle="No reciben ningún correo">
          <NumeroAnimado valor={vigentes.filter((s) => s.alcance === "total").length} />
        </Kpi>
        <Kpi etiqueta="Revocadas" delay={0.1} detalle="Volvieron a recibir">
          <NumeroAnimado valor={supresiones.length - vigentes.length} />
        </Kpi>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...easeSmooth, delay: 0.05 }}
        className="space-y-3 rounded-2xl border border-linea bg-white p-3"
      >
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscá una dirección…" className={cn(claseControl, "pl-9")} />
        </div>
        <Filtros<Filtro>
          id="bajas"
          valor={filtro}
          onChange={setFiltro}
          opciones={[
            { valor: "vigentes", etiqueta: "Vigentes", cantidad: vigentes.length },
            { valor: "revocadas", etiqueta: "Revocadas", cantidad: supresiones.length - vigentes.length },
            { valor: "todas", etiqueta: "Todas", cantidad: supresiones.length },
          ]}
        />
      </motion.div>

      {lista.length === 0 ? (
        <Vacio
          icono={MailCheck}
          titulo={supresiones.length === 0 ? "Nadie se dio de baja" : "No hay bajas con ese filtro"}
          texto={supresiones.length === 0 ? "Las bajas desde el enlace del correo y las que registres a mano aparecen acá." : undefined}
        />
      ) : (
        <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-white">
          <AnimatePresence initial={false}>
            {lista.map((s, i) => (
              <motion.li
                key={s.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 20) * 0.02 } }}
                exit={{ opacity: 0, height: 0 }}
                className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3", s.revocada_at && "bg-superficie/40")}
              >
                <div className="min-w-0 flex-1">
                  <div className={cn("truncate text-sm font-medium", s.revocada_at && "text-muted-foreground line-through")}>{s.email}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={cn(
                        pill,
                        s.alcance === "total" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-dorado-300 bg-dorado-100 text-dorado-800"
                      )}
                    >
                      {NOMBRE_ALCANCE[s.alcance] ?? s.alcance}
                    </span>
                    <span>{NOMBRE_MOTIVO_BAJA[s.motivo] ?? s.motivo}</span>
                    <span>· {NOMBRE_ORIGEN_BAJA[s.origen] ?? s.origen}</span>
                    <span className="tabular-nums">· {formatCorta(s.created_at)}</span>
                    {s.revocada_at && <span className="text-emerald-700">· revocada {formatCorta(s.revocada_at)}</span>}
                  </div>
                  {s.notas && <div className="mt-1 text-xs text-foreground/70 italic">{s.notas}</div>}
                </div>
                {puedeGestionar && !s.revocada_at && (
                  <Boton variante="secundario" className="h-8 px-3 text-xs" onClick={() => setRevocar(s)}>
                    <Undo2 className="size-3.5" />
                    Revocar
                  </Boton>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <DialogoAccion
        open={alta}
        onOpenChange={setAlta}
        icono={MailX}
        titulo="Registrar baja"
        descripcion="Los mensajes pendientes a esa dirección que no correspondan se omiten al momento."
        textoAccion="Registrar baja"
        mensajeOk="Baja registrada"
        alTerminar={() => {
          setEmail("");
          setNotas("");
          setErrorEmail(null);
        }}
        ejecutar={() => {
          const e = email.trim().toLowerCase();
          if (!REGEX_EMAIL.test(e)) {
            setErrorEmail("Dirección de correo inválida");
            return null;
          }
          setErrorEmail(null);
          return suprimirEmail({ email: e, alcance, motivo, notas: notas.trim() || undefined });
        }}
      >
        <Campo etiqueta="Correo" error={errorEmail}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@ejemplo.com"
            autoComplete="off"
            className={claseControl}
            aria-invalid={!!errorEmail}
          />
        </Campo>
        <div className="space-y-1.5">
          <span className="px-0.5 text-[10px] uppercase tracking-editorial text-muted-foreground">Alcance</span>
          <div className="grid gap-2">
            {(
              [
                { v: "difusion", t: "Solo difusión", d: "Sigue recibiendo cuotas, recibos, avisos y saludos." },
                { v: "personal", t: "Solo saludos", d: "No recibe cumpleaños ni bienvenida; el resto le sigue llegando." },
                { v: "total", t: "Todo", d: "No se le escribe más (rebote permanente o pedido expreso)." },
              ] as const
            ).map((o) => (
              <label
                key={o.v}
                className={cn(
                  "flex cursor-pointer gap-2.5 rounded-xl border p-2.5 transition-colors",
                  alcance === o.v ? "border-bordo-700 bg-bordo-50/60" : "border-linea hover:border-bordo-200"
                )}
              >
                <input type="radio" checked={alcance === o.v} onChange={() => setAlcance(o.v)} className="mt-0.5 size-4 accent-bordo-800" />
                <span>
                  <span className="block text-sm font-medium">{o.t}</span>
                  <span className="block text-xs text-muted-foreground">{o.d}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <Campo etiqueta="Motivo">
          <select value={motivo} onChange={(e) => setMotivo(e.target.value as typeof motivo)} className={claseControl}>
            {Object.entries(NOMBRE_MOTIVO_BAJA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Notas (opcional)">
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Ej: lo pidió por teléfono"
            className="block w-full resize-y rounded-lg border border-linea bg-white px-3 py-2 text-sm outline-none transition-all hover:border-bordo-200 focus:border-bordo-700 focus:ring-3 focus:ring-bordo-800/10"
          />
        </Campo>
      </DialogoAccion>

      <DialogoAccion
        open={!!revocar}
        onOpenChange={(o) => !o && setRevocar(null)}
        icono={Undo2}
        titulo="Revocar baja"
        descripcion={
          revocar && (
            <span>
              <span className="font-medium text-foreground">{revocar.email}</span> vuelve a recibir{" "}
              {revocar.alcance === "total" ? "todos los correos" : revocar.alcance === "personal" ? "los saludos" : "la difusión"} desde los próximos envíos. La baja queda en el
              historial como revocada.
            </span>
          )
        }
        textoAccion="Revocar"
        mensajeOk="Baja revocada"
        ejecutar={() => (revocar ? revocarSupresion(revocar.id) : null)}
      />
    </div>
  );
}
