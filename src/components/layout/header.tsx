"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import {
  Menu,
  X,
  ChevronDown,
  ShoppingBag,
  LogIn,
  User,
  LogOut,
} from "lucide-react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { createBrowserClient } from "@/lib/supabase/client";
import { useCart } from "@/hooks/use-cart";
import { springBouncy, springSmooth } from "@/lib/motion";

const CLUB_LINKS = [
  { href: "/club/quienes-somos", label: "Quiénes Somos" },
  { href: "/club/directiva", label: "Directiva" },
  { href: "/club/instalaciones", label: "Instalaciones" },
  { href: "/club/estatuto", label: "Estatuto" },
  { href: "/club/reglamento", label: "Reglamento" },
  { href: "/club/memorias", label: "Memorias" },
];

const DEPORTES_LINKS = [
  { href: "/deportes/basquetbol", label: "Básquetbol" },
  { href: "/deportes/corredores", label: "Corredores" },
  { href: "/deportes/handball", label: "Handball" },
  { href: "/deportes/hockey", label: "Hockey" },
  { href: "/deportes/futbol", label: "Fútbol" },
  { href: "/deportes/rugby", label: "Rugby" },
  { href: "/deportes/voley", label: "Vóleibol" },
];

const DIRECT_LINKS = [
  { href: "/socios", label: "Socios" },
  { href: "/beneficios", label: "Beneficios" },
  { href: "/tienda", label: "Tienda" },
  // { href: "/eventos", label: "Eventos" },
];

