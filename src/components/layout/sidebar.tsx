"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { LucideProps } from "lucide-react";
import {
  Package,
  ClipboardList,
  BarChart3,
  MonitorSmartphone,
  Truck,
  Tag,
  Calendar,
  Ticket,
  QrCode,
  Plus,
  Users,
  Dumbbell,
  UserCircle,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ShoppingCart,
  ShieldCheck,
  LayoutDashboard,
  Wallet,
  ArrowRightLeft,
  FolderTree,
  Receipt,
  Landmark,
  Archive,
  Target,
  GitCompareArrows,
  Lock,
  FileText,
} from "lucide-react";
import { useRoles } from "@/hooks/use-roles";
import { RoleSwitcher } from "@/components/layout/role-switcher";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { springBouncy, springSmooth } from "@/lib/motion";
import { createBrowserClient } from "@/lib/supabase/client";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<LucideProps>;
  exact?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
  requiredRoles: string[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Tienda",
    requiredRoles: ["super_admin", "tienda"],
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/admin/productos", label: "Productos", icon: Package },
      { href: "/admin/categorias", label: "Categorías", icon: Tag },
      { href: "/admin/pedidos", label: "Pedidos", icon: ClipboardList },
      { href: "/admin/stock", label: "Stock", icon: BarChart3 },
      { href: "/admin/pos", label: "POS", icon: MonitorSmartphone },
      { href: "/admin/proveedores", label: "Proveedores", icon: Truck },
      { href: "/admin/compras", label: "Compras", icon: ShoppingCart },
      { href: "/admin/movimientos", label: "Movimientos", icon: Receipt },
      { href: "/admin/conciliacion", label: "Conciliación", icon: GitCompareArrows },
    ],
  },
  {
    title: "Eventos",
    requiredRoles: ["super_admin", "eventos", "scanner"],
    items: [
      { href: "/eventos/admin", label: "Eventos", icon: Calendar },
      { href: "/eventos/crear", label: "Crear evento", icon: Plus },
      { href: "/eventos/scanner", label: "Scanner", icon: QrCode },
    ],
  },
  {
    title: "Secretaría",
    requiredRoles: ["super_admin", "secretaria"],
    items: [
      { href: "/secretaria/socios", label: "Socios", icon: Users },
      { href: "/secretaria/disciplinas", label: "Disciplinas", icon: Dumbbell },
    ],
  },
  {
    title: "Tesorería",
    requiredRoles: ["super_admin", "tesorero"],
    items: [
      { href: "/tesoreria", label: "Dashboard", icon: Wallet },
      { href: "/tesoreria/cuentas", label: "Cuentas", icon: Landmark },
      { href: "/tesoreria/movimientos", label: "Movimientos", icon: Receipt },
      { href: "/tesoreria/categorias", label: "Categorías", icon: FolderTree },
      { href: "/tesoreria/transferencias", label: "Transferencias", icon: ArrowRightLeft },
      { href: "/tesoreria/caja-chica", label: "Caja Chica", icon: Archive },
      { href: "/tesoreria/flujo-presupuesto", label: "Flujo y Presupuesto", icon: Target },
      { href: "/tesoreria/conciliacion", label: "Conciliación", icon: GitCompareArrows },
      { href: "/tesoreria/cierres", label: "Cierres", icon: Lock },
      { href: "/tesoreria/reportes", label: "Reportes", icon: FileText },
    ],
  },
  {
    title: "Administración",
    requiredRoles: ["super_admin"],
    items: [
      { href: "/admin/roles", label: "Roles", icon: ShieldCheck },
    ],
  },
];

const BOTTOM_ITEMS: NavItem[] = [
  { href: "/mi-cuenta", label: "Mi cuenta", icon: UserCircle },
];

/** Find the label of the current active page for the mobile top bar */
function getActivePageLabel(pathname: string): string {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      const match = item.exact
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(item.href + "/");
      if (match) return item.label;
    }
  }
  for (const item of BOTTOM_ITEMS) {
    if (pathname === item.href || pathname.startsWith(item.href + "/")) {
      return item.label;
    }
  }
  return "Panel";
}

