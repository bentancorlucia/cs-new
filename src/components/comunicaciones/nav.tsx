"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { FileText, History, LayoutDashboard, MailX, Megaphone, Send, Settings, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/comunicaciones", etiqueta: "Resumen", icono: LayoutDashboard, exacto: true },
  { href: "/comunicaciones/envios", etiqueta: "Envíos", icono: Send },
  { href: "/comunicaciones/historial", etiqueta: "Historial", icono: History },
  { href: "/comunicaciones/plantillas", etiqueta: "Plantillas", icono: FileText, gestion: true },
  { href: "/comunicaciones/bajas", etiqueta: "Bajas", icono: MailX, gestion: true },
  { href: "/comunicaciones/automatizaciones", etiqueta: "Automatizaciones", icono: Workflow, gestion: true },
  { href: "/comunicaciones/popups", etiqueta: "Popups", icono: Megaphone },
  { href: "/comunicaciones/configuracion", etiqueta: "Configuración", icono: Settings, config: true },
];

/** Navegación entre las pantallas de comunicaciones (según el rol). */
export function NavComunicaciones({ puedeGestionar, esTienda }: { puedeGestionar: boolean; esTienda: boolean }) {
  const pathname = usePathname();
  const tabs = TABS.filter((t) => (t.gestion ? puedeGestionar : t.config ? puedeGestionar || esTienda : true));
  const activo = (t: (typeof TABS)[number]) =>
    t.exacto ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);

  return (
    <motion.nav
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      aria-label="Comunicaciones"
      className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      <div className="inline-flex min-w-full gap-1 rounded-2xl border border-linea bg-white p-1 sm:min-w-0">
        {tabs.map((t) => {
          const on = activo(t);
          const Icono = t.icono;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "relative inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors sm:text-sm",
                on ? "text-white" : "text-muted-foreground hover:bg-superficie hover:text-foreground"
              )}
            >
              {on && (
                <motion.span
                  layoutId="tab-comunicaciones"
                  className="absolute inset-0 rounded-xl bg-bordo-800 shadow-sm"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <Icono className="relative size-4" />
              <span className="relative whitespace-nowrap">{t.etiqueta}</span>
            </Link>
          );
        })}
      </div>
    </motion.nav>
  );
}
