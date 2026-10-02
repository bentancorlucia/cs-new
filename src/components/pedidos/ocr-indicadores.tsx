"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Banknote, Calendar, CheckCircle, Hash, Landmark, ScanSearch, User, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CUENTA_COBRO_TIENDA, esBancoDeCobro } from "@/lib/tienda/cuenta-cobro";
import type { DatosOcr } from "./tipos";

export function OcrIndicadores({
  datos,
  totalPedido,
}: {
  datos: DatosOcr;
  totalPedido: number;
}) {
  if (!datos || datos.confianza === undefined) return null;

  const confianza = datos.confianza as number;

  // Low confidence — manual check needed
  if (confianza < 0.3) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-600">
        <XCircle className="size-3.5 shrink-0" />
        <span className="font-medium">
          No se pudo extraer información suficiente — verificar manualmente
        </span>
      </div>
    );
  }

  const isItau = datos.banco_destino && esBancoDeCobro(datos.banco_destino);
  const isCuentaCorrecta =
    datos.cuenta_destino && datos.cuenta_destino.includes(CUENTA_COBRO_TIENDA.cuenta);
  const isBeneficiarioCorrecto =
    datos.beneficiario &&
    /seminario|bordo/i.test(datos.beneficiario);
  const montoExacto =
    datos.monto != null && Math.abs(datos.monto - totalPedido) < 0.01;
  const montoDiferente =
    datos.monto != null && Math.abs(datos.monto - totalPedido) >= 0.01;

  const indicators = [
    {
      key: "banco",
      icon: Landmark,
      ok: isItau,
      label: isItau
        ? `Banco destino ${CUENTA_COBRO_TIENDA.bancoCorto}`
        : datos.banco_destino
          ? `Banco destino: ${datos.banco_destino}`
          : "Banco destino no detectado",
      warn: !isItau && !!datos.banco_destino,
    },
    {
      key: "cuenta",
      icon: Hash,
      ok: isCuentaCorrecta,
      label: isCuentaCorrecta
        ? `Cuenta correcta (${CUENTA_COBRO_TIENDA.cuenta})`
        : datos.cuenta_destino
          ? `Cuenta: ${datos.cuenta_destino}`
          : "Cuenta destino no detectada",
      warn: !isCuentaCorrecta && !!datos.cuenta_destino,
    },
    {
      key: "beneficiario",
      icon: User,
      ok: isBeneficiarioCorrecto,
      label: isBeneficiarioCorrecto
        ? `Beneficiario: ${datos.beneficiario}`
        : datos.beneficiario
          ? `Beneficiario: ${datos.beneficiario}`
          : "Beneficiario no detectado",
      warn: !isBeneficiarioCorrecto && !!datos.beneficiario,
    },
    {
      key: "monto",
      icon: Banknote,
      ok: montoExacto,
      label: montoExacto
        ? `Monto coincide: $${datos.monto?.toLocaleString("es-UY")}`
        : montoDiferente
          ? `Monto: $${datos.monto?.toLocaleString("es-UY")} (pedido: $${totalPedido.toLocaleString("es-UY")})`
          : "Monto no detectado",
      warn: montoDiferente,
    },
    ...(datos.fecha
      ? [
          {
            key: "fecha",
            icon: Calendar,
            ok: true,
            label: `Fecha: ${datos.fecha}`,
            warn: false,
          },
        ]
      : []),
    ...(datos.banco_origen
      ? [
          {
            key: "origen",
            icon: Landmark,
            ok: true,
            label: `Banco origen: ${datos.banco_origen}`,
            warn: false,
          },
        ]
      : []),
    ...(datos.referencia
      ? [
          {
            key: "ref",
            icon: Hash,
            ok: true,
            label: `Referencia: ${datos.referencia}`,
            warn: false,
          },
        ]
      : []),
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="mt-3 space-y-1"
    >
      <div className="flex items-center gap-1.5 mb-2">
        <ScanSearch className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          Datos extraídos automáticamente
        </span>
        <span
          className={cn(
            "ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full",
            confianza >= 0.8
              ? "bg-green-100 text-green-700"
              : confianza >= 0.6
                ? "bg-amber-100 text-amber-700"
                : "bg-red-100 text-red-600"
          )}
        >
          {Math.round(confianza * 100)}% confianza
        </span>
      </div>
      <div className="space-y-0.5">
        {indicators.map((ind) => {
          const Icon = ind.icon;
          return (
            <div
              key={ind.key}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs",
                ind.ok && "bg-green-50 text-green-700",
                ind.warn && "bg-amber-50 text-amber-700",
                !ind.ok && !ind.warn && "bg-gray-50 text-muted-foreground"
              )}
            >
              {ind.ok ? (
                <CheckCircle className="size-3.5 shrink-0" />
              ) : ind.warn ? (
                <AlertTriangle className="size-3.5 shrink-0" />
              ) : (
                <Icon className="size-3.5 shrink-0 opacity-50" />
              )}
              <span>{ind.label}</span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
