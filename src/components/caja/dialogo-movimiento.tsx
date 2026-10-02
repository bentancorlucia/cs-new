"use client";

import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CatalogosCaja, CuentaCaja, TipoMovimientoCaja } from "@/lib/comercial/caja";
import { CampoMonto } from "@/components/pos/campo-monto";
import { parseMonto, pesos } from "@/components/pos/formato";
import { springSmooth } from "@/lib/motion";
import { ACCIONES_CAJA } from "./barra-caja";

export type DatosMovimiento = {
  tipo: TipoMovimientoCaja;
  importe: number;
  cuenta_id: string;
  descripcion: string;
  centro_costo_id: string | null;
};

const TEXTOS: Record<TipoMovimientoCaja, { titulo: string; ayuda: string; cuenta: string; descripcion: string }> = {
  deposito_banco: {
    titulo: "Depositar en el banco",
    ayuda: "Sale efectivo de la caja y entra a la cuenta bancaria.",
    cuenta: "Cuenta bancaria",
    descripcion: "Depósito de la recaudación",
  },
  retiro: {
    titulo: "Retiro de efectivo",
    ayuda: "Sale efectivo de la caja hacia otra caja o fondo del club.",
    cuenta: "Va a",
    descripcion: "Retiro para tesorería",
  },
  ingreso: {
    titulo: "Ingreso de efectivo",
    ayuda: "Entra efectivo a la caja (por ejemplo, cambio traído de tesorería).",
    cuenta: "Viene de",
    descripcion: "Cambio traído de tesorería",
  },
  gasto: {
    titulo: "Gasto menor",
    ayuda: "Se paga un gasto chico con el efectivo de la caja.",
    cuenta: "Cuenta de gasto",
    descripcion: "",
  },
};

function cuentasPara(tipo: TipoMovimientoCaja, c: CatalogosCaja): CuentaCaja[] {
  if (tipo === "deposito_banco") return c.bancos;
  if (tipo === "gasto") return c.gastos;
  return c.disponibilidades;
}

function cuentaInicial(tipo: TipoMovimientoCaja, c: CatalogosCaja): string {
  if (tipo === "deposito_banco") return c.bancoSugerido ?? c.bancos[0]?.id ?? "";
  if (tipo === "gasto") return "";
  return c.disponibilidades.find((x) => x.codigo === "1.1.01.01")?.id ?? c.disponibilidades[0]?.id ?? "";
}

const claseSelect =
  "w-full h-12 rounded-xl border border-linea bg-white px-3 text-sm outline-none focus:border-bordo-500 disabled:opacity-60";

