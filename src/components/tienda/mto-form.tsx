"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Crown, Clock, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fadeInUp,
  springSmooth,
  staggerContainer,
} from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { MtoCampo, MtoValores } from "@/types/mto";
import { calcularPrecioExtra } from "@/lib/mto/pricing";
import { validarValoresMto } from "@/lib/mto/schema";

interface Props {
  campos: MtoCampo[];
  valores: MtoValores;
  onChange: (valores: MtoValores) => void;
  esSocio: boolean;
  tiempoFabricacionDias?: number | null;
}

export function MtoForm({
  campos,
  valores,
  onChange,
  esSocio,
  tiempoFabricacionDias,
}: Props) {
  const errores = useMemo(() => validarValoresMto(campos, valores).errors, [campos, valores]);

  const todosRequeridosBloqueados = useMemo(() => {
    if (esSocio) return false;
    const requeridos = campos.filter((c) => c.requerido);
    if (requeridos.length === 0) return false;
    return requeridos.every((c) => c.solo_socios);
  }, [campos, esSocio]);

  if (todosRequeridosBloqueados) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springSmooth}
        className="rounded-xl border-2 border-dorado-300 bg-dorado-300/10 p-5 text-center"
      >
        <Crown className="mx-auto size-8 text-dorado-300" />
        <p className="mt-3 font-display text-sm uppercase tracking-tight text-bordo-950">
          Personalización exclusiva para socios
        </p>
        <p className="mt-1 text-xs text-bordo-800/60">
          Hacete socio para acceder a esta opción.
        </p>
        <Link
          href="/socios"
          className="mt-3 inline-flex items-center gap-1.5 bg-bordo-800 px-4 py-2 font-heading text-[11px] uppercase tracking-editorial text-dorado-300 hover:bg-bordo-950 transition-colors"
        >
          Hacete socio
        </Link>
      </motion.div>
    );
  }

  const setValor = (key: string, valor: string | number) => {
    onChange({ ...valores, [key]: valor });
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-6"
    >
      {tiempoFabricacionDias ? (
        <motion.div
          variants={fadeInUp}
          transition={springSmooth}
          className="flex items-center gap-2 rounded-md bg-dorado-300/15 px-3.5 py-2.5 text-xs text-bordo-800"
        >
          <Clock className="size-4" />
          <span>
            Demora aprox. <strong>{tiempoFabricacionDias} días</strong> de
            fabricación
          </span>
        </motion.div>
      ) : null}

      {campos.map((campo) => (
        <MtoCampoInput
          key={campo.id}
          campo={campo}
          valor={valores[campo.key]}
          onChange={(v) => setValor(campo.key, v)}
          esSocio={esSocio}
          error={errores[campo.key]}
        />
      ))}
    </motion.div>
  );
}

interface CampoProps {
  campo: MtoCampo;
  valor: string | number | undefined;
  onChange: (v: string | number) => void;
  esSocio: boolean;
  error?: string;
}

function MtoCampoInput({ campo, valor, onChange, esSocio, error }: CampoProps) {
  const blocked = !!campo.solo_socios && !esSocio;
  const isSelectLike = campo.tipo === "select" || campo.tipo === "talle";

  return (
    <motion.div variants={fadeInUp} transition={springSmooth} className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <Label
          className={cn(
            "font-heading text-xs uppercase tracking-editorial font-semibold",
            blocked ? "text-bordo-800/40" : "text-bordo-950"
          )}
        >
          {campo.label}
          {campo.requerido && !blocked && <span className="text-bordo-800 ml-0.5">*</span>}
        </Label>
        {campo.solo_socios && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest",
              esSocio
                ? "bg-bordo-800 text-dorado-300"
                : "bg-dorado-300/30 text-bordo-800"
            )}
          >
            <Crown className="size-2.5" />
            Solo socios
          </span>
        )}
      </div>

      {blocked ? (
        <BlockedField />
      ) : (
        <>
          {campo.tipo === "texto" && (
            <Input
              value={String(valor ?? "")}
              onChange={(e) => onChange(e.target.value)}
              placeholder={campo.placeholder ?? `Escribí ${campo.label.toLowerCase()}`}
              maxLength={campo.max_length}
              className="h-12 border-bordo-800/20 bg-white text-base focus:border-bordo-800"
            />
          )}
          {campo.tipo === "numero" && (
            <Input
              type="number"
              value={valor === undefined || valor === "" ? "" : String(valor)}
              onChange={(e) => {
                const v = e.target.value;
                onChange(v === "" ? "" : parseFloat(v));
              }}
              min={campo.min}
              max={campo.max}
              placeholder={campo.placeholder ?? `Número de ${campo.label.toLowerCase()}`}
              className="h-12 border-bordo-800/20 bg-white text-base focus:border-bordo-800"
            />
          )}
          {isSelectLike && campo.opciones && (
            <SelectField
              opciones={campo.opciones}
              valor={valor === undefined ? "" : String(valor)}
              onChange={onChange}
              esSocio={esSocio}
              placeholder={`Elegí ${campo.label.toLowerCase()}`}
            />
          )}
        </>
      )}

      {/* Sobrecargo info */}
      {!blocked && !isSelectLike && campo.precio_extra ? (
        <p className="text-xs text-bordo-800/60">
          + ${campo.precio_extra.toLocaleString("es-UY")} si lo completás
        </p>
      ) : null}

      {error && !blocked ? (
        <p className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="size-3.5" />
          {error}
        </p>
      ) : null}
    </motion.div>
  );
}

