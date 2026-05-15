"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { springSmooth } from "@/lib/motion";
import type { KpiComparado } from "@/types/reportes";

interface KpiCardProps {
  label: string;
  value: string;
  delta?: KpiComparado | null;
  hint?: string;
  index?: number;
  tone?: "default" | "positive" | "negative" | "warning";
}

export function KpiCard({ label, value, delta, hint, index = 0, tone = "default" }: KpiCardProps) {
  const dir =
    delta == null
      ? null
      : delta.variacionPct == null
      ? null
      : delta.variacionPct > 0.5
      ? "up"
      : delta.variacionPct < -0.5
      ? "down"
      : "flat";

  const toneClass =
    tone === "positive"
      ? "border-emerald-200 dark:border-emerald-900/40"
      : tone === "negative"
      ? "border-rose-200 dark:border-rose-900/40"
      : tone === "warning"
      ? "border-amber-300 dark:border-amber-900/40"
      : "border-border";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springSmooth, delay: index * 0.04 }}
      className={`rounded-2xl border ${toneClass} bg-card p-4 sm:p-5 flex flex-col gap-1 hover:shadow-sm transition-shadow`}
    >
      <p className="text-[10px] uppercase tracking-wider font-heading text-muted-foreground">
        {label}
      </p>
      <p className="text-xl sm:text-2xl font-display tracking-tight text-foreground">
        {value}
      </p>
      {(delta || hint) && (
        <div className="mt-1 flex items-center gap-2 text-[11px] font-body">
          {delta && dir && (
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md ${
                dir === "up"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : dir === "down"
                  ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {dir === "up" ? (
                <TrendingUp className="h-3 w-3" />
              ) : dir === "down" ? (
                <TrendingDown className="h-3 w-3" />
              ) : (
                <Minus className="h-3 w-3" />
              )}
              {delta.variacionPct == null
                ? "—"
                : `${delta.variacionPct > 0 ? "+" : ""}${delta.variacionPct.toFixed(1)}%`}
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      )}
    </motion.div>
  );
}
