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
    setCustomValue(raw);
    const parsed = Number(raw.replace(/[^\d]/g, ""));
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
      className="border-b border-bordo-800/8 px-4 sm:px-0 py-5"
    >
      <h2 className="mb-3 flex items-center gap-2 font-heading text-[10px] font-bold uppercase tracking-editorial text-bordo-800/50">
        <Heart className="size-3.5 text-bordo-800" />
        Sumá una donación · {config.titulo}
      </h2>

      <p className="mb-4 text-xs leading-relaxed text-bordo-800/60">
        {config.descripcion}
      </p>

      <div className="grid grid-cols-3 gap-2">
        {montosFijos.map((monto) => {
          const selected = !customMode && value === monto;
          return (
            <motion.button
              type="button"
              key={monto}
              whileTap={{ scale: 0.97 }}
              onClick={() => selectMonto(monto)}
              className={cn(
                "border-2 py-3 font-display text-base uppercase tracking-tightest transition-colors",
                selected
                  ? "border-bordo-800 bg-bordo-800 text-white"
                  : "border-bordo-800/15 bg-white text-bordo-950 hover:border-bordo-800/40"
              )}
            >
              ${monto.toLocaleString("es-UY")}
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
                ? "border-bordo-800 bg-bordo-800/5 text-bordo-800"
                : "border-bordo-800/15 bg-white text-bordo-800 hover:border-bordo-800/40"
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
                <div className="flex items-center gap-2 border-2 border-bordo-800/15 bg-white px-3 py-2.5 focus-within:border-bordo-800">
                  <span className="font-display text-base text-bordo-800/40">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    placeholder="Ingresá un monto"
                    value={customValue}
                    onChange={(e) => handleCustomInput(e.target.value)}
                    className="flex-1 bg-transparent font-display text-base tracking-tight text-bordo-950 outline-none placeholder:text-bordo-800/30"
                  />
                </div>
                <p className="mt-1.5 font-heading text-[10px] uppercase tracking-editorial text-bordo-800/40">
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
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-3 flex items-center justify-between bg-dorado-300/15 border border-dorado-300/40 px-3 py-2"
          >
            <span className="font-heading text-[11px] uppercase tracking-editorial text-bordo-800">
              Donación seleccionada
            </span>
            <span className="font-display text-base font-medium text-bordo-950">
              ${value.toLocaleString("es-UY")}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
