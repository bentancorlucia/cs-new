"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Clock, Dumbbell, ShieldAlert, Star, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { fadeInUp, staggerContainerFast } from "@/lib/motion";
import { Aviso, EncabezadoPagina, NumeroAnimado, Pastilla, Vacio } from "@/components/socios/cuotas/ui";
import { SaldoNeto } from "@/components/socios/disciplinas/ui";

export interface TarjetaDisciplina {
  disciplina_id: number;
  nombre: string;
  slug: string;
  representante: boolean;
  activa: boolean;
  socios: number | null;
  morosos: number | null;
  pendientes: number | null;
  saldo: number | null;
}

export function SelectorDisciplinas({ disciplinas, error }: { disciplinas: TarjetaDisciplina[]; error: string | null }) {
  const propias = disciplinas.filter((d) => d.representante);
  return (
    <div className="min-w-0 space-y-5 pb-8">
      <EncabezadoPagina
        eyebrow="Panel de la disciplina"
        titulo="Elegí la disciplina"
        descripcion={
          propias.length
            ? "Sus socios, planes, liquidaciones y la cuenta con el club."
            : "Como parte del club podés entrar al panel de cualquier disciplina."
        }
      />
      {error && <Aviso titulo="No se pudieron leer las disciplinas">{error}</Aviso>}
      {!error && disciplinas.length === 0 ? (
        <Vacio
          icono={Dumbbell}
          titulo="Todavía no tenés una disciplina asignada"
          texto="Pedile a secretaría que te agregue como representante de tu disciplina con acceso al panel."
        />
      ) : (
        <motion.ul
          variants={staggerContainerFast}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          {disciplinas.map((d) => (
            <motion.li key={d.disciplina_id} variants={fadeInUp}>
              <motion.div whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }} className="h-full">
                <Link
                  href={`/disciplina/${d.disciplina_id}`}
                  className={cn(
                    "group flex h-full flex-col gap-4 rounded-2xl border bg-white p-4 transition-shadow hover:shadow-card-hover",
                    d.representante ? "border-bordo-200" : "border-linea"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-bordo-800 text-white shadow-sm transition-transform group-hover:scale-105">
                      <Dumbbell className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-heading text-base text-foreground">{d.nombre}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {d.representante && (
                          <Pastilla tono="info">
                            <Star className="size-3" />
                            Sos representante
                          </Pastilla>
                        )}
                        {!d.activa && <Pastilla>Inactiva</Pastilla>}
                        {!!d.pendientes && (
                          <Pastilla tono="alerta">
                            <Clock className="size-3" />
                            {d.pendientes} para tesorería
                          </Pastilla>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-bordo-800" />
                  </div>
                  <div className="mt-auto grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-superficie/70 px-3 py-2">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Users className="size-3" />
                        Socios
                      </div>
                      <div className="font-heading text-lg text-foreground">
                        {d.socios === null ? "—" : <NumeroAnimado valor={d.socios} />}
                      </div>
                      {!!d.morosos && <div className="text-rose-700">{d.morosos} con atraso</div>}
                    </div>
                    <div className="rounded-xl bg-superficie/70 px-3 py-2">
                      <div className="text-muted-foreground">Con el club</div>
                      <div className="mt-1 text-sm font-medium">{d.saldo === null ? "—" : <SaldoNeto neto={d.saldo} corto />}</div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}

export function SinAcceso({ mensaje }: { mensaje: string }) {
  return (
    <div className="min-w-0 space-y-5 pb-8">
      <Vacio icono={ShieldAlert} titulo="No podés ver esta disciplina" texto={mensaje}>
        <Link href="/disciplina" className="text-sm font-medium text-bordo-800 hover:underline">
          Volver a mis disciplinas
        </Link>
      </Vacio>
    </div>
  );
}
