"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { KeyRound, Loader2, ArrowLeft } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { toast } from "sonner";

import { createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fadeInUp, staggerContainer, easeSmooth } from "@/lib/motion";
import { useDocumentTitle } from "@/hooks/use-document-title";

const recuperarSchema = z.object({
  email: z.email("Ingresá un email válido"),
});

type RecuperarForm = z.infer<typeof recuperarSchema>;

export default function RecuperarPage() {
  useDocumentTitle("Recuperar Contraseña");
  const [isLoading, setIsLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RecuperarForm>({
    resolver: zodResolver(recuperarSchema),
  });

  async function onSubmit(data: RecuperarForm) {
    setIsLoading(true);
    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/cambiar-password`,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      setEnviado(true);
    } catch {
      toast.error("Error al enviar el email");
    } finally {
      setIsLoading(false);
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
          <CardHeader>
            <CardTitle className="text-lg font-heading text-bordo-800">
              Recuperar contraseña
            </CardTitle>
            <CardDescription>
              {enviado
                ? "Revisá tu email para continuar"
                : "Ingresá tu email y te enviaremos instrucciones"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {enviado ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={easeSmooth}
                className="space-y-4"
              >
                <div className="flex justify-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className="flex size-16 items-center justify-center rounded-full bg-dorado-100"
                  >
                    <KeyRound className="size-8 text-dorado-600" />
                  </motion.div>
                </div>
                <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground space-y-2">
                  <p>Si el email existe en nuestro sistema, recibirás instrucciones para restablecer tu contraseña.</p>
                  <p>Revisá también la carpeta de spam.</p>
                </div>
                <Link href="/login">
                  <Button variant="outline" className="w-full">
                    <ArrowLeft className="size-4" />
                    Volver al login
                  </Button>
                </Link>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="tu@email.com"
                    autoComplete="email"
                    className="focus-visible:ring-bordo-700/30 focus-visible:border-bordo-300"
                    aria-invalid={!!errors.email}
                    {...register("email")}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-bordo-800 to-bordo-700 hover:from-bordo-900 hover:to-bordo-800 text-white shadow-md hover:shadow-lg transition-all duration-300"
                  size="lg"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <KeyRound className="size-4" />
                  )}
                  {isLoading ? "Enviando..." : "Enviar instrucciones"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        variants={fadeInUp}
        transition={easeSmooth}
        className="mt-6 flex items-center gap-3 justify-center"
      >
        <div className="h-px w-16 bg-gradient-to-r from-transparent to-dorado-300/40" />
        <div className="h-1.5 w-1.5 rounded-full bg-dorado-400" />
        <div className="h-px w-16 bg-gradient-to-l from-transparent to-dorado-300/40" />
      </motion.div>

      <motion.p
        variants={fadeInUp}
        transition={easeSmooth}
        className="mt-4 text-center text-sm text-muted-foreground"
      >
        <Link
          href="/login"
          className="font-medium text-dorado-500 hover:text-dorado-600 underline-offset-4 hover:underline transition-colors"
        >
          Volver a iniciar sesión
        </Link>
      </motion.p>
    </motion.div>
  );
}