/** Depósito al banco, retiro, ingreso o gasto menor con su asiento. */
export function DialogoMovimiento({
  tipo,
  catalogos,
  esperado,
  onCambiarTipo,
  onCerrar,
  onRegistrar,
}: {
  tipo: TipoMovimientoCaja | null;
  catalogos: CatalogosCaja;
  esperado: number | null;
  onCambiarTipo: (t: TipoMovimientoCaja) => void;
  onCerrar: () => void;
  onRegistrar: (d: DatosMovimiento) => Promise<{ ok: boolean; error?: string }>;
}) {
  return (
    <Dialog open={tipo !== null} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-2xl max-h-[94vh] overflow-y-auto p-5">
        {tipo && (
          <Formulario
            key={tipo}
            tipo={tipo}
            catalogos={catalogos}
            esperado={esperado}
            onCambiarTipo={onCambiarTipo}
            onCerrar={onCerrar}
            onRegistrar={onRegistrar}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Formulario({
  tipo,
  catalogos,
  esperado,
  onCambiarTipo,
  onCerrar,
  onRegistrar,
}: {
  tipo: TipoMovimientoCaja;
  catalogos: CatalogosCaja;
  esperado: number | null;
  onCambiarTipo: (t: TipoMovimientoCaja) => void;
  onCerrar: () => void;
  onRegistrar: (d: DatosMovimiento) => Promise<{ ok: boolean; error?: string }>;
}) {
  const t = TEXTOS[tipo];
  const cuentas = cuentasPara(tipo, catalogos);
  const [importeTxt, setImporteTxt] = useState("");
  const [cuentaId, setCuentaId] = useState(() => cuentaInicial(tipo, catalogos));
  const [centroId, setCentroId] = useState(catalogos.centroTienda ?? "");
  const [descripcion, setDescripcion] = useState(t.descripcion);
  const [pendiente, iniciar] = useTransition();

  const importe = parseMonto(importeTxt);
  const cuenta = useMemo(() => cuentas.find((c) => c.id === cuentaId) ?? null, [cuentas, cuentaId]);
  const pideCentro = cuenta?.requiere_centro_costo === true;
  const sale = tipo !== "ingreso";
  const excede = sale && esperado != null && importe > esperado;
  const valido =
    importe > 0 && !!cuentaId && descripcion.trim().length >= 3 && (!pideCentro || !!centroId) && !excede;

  const registrar = () => {
    if (!valido || pendiente) return;
    iniciar(async () => {
      const r = await onRegistrar({
        tipo,
        importe,
        cuenta_id: cuentaId,
        descripcion: descripcion.trim(),
        centro_costo_id: pideCentro ? centroId : null,
      });
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo registrar el movimiento");
        return;
      }
      toast.success(`${t.titulo}: ${pesos(importe)} registrado`);
      onCerrar();
    });
  };

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="font-heading">{t.titulo}</DialogTitle>
        <DialogDescription>{t.ayuda}</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-4 gap-1 rounded-xl bg-superficie p-1">
        {ACCIONES_CAJA.map(({ tipo: tp, texto, icono: Icono }) => (
          <button
            key={tp}
            type="button"
            onClick={() => onCambiarTipo(tp)}
            className="relative h-11 rounded-lg text-xs sm:text-sm font-heading font-semibold"
          >
            {tp === tipo && (
              <motion.span layoutId="mov-tipo" transition={springSmooth} className="absolute inset-0 rounded-lg bg-white shadow-sm" />
            )}
            <span className={`relative flex items-center justify-center gap-1.5 ${tp === tipo ? "text-bordo-800" : "text-muted-foreground"}`}>
              <Icono className="size-4" />
              {texto}
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-heading uppercase tracking-editorial text-muted-foreground" htmlFor="mov-cuenta">
              {t.cuenta}
            </label>
            <select id="mov-cuenta" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className={claseSelect}>
              {tipo === "gasto" && <option value="">Elegí la cuenta…</option>}
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} · {c.nombre}
                </option>
              ))}
            </select>
          </div>

          <AnimatePresence initial={false}>
            {pideCentro && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-1.5 overflow-hidden"
              >
                <label className="text-xs font-heading uppercase tracking-editorial text-muted-foreground" htmlFor="mov-centro">
                  Centro de costo
                </label>
                <select id="mov-centro" value={centroId} onChange={(e) => setCentroId(e.target.value)} className={claseSelect}>
                  <option value="">Elegí el centro…</option>
                  {catalogos.centros.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-1.5">
            <label className="text-xs font-heading uppercase tracking-editorial text-muted-foreground" htmlFor="mov-desc">
              Descripción
            </label>
            <Input
              id="mov-desc"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={tipo === "gasto" ? "Ej.: bolsas para la tienda" : ""}
              className="h-12"
              maxLength={500}
            />
          </div>

          {sale && esperado != null && (
            <div className="rounded-xl bg-superficie px-4 py-2 text-sm">
              En la caja hay <span className="font-heading font-bold tabular-nums">{pesos(esperado)}</span>
            </div>
          )}
          <AnimatePresence initial={false}>
            {excede && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-1.5 text-sm text-red-600"
              >
                <AlertTriangle className="size-4" /> No hay ese efectivo en la caja
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <CampoMonto etiqueta="Importe" valor={importeTxt} onChange={setImporteTxt} decimales invalido={excede} autoFocus />
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCerrar} disabled={pendiente} className="h-12">
          Cancelar
        </Button>
        <motion.div whileTap={{ scale: 0.97 }}>
          <Button onClick={registrar} disabled={!valido || pendiente} className="h-12 w-full sm:w-auto gap-2 font-heading">
            {pendiente && <Loader2 className="size-5 animate-spin" />}
            Registrar {importe > 0 ? pesos(importe) : ""}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
