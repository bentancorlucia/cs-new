"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { PageTransition } from "@/components/layout/page-transition";
import { useRoles } from "@/hooks/use-roles";
import { springSmooth } from "@/lib/motion";

const STAFF_ROLES = [
  "super_admin",
  "tienda",
  "secretaria",
  "eventos",
  "scanner",
  "tesorero",
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { roles, isLoading } = useRoles();

  const isStaff = roles.some((r) => STAFF_ROLES.includes(r));

  // Loading: pantalla mínima sin sidebar ni contenido visible
  if (isLoading) {
    return (
      <div className="min-h-screen bg-fondo flex items-center justify-center">
        <Loader2 className="size-7 animate-spin text-bordo-700" />
      </div>
    );
  }

  // Socios y no-socios: layout simple sin sidebar
  if (!isStaff) {
    return (
      <div className="min-h-screen bg-fondo">
        {/* Top bar simple */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springSmooth}
          className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-linea px-4 sm:px-6 lg:px-10 xl:px-12"
        >
          <div className="mx-auto w-full max-w-[1400px] h-14 flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm font-heading text-muted-foreground hover:text-bordo-800 transition-colors"
            >
              <ArrowLeft className="size-4" />
              Volver al inicio
            </Link>
            <div className="ml-auto">
              <Link href="/">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/escudo/logo-cs.png" alt="Club Seminario" className="size-8" />
              </Link>
            </div>
          </div>
        </motion.div>

        <PageTransition>
          <main className="min-h-[calc(100vh-3.5rem)] px-4 py-6 sm:px-6 lg:px-10 lg:py-8 xl:px-12">
            <div className="mx-auto w-full max-w-[1400px]">
              {children}
            </div>
          </main>
        </PageTransition>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-fondo lg:flex">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <PageTransition>
          <main className="min-h-[calc(100vh-3.5rem)] lg:min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8 xl:px-12">
            <div className="mx-auto w-full max-w-[1400px]">
              {children}
            </div>
          </main>
        </PageTransition>
      </div>
    </div>
  );
}
