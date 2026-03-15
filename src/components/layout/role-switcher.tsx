"use client";

import { motion } from "framer-motion";
import type { LucideProps } from "lucide-react";
import {
  Shield,
  Store,
  Users,
  Calendar,
  QrCode,
} from "lucide-react";
import { useRoles } from "@/hooks/use-roles";
import { springBouncy } from "@/lib/motion";

const PANEL_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<LucideProps>; href: string }
> = {
  super_admin: { label: "Admin", icon: Shield, href: "/admin" },
  tienda: { label: "Tienda", icon: Store, href: "/admin/productos" },
  secretaria: { label: "Secretaría", icon: Users, href: "/secretaria/socios" },
  eventos: { label: "Eventos", icon: Calendar, href: "/eventos" },
  scanner: { label: "Scanner", icon: QrCode, href: "/eventos/scanner" },
};

export function RoleSwitcher() {
  const { roles, activeRole, setActiveRole } = useRoles();
  const dashboardRoles = roles.filter((r) => r in PANEL_CONFIG);

  if (dashboardRoles.length <= 1) return null;

  return (
    <div className="flex gap-1 p-1 bg-superficie rounded-xl">
      {dashboardRoles.map((rol) => {
        const config = PANEL_CONFIG[rol];
        if (!config) return null;
        const Icon = config.icon;
        const isActive = activeRole === rol;

        return (
          <button
            key={rol}
            onClick={() => setActiveRole(rol)}
            className={`
              relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-heading uppercase tracking-editorial
              transition-colors duration-200
              ${isActive ? "text-bordo-800" : "text-muted-foreground hover:text-foreground"}
            `}
          >
            {isActive && (
              <motion.div
                layoutId="role-switcher-active"
                className="absolute inset-0 bg-white rounded-lg shadow-card"
                transition={springBouncy}
              />
            )}
            <span className="relative flex items-center gap-2">
              <Icon className="size-3.5" strokeWidth={1.5} />
              {config.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