function SidebarNavItem({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const isActive = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + "/");
  const Icon = item.icon;

  return (
    <motion.div
      className="relative"
      whileHover={{ x: collapsed ? 0 : 4 }}
      transition={springBouncy}
    >
      {isActive && (
        <motion.div
          layoutId="sidebar-active-indicator"
          className="absolute left-0 top-1 bottom-1 w-0.5 bg-bordo-800 rounded-full"
          transition={springSmooth}
        />
      )}
      <Link
        href={item.href}
        onClick={onNavigate}
        className={`
          flex items-center gap-3 rounded-lg px-3 py-2.5 lg:py-2 text-sm font-body font-medium transition-colors duration-150
          ${collapsed ? "justify-center px-2" : ""}
          ${
            isActive
              ? "bg-bordo-50 text-bordo-800"
              : "text-muted-foreground hover:bg-superficie hover:text-foreground"
          }
        `}
        title={collapsed ? item.label : undefined}
      >
        <Icon className="size-[18px] shrink-0" strokeWidth={1.5} />
        {!collapsed && <span>{item.label}</span>}
      </Link>
    </motion.div>
  );
}

function SidebarContent({
  pathname,
  collapsed,
  onLogout,
  onNavigate,
}: {
  pathname: string;
  collapsed: boolean;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  const { hasAnyRole } = useRoles();

  const visibleSections = NAV_SECTIONS.filter((section) =>
    hasAnyRole(section.requiredRoles)
  );

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`px-4 py-5 ${collapsed ? "text-center" : ""}`}>
        <Link href="/" onClick={onNavigate} className="inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/escudo/logo-cs.png" alt="Club Seminario" className={collapsed ? "size-8 mx-auto" : "size-9"} />
        </Link>
      </div>

      {/* Role Switcher */}
      {!collapsed && (
        <div className="px-3 mb-4">
          <RoleSwitcher />
        </div>
      )}

      {/* Navigation sections */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-6">
        <AnimatePresence mode="wait">
          {visibleSections.map((section) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {!collapsed && (
                <h3 className="font-heading uppercase tracking-editorial text-xs text-muted-foreground mb-2 px-3">
                  {section.title}
                </h3>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <SidebarNavItem
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </nav>

      {/* Bottom section */}
      <div className="mt-auto border-t border-linea px-3 py-3 space-y-0.5">
        {BOTTOM_ITEMS.map((item) => (
          <SidebarNavItem
            key={item.href}
            item={item}
            pathname={pathname}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
        <button
          onClick={onLogout}
          className={`
            flex items-center gap-3 rounded-lg px-3 py-2.5 lg:py-2 text-sm font-body font-medium w-full
            text-muted-foreground hover:bg-superficie hover:text-foreground transition-colors duration-150
            ${collapsed ? "justify-center px-2" : ""}
          `}
          title={collapsed ? "Cerrar sesión" : undefined}
        >
          <LogOut className="size-[18px] shrink-0" strokeWidth={1.5} />
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sheet on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const closeMobile = () => setMobileOpen(false);

  const pageLabel = getActivePageLabel(pathname);

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center gap-3 bg-white/95 backdrop-blur-sm border-b border-linea px-4 h-14">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-2 rounded-lg hover:bg-superficie transition-colors"
        >
          <Menu className="size-5 text-foreground" />
          <span className="sr-only">Menú</span>
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/escudo/logo-cs.png" alt="Club Seminario" className="size-7" />
          </Link>
          <span className="text-linea select-none">/</span>
          <span className="font-heading text-sm text-muted-foreground truncate">
            {pageLabel}
          </span>
        </div>
      </div>
      {/* Spacer for fixed mobile bar */}
      <div className="lg:hidden h-14 shrink-0" />

      {/* Mobile Sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[85vw] max-w-xs p-0 border-none"
        >
          <SheetTitle className="sr-only">Panel de navegación</SheetTitle>
          <div className="flex justify-end p-2">
            <button
              onClick={closeMobile}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>
          <SidebarContent
            pathname={pathname}
            collapsed={false}
            onLogout={handleLogout}
            onNavigate={closeMobile}
          />
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 72 : 260 }}
        transition={springSmooth}
        className="hidden lg:flex flex-col h-screen bg-white sticky top-0 shadow-[inset_-1px_0_0_0_rgba(26,26,26,0.06)]"
      >
        <SidebarContent
          pathname={pathname}
          collapsed={collapsed}
          onLogout={handleLogout}
        />

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-7 size-6 rounded-full bg-white border border-linea shadow-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <motion.div
            animate={{ rotate: collapsed ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronLeft className="size-3.5" />
          </motion.div>
        </button>
      </motion.aside>
    </>
  );
}
