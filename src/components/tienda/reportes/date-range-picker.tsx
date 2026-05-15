"use client";

import { useState } from "react";
import { Calendar } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RangoFechas } from "@/types/reportes";

interface Props {
  value: RangoFechas;
  onChange: (rango: RangoFechas) => void;
}

type Preset = { label: string; build: () => RangoFechas };

const PRESETS: Preset[] = [
  { label: "Hoy", build: () => sameDay(new Date()) },
  { label: "Últimos 7 días", build: () => last(7) },
  { label: "Últimos 30 días", build: () => last(30) },
  { label: "Mes actual", build: () => currentMonth() },
  { label: "Mes anterior", build: () => previousMonth() },
  { label: "Año actual", build: () => currentYear() },
];

export function DateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [desde, setDesde] = useState(value.desde);
  const [hasta, setHasta] = useState(value.hasta);

  const apply = (rango: RangoFechas) => {
    setDesde(rango.desde);
    setHasta(rango.hasta);
    onChange(rango);
    setOpen(false);
  };

  const applyCustom = () => {
    if (desde && hasta && desde <= hasta) {
      onChange({ desde, hasta });
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="gap-2 font-body text-xs h-9">
            <Calendar className="h-4 w-4" />
            <span className="font-medium">{formatRange(value)}</span>
          </Button>
        }
      />
      <AnimatePresence>
        {open && (
          <PopoverContent className="w-80 p-0 overflow-hidden" sideOffset={6}>
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <div className="p-3 border-b border-border bg-muted/30">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading">
                  Rangos rápidos
                </p>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => apply(p.build())}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-background hover:bg-primary hover:text-primary-foreground transition-colors text-left font-body border border-border"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading">
                  Rango personalizado
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Desde</label>
                    <Input
                      type="date"
                      value={desde}
                      onChange={(e) => setDesde(e.target.value)}
                      className="text-xs h-8"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Hasta</label>
                    <Input
                      type="date"
                      value={hasta}
                      onChange={(e) => setHasta(e.target.value)}
                      className="text-xs h-8"
                    />
                  </div>
                </div>
                <Button
                  onClick={applyCustom}
                  size="sm"
                  className="w-full mt-2"
                  disabled={!desde || !hasta || desde > hasta}
                >
                  Aplicar
                </Button>
              </div>
            </motion.div>
          </PopoverContent>
        )}
      </AnimatePresence>
    </Popover>
  );
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sameDay(d: Date): RangoFechas {
  const s = toYmd(d);
  return { desde: s, hasta: s };
}

function last(days: number): RangoFechas {
  const hasta = new Date();
  const desde = new Date();
  desde.setDate(desde.getDate() - (days - 1));
  return { desde: toYmd(desde), hasta: toYmd(hasta) };
}

function currentMonth(): RangoFechas {
  const now = new Date();
  const desde = new Date(now.getFullYear(), now.getMonth(), 1);
  return { desde: toYmd(desde), hasta: toYmd(now) };
}

function previousMonth(): RangoFechas {
  const now = new Date();
  const desde = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const hasta = new Date(now.getFullYear(), now.getMonth(), 0);
  return { desde: toYmd(desde), hasta: toYmd(hasta) };
}

function currentYear(): RangoFechas {
  const now = new Date();
  const desde = new Date(now.getFullYear(), 0, 1);
  return { desde: toYmd(desde), hasta: toYmd(now) };
}

function formatRange(r: RangoFechas): string {
  const fmt = (s: string) => {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y.slice(2)}`;
  };
  if (r.desde === r.hasta) return fmt(r.desde);
  return `${fmt(r.desde)} → ${fmt(r.hasta)}`;
}
