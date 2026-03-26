"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Mail, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fadeInUp, staggerContainer, easeSmooth } from "@/lib/motion";
import { useDocumentTitle } from "@/hooks/use-document-title";

export default function ConfirmarEmailPage() {
  useDocumentTitle("Confirmar Email");
  return (
    <Suspense>
      <ConfirmarEmailContent />
    </Suspense>
  );
}

function ConfirmarEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Cooldown timer
  useState(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(timer);
  });

  async function handleResend() {
    if (!email || cooldown > 0) return;

    setIsResending(true);
    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Email reenviado. Revisá tu bandeja de entrada.");
      setCooldown(60);
    } catch {
      toast.error("Error al reenviar el email");
    } finally {
      setIsResending(false);
    }
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="w-full max-w-md px-4"
    >
      <motion.div variants={fadeInUp} transition={easeSmooth}>
        <div className="mb-8 text-center">
          <div className="lg:hidden mb-6">
            <h1 className="font-display text-4xl font-bold text-bordo-800 tracking-tightest">
              Club <span className="text-dorado-400">Seminario</span>
            </h1>
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeInUp} transition={easeSmooth}>
        <Card className="border-bordo-100/50 shadow-card">
          <CardHeader className="text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 25, delay: 0.2 }}
              className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-dorado-100"
            >
              <Mail className="size-8 text-dorado-600" />
            </motion.div>
            <CardTitle className="text-lg font-heading text-bordo-800">
              Revisá tu email
            </CardTitle>
            <CardDescription>
              Te enviamos un link de confirmación
              {email && (
                <>
                  {" "}a <span className="font-medium text-bordo-700">{email}</span>
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground space-y-2">
              <p>Hacé click en el link del email para activar tu cuenta.</p>
              <p>Si no lo encontrás, revisá la carpeta de spam.</p>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={handleResend}
              disabled={isResending || !email || cooldown > 0}
            >
              {isResending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {isResending ? "Reenviando..." : cooldown > 0 ? `Reenviar en ${cooldown}s` : "Reenviar email"}
            </Button>

            <div className="text-center">
              <Link
                href="/login"
                className="text-sm font-medium text-dorado-500 hover:text-dorado-600 underline-offset-4 hover:underline transition-colors"
              >
                Volver a iniciar sesión
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
