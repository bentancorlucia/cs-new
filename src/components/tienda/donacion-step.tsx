"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { springSmooth } from "@/lib/motion";

export interface DonacionConfig {
  activo: boolean;
  monto_1: number;
  monto_2: number;
  monto_3: number;
  permitir_monto_custom: boolean;
  monto_custom_max: number;
  titulo: string;
  descripcion: string;
}

interface DonacionStepProps {
  config: DonacionConfig;
  value: number;
  onChange: (value: number) => void;
}

export function DonacionStep({ config, value, onChange }: DonacionStepProps) {
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState<string>("");

  const montosFijos = [config.monto_1, config.monto_2, config.monto_3];

  function selectMonto(monto: number) {
    setCustomMode(false);
    setCustomValue("");
    onChange(value === monto ? 0 : monto);
  }

  function activateCustom() {
    setCustomMode(true);
    onChange(0);
  }

  function handleCustomInput(raw: string) {
    const onlyDigits = raw.replace(/\D/g, "");
    setCustomValue(onlyDigits);
    const parsed = Number(onlyDigits);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= config.monto_custom_max) {
      onChange(parsed);
    } else {
      onChange(0);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSmooth}
      className="px-4 sm:px-0 py-5"
    >
      <div className="relative overflow-hidden border-2 border-bordo-800 bg-gradient-to-br from-bordo-800 via-bordo-900 to-bordo-950 p-5 sm:p-6 text-white">
        {/* Decorative dorado glow */}
        <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-dorado-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 size-48 rounded-full bg-dorado-300/10 blur-3xl" />

        {/* Top accent line */}
        <div className="absolute left-0 right-0 top-0 h-1 bg-gradient-to-r from-dorado-300 via-dorado-400 to-dorado-300" />

        <div className="relative">
          {/* Header */}
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center bg-dorado-300 shadow-lg shadow-dorado-300/30">
              <motion.div
                animate={{ scale: [1, 1.18, 1, 1.12, 1] }}
                transition={{
                  duration: 1.4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  times: [0, 0.18, 0.4, 0.55, 1],
                }}
              >
                <Heart className="size-5 fill-bordo-900 text-bordo-900" strokeWidth={2.5} />
              </motion.div>
            </div>
            <div className="min-w-0">
              <span className="font-heading text-[10px] font-bold uppercase tracking-editorial text-dorado-300">
                Sumá una donación
              </span>
              <h3 className="font-display text-base sm:text-lg uppercase tracking-tightest text-white leading-tight">
                {config.titulo}
              </h3>
            </div>
          </div>

          <p className="mb-5 text-xs leading-relaxed text-white/70">
            {config.descripcion}
          </p>

          {/* Montos fijos */}
          <div className="grid grid-cols-3 gap-2">
            {montosFijos.map((monto) => {
              const selected = !customMode && value === monto;
              return (
                <motion.button
                  type="button"
                  key={monto}
                  whileTap={{ scale: 0.96 }}
                  whileHover={{ y: -2 }}
                  onClick={() => selectMonto(monto)}
                  className={cn(
                    "relative border-2 py-3 font-display text-base uppercase tracking-tightest transition-colors",
                    selected
                      ? "border-dorado-300 bg-dorado-300 text-bordo-950 shadow-lg shadow-dorado-300/40"
                      : "border-white/20 bg-white/5 text-white hover:border-dorado-300/60 hover:bg-white/10"
                  )}
                >
                  ${monto.toLocaleString("es-UY")}
                  {selected && (
                    <motion.span
                      layoutId="donacion-selected"
                      className="absolute inset-0 border-2 border-dorado-300"
                      transition={springSmooth}
                    />
                  )}
                </motion.button>
              );
            })}
          </div>

          {config.permitir_monto_custom && (
            <div className="mt-2">
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={activateCustom}
                className={cn(
                  "w-full border-2 py-2.5 font-heading text-[11px] uppercase tracking-editorial transition-colors",
                  customMode
                    ? "border-dorado-300 bg-dorado-300/15 text-dorado-300"
                    : "border-white/15 bg-white/5 text-white/70 hover:border-dorado-300/50 hover:text-dorado-300"
                )}
              >
                Otro monto
              </motion.button>

              <AnimatePresence>
                {customMode && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2 overflow-hidden"
                  >
                    <div className="flex items-center gap-2 border-2 border-dorado-300/40 bg-white/5 px-3 py-2.5 focus-within:border-dorado-300">
                      <span className="font-display text-base text-dorado-300">$</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoFocus
                        placeholder="Ingresá un monto"
                        value={customValue}
                        onChange={(e) => handleCustomInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (
                            ["e", "E", "+", "-", ".", ","].includes(e.key)
                          ) {
                            e.preventDefault();
                          }
                        }}
                        onPaste={(e) => {
                          const text = e.clipboardData.getData("text");
                          if (!/^\d+$/.test(text)) e.preventDefault();
                        }}
                        className="flex-1 bg-transparent font-display text-base tracking-tight text-white outline-none placeholder:text-white/30"
                      />
                    </div>
                    <p className="mt-1.5 font-heading text-[10px] uppercase tracking-editorial text-white/40">
                      Máximo ${config.monto_custom_max.toLocaleString("es-UY")}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <AnimatePresence>
            {value > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={springSmooth}
                className="mt-3 flex items-center justify-between bg-dorado-300 border border-dorado-300 px-3 py-2.5"
              >
                <span className="font-heading text-[11px] font-bold uppercase tracking-editorial text-bordo-950">
                  ¡Gracias por tu donación!
                </span>
                <span className="font-display text-base font-medium text-bordo-950">
                  ${value.toLocaleString("es-UY")}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
