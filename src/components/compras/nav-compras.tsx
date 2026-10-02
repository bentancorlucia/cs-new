"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { CalendarClock, FileText, HandCoins, PackageCheck, ShoppingCart, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/proveedores", etiqueta: "Proveedores", icono: Truck },
  { href: "/admin/compras", etiqueta: "Órdenes de compra", icono: ShoppingCart, exacto: true, tambien: "/admin/compras/ordenes" },
  { href: "/admin/compras/recepciones", etiqueta: "Recepciones", icono: PackageCheck },
  { href: "/admin/compras/documentos", etiqueta: "Facturas y notas", icono: FileText },
  { href: "/admin/compras/pagos", etiqueta: "Órdenes de pago", icono: HandCoins },
  { href: "/admin/compras/vencimientos", etiqueta: "Vencimientos", icono: CalendarClock },
];

/** Navegación entre las pantallas de proveedores y compras. */
export function NavCompras() {
  const pathname = usePathname();
  const activo = (t: (typeof TABS)[number]) =>
    t.exacto
      ? pathname === t.href || (t.tambien ? pathname.startsWith(t.tambien) : false)
      : pathname === t.href || pathname.startsWith(`${t.href}/`);

  return (
    <motion.nav
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      aria-label="Proveedores y compras"
      className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      <div className="inline-flex min-w-full gap-1 rounded-2xl border border-linea bg-white p-1 sm:min-w-0">
        {TABS.map((t) => {
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
                  layoutId="tab-compras"
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