function NavDropdown({
  label,
  links,
  pathname,
}: {
  label: string;
  links: { href: string; label: string }[];
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isActive = links.some((l) => pathname.startsWith(l.href));

  const handleEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        className={`
          flex items-center gap-1 font-heading uppercase tracking-editorial text-xs
          transition-colors duration-200
          ${isActive ? "text-dorado-300" : "text-white/80 hover:text-dorado-300"}
        `}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {label}
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="size-3" />
        </motion.span>
      </button>

      {/* Active indicator */}
      {isActive && (
        <motion.div
          layoutId="nav-active-indicator"
          className="absolute -bottom-2 left-0 right-0 h-0.5 bg-dorado-300 rounded-full"
          transition={springBouncy}
        />
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-full left-0 mt-3 min-w-[180px] rounded-xl bg-bordo-800/70 backdrop-blur-xl p-2 shadow-elevated ring-1 ring-white/10 z-50"
          >
            {links.map((link, i) => (
              <motion.div
                key={link.href}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03, duration: 0.2 }}
              >
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`
                    block rounded-lg px-3 py-2 text-sm font-body transition-colors duration-150
                    ${
                      pathname === link.href
                        ? "bg-white/15 text-dorado-300 font-medium"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    }
                  `}
                >
                  {link.label}
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavLink({
  href,
  label,
  pathname,
}: {
  href: string;
  label: string;
  pathname: string;
}) {
  const isActive = pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="relative">
      <Link
        href={href}
        className={`
          font-heading uppercase tracking-editorial text-xs transition-colors duration-200
          ${isActive ? "text-dorado-300" : "text-white/80 hover:text-dorado-300"}
        `}
      >
        {label}
      </Link>
      {isActive && (
        <motion.div
          layoutId="nav-active-indicator"
          className="absolute -bottom-2 left-0 right-0 h-0.5 bg-dorado-300 rounded-full"
          transition={springBouncy}
        />
      )}
    </div>
  );
}

function MobileNav({
  pathname,
  user,
  onLogout,
}: {
  pathname: string;
  user: { email?: string } | null;
  onLogout: () => void;
}) {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { itemCount } = useCart();

  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger id="mobile-nav-trigger" className="md:hidden p-2 -ml-2">
        <Menu className="size-6 text-white" />
        <span className="sr-only">Menú</span>
      </SheetTrigger>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-full max-w-none sm:max-w-none border-none p-0 overflow-y-auto"
        style={{
          backgroundColor: "rgba(115, 13, 50, 0.85)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
        {/* Close button */}
        <div className="sticky top-0 z-10 flex justify-end p-4">
          <button onClick={() => setOpen(false)} className="p-2 text-white/60 hover:text-white transition-colors">
            <X className="size-6" />
          </button>
        </div>

        <nav className="flex flex-col px-6 pb-8 gap-1">
          {/* Club Accordion */}
          <button
            onClick={() => toggleSection("club")}
            className="flex items-center justify-between py-3 font-display text-title-3 uppercase text-white/90 hover:text-dorado-300 transition-colors"
          >
            Club
            <motion.span
              animate={{ rotate: openSection === "club" ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="size-5 text-white/40" />
            </motion.span>
          </button>
          <AnimatePresence>
            {openSection === "club" && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="pl-4 pb-2 flex flex-col gap-1">
                  {CLUB_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className={`py-2 text-base font-body transition-colors ${
                        pathname === link.href
                          ? "text-dorado-300"
                          : "text-white/50 hover:text-white/80"
                      }`}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Deportes Accordion */}
          <button
            onClick={() => toggleSection("deportes")}
            className="flex items-center justify-between py-3 font-display text-title-3 uppercase text-white/90 hover:text-dorado-300 transition-colors"
          >
            Deportes
            <motion.span
              animate={{ rotate: openSection === "deportes" ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="size-5 text-white/40" />
            </motion.span>
          </button>
          <AnimatePresence>
            {openSection === "deportes" && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="pl-4 pb-2 flex flex-col gap-1">
                  {DEPORTES_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className={`py-2 text-base font-body transition-colors ${
                        pathname === link.href
                          ? "text-dorado-300"
                          : "text-white/50 hover:text-white/80"
                      }`}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Direct links */}
          {DIRECT_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={`py-3 font-display text-title-3 uppercase transition-colors ${
                pathname.startsWith(link.href)
                  ? "text-dorado-300"
                  : "text-white/90 hover:text-dorado-300"
              }`}
            >
              {link.label}
            </Link>
          ))}

          {/* Divider */}
          <div className="my-4 h-px bg-bordo-800/30" />

          {/* Auth */}
          {user ? (
            <>
              <Link
                href="/mi-cuenta"
                onClick={() => setOpen(false)}
                className="py-3 font-body text-base text-white/60 hover:text-white transition-colors flex items-center gap-3"
              >
                <User className="size-5" />
                Mi cuenta
              </Link>
              <Link
                href="/tienda/carrito"
                onClick={() => setOpen(false)}
                className="py-3 font-body text-base text-white/60 hover:text-white transition-colors flex items-center gap-3"
              >
                <ShoppingBag className="size-5" />
                Mi carrito
                {itemCount > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center size-6 rounded-full bg-dorado-300 text-bordo-950 text-xs font-bold">
                    {itemCount}
                  </span>
                )}
              </Link>
              <button
                onClick={() => {
                  onLogout();
                  setOpen(false);
                }}
                className="py-3 font-body text-base text-white/40 hover:text-white/60 transition-colors flex items-center gap-3 text-left"
              >
                <LogOut className="size-5" />
                Cerrar sesión
              </button>
            </>
          ) : (
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="py-3 font-display text-title-3 uppercase text-dorado-300 hover:text-dorado-200 transition-colors"
            >
              Ingresar
            </Link>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function Header() {
  const pathname = usePathname();
  const { scrollY } = useScroll();
  const [user, setUser] = useState<{ email?: string; initials?: string; avatar_url?: string | null } | null>(null);

  // Solid navbar on product detail pages, cart, and eventos; transparent elsewhere
  const isSolidNav =
    pathname.startsWith("/eventos") ||
    pathname === "/tienda/carrito" ||
    (pathname.startsWith("/tienda/") && pathname !== "/tienda");
  const isTransparentHero = !isSolidNav;

  // Scroll-driven transforms
  const navPaddingY = useTransform(
    scrollY,
    [0, 100],
    isTransparentHero ? ["1.25rem", "0.75rem"] : ["0.75rem", "0.75rem"]
  );
  const headerBg = useTransform(
    scrollY,
    [0, 80],
    isTransparentHero
      ? ["rgba(115, 13, 50, 0)", "rgba(115, 13, 50, 0.85)"]
      : ["rgba(115, 13, 50, 0.85)", "rgba(115, 13, 50, 0.85)"]
  );
  const backdropBlur = useTransform(
    scrollY,
    [0, 80],
    isTransparentHero
      ? ["blur(0px)", "blur(16px)"]
      : ["blur(16px)", "blur(16px)"]
  );
  const headerShadow = useTransform(
    scrollY,
    [0, 80],
    isTransparentHero
      ? ["0 0 0 0 rgba(0,0,0,0)", "0 4px 30px rgba(74,8,32,0.3)"]
      : ["0 4px 30px rgba(74,8,32,0.3)", "0 4px 30px rgba(74,8,32,0.3)"]
  );
  const headerBorder = useTransform(
    scrollY,
    [0, 80],
    isTransparentHero
      ? ["1px solid rgba(255,255,255,0)", "1px solid rgba(255,255,255,0.1)"]
      : ["1px solid rgba(255,255,255,0.1)", "1px solid rgba(255,255,255,0.1)"]
  );

  useEffect(() => {
    const supabase = createBrowserClient();

    async function loadUser() {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;

      const { data: perfil } = await supabase
        .from("perfiles")
        .select("nombre, apellido, avatar_url")
        .eq("id", u.id)
        .single();

      const initials = perfil
        ? `${perfil.nombre?.charAt(0) ?? ""}${perfil.apellido?.charAt(0) ?? ""}`.toUpperCase()
        : u.email?.charAt(0).toUpperCase() ?? "U";

      setUser({
        email: u.email ?? undefined,
        initials,
        avatar_url: perfil?.avatar_url,
      });
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadUser();
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <motion.header
      style={{
        paddingTop: navPaddingY,
        paddingBottom: navPaddingY,
        backgroundColor: headerBg,
        backdropFilter: backdropBlur,
        WebkitBackdropFilter: backdropBlur,
        boxShadow: headerShadow,
        borderBottom: headerBorder,
      }}
      className="fixed top-0 left-0 right-0 z-50"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Mobile menu */}
        <MobileNav pathname={pathname} user={user} onLogout={handleLogout} />

        {/* Logo */}
        <motion.div
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.99 }}
          transition={springBouncy}
        >
          <Link href="/" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/escudo/logo-cs.png"
              alt="Escudo Club Seminario"
              width={40}
              height={40}
              className="size-10"
            />
            <div className="hidden md:flex flex-col">
              <span className="font-display text-xl font-bold uppercase tracking-tightest text-dorado-300 leading-tight">
                Club Seminario
              </span>
              <span className="font-heading text-[10px] uppercase tracking-[0.25em] text-dorado-400/70 leading-none">
                Desde 2010
              </span>
            </div>
          </Link>
        </motion.div>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-baseline gap-6 lg:gap-8" aria-label="Navegación principal">
          <NavDropdown
            label="Club"
            links={CLUB_LINKS}
            pathname={pathname}
          />
          <NavDropdown
            label="Deportes"
            links={DEPORTES_LINKS}
            pathname={pathname}
          />
          {DIRECT_LINKS.map((link) => (
            <NavLink
              key={link.href}
              href={link.href}
              label={link.label}
              pathname={pathname}
            />
          ))}
        </nav>

        {/* Right section */}
        <div className="flex items-center gap-3">
          {/* Cart — hidden on mobile when logged in so the logo stays centered */}
          <Link href="/tienda/carrito" className={`relative p-2 ${user ? "hidden md:block" : ""}`} aria-label="Carrito de compras">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={springBouncy}
            >
              <ShoppingBag className="size-5 text-white/70 hover:text-dorado-300 transition-colors" />
            </motion.div>
          </Link>

          {/* Auth */}
          {user ? (
            <Link href="/mi-cuenta">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={springBouncy}
                className="size-8 rounded-full bg-dorado-400 flex items-center justify-center text-bordo-950 text-xs font-heading uppercase font-bold overflow-hidden"
              >
                {user.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatar_url} alt="" className="size-full object-cover" />
                ) : (
                  user.initials ?? user.email?.charAt(0).toUpperCase() ?? "U"
                )}
              </motion.div>
            </Link>
          ) : (
            <Link href="/login" className="hidden md:block">
              <motion.span
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={springBouncy}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/40 px-4 py-1.5 text-xs font-heading uppercase tracking-editorial text-white hover:bg-white hover:text-bordo-800 transition-colors duration-200"
              >
                <LogIn className="size-3.5" />
                Ingresar
              </motion.span>
            </Link>
          )}
        </div>
      </div>
    </motion.header>
  );
}