function BlockedField() {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-dashed border-dorado-300 bg-dorado-300/5 px-3 py-2 text-xs text-bordo-800/70">
      <span>Disponible solo para socios del club</span>
      <Link
        href="/socios"
        className="font-heading text-[10px] uppercase tracking-editorial text-bordo-800 hover:text-bordo-950 underline underline-offset-2"
      >
        Hacete socio →
      </Link>
    </div>
  );
}

function SelectField({
  opciones,
  valor,
  onChange,
  esSocio,
  placeholder,
}: {
  opciones: NonNullable<MtoCampo["opciones"]>;
  valor: string;
  onChange: (v: string) => void;
  esSocio: boolean;
  placeholder: string;
}) {
  // Reorder: disponibles primero, bloqueadas al final
  const ordered = useMemo(() => {
    const disponibles = opciones.filter((o) => esSocio || !o.solo_socios);
    const bloqueadas = opciones.filter((o) => !esSocio && o.solo_socios);
    return { disponibles, bloqueadas };
  }, [opciones, esSocio]);

  const selected = opciones.find((o) => o.valor === valor);

  return (
    <Select value={valor || undefined} onValueChange={(v) => onChange(v ?? "")}>
      <SelectTrigger className="h-12 w-full border-bordo-800/20 bg-white text-base focus:border-bordo-800 data-[placeholder]:text-bordo-800/50">
        <SelectValue placeholder={placeholder}>
          {selected?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-[var(--anchor-width)] w-auto">
        {ordered.disponibles.map((opcion) => (
          <SelectItem
            key={opcion.valor}
            value={opcion.valor}
            className="py-2.5 pr-10"
          >
            <span className="flex items-center justify-between gap-6 w-full whitespace-nowrap">
              <span className="text-base">{opcion.label}</span>
              {opcion.precio_extra ? (
                <span className="text-xs text-bordo-800/60 shrink-0">
                  +${opcion.precio_extra.toLocaleString("es-UY")}
                </span>
              ) : null}
            </span>
          </SelectItem>
        ))}
        {ordered.bloqueadas.length > 0 && (
          <>
            <div className="my-1 border-t border-border/40" />
            <div className="px-2 py-1 font-heading text-[9px] uppercase tracking-widest text-bordo-800/50">
              Exclusivo para socios
            </div>
            {ordered.bloqueadas.map((opcion) => (
              <div
                key={opcion.valor}
                className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm text-muted-foreground/60"
              >
                <span className="flex items-center gap-1.5">
                  <Crown className="size-2.5" />
                  {opcion.label}
                </span>
                <Link
                  href="/socios"
                  className="text-[10px] uppercase tracking-widest text-bordo-800 hover:underline"
                >
                  Hacete socio
                </Link>
              </div>
            ))}
          </>
        )}
      </SelectContent>
    </Select>
  );
}

export function calcularExtraSeguro(
  campos: MtoCampo[],
  valores: MtoValores,
  esSocio: boolean
): number {
  // Al calcular el extra, ignorar campos solo_socios si el usuario no es socio,
  // por defensa.
  const filtrados = campos.map((c) => {
    if (c.solo_socios && !esSocio) {
      return { ...c, precio_extra: 0 };
    }
    if ((c.tipo === "select" || c.tipo === "talle") && !esSocio) {
      return {
        ...c,
        opciones: c.opciones?.map((o) =>
          o.solo_socios ? { ...o, precio_extra: 0 } : o
        ),
      };
    }
    return c;
  });
  return calcularPrecioExtra(filtrados, valores);
}
