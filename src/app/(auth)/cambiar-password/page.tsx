"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff, Lock, Loader2 } from "lucide-react";
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

const cambiarPasswordSchema = z
  .object({
    password: z.string().min(8, "Mínimo 8 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

type CambiarPasswordForm = z.infer<typeof cambiarPasswordSchema>;

export default function CambiarPasswordPage() {
  useDocumentTitle("Cambiar Contraseña");
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CambiarPasswordForm>({
    resolver: zodResolver(cambiarPasswordSchema),
  });

  // Verify user has an active session (from reset password flow)
  useEffect(() => {
    const checkSession = async () => {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Enlace inválido o expirado. Solicitá uno nuevo.");
        router.push("/recuperar");
        return;
      }
      setSessionChecked(true);
    };
    checkSession();
  }, [router]);

  async function onSubmit(data: CambiarPasswordForm) {
    setIsLoading(true);
    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Contraseña actualizada correctamente");
      router.push("/mi-cuenta");
    } catch {
      toast.error("Error al cambiar la contraseña");
    } finally {
      setIsLoading(false);
    }
  }

  if (!sessionChecked) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-bordo-700" />
      </div>
    );
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
            <p className="mt-1 text-sm text-muted-foreground">
              Nueva contraseña
            </p>
          </div>
          <div className="hidden lg:block">
            <p className="text-sm text-muted-foreground">
              Nueva contraseña
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeInUp} transition={easeSmooth}>
        <Card className="border-bordo-100/50 shadow-card">
          <CardHeader>
            <CardTitle className="text-lg font-heading text-bordo-800">
              Cambiar contraseña
            </CardTitle>
            <CardDescription>
              Ingresá tu nueva contraseña
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nueva contraseña</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Mínimo 8 caracteres"
                    autoComplete="new-password"
                    className="focus-visible:ring-bordo-700/30 focus-visible:border-bordo-300"
                    aria-invalid={!!errors.password}
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-bordo-700 transition-colors"
                    tabIndex={-1}
                    aria-label={
                      showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Repetí tu contraseña"
                  autoComplete="new-password"
                  className="focus-visible:ring-bordo-700/30 focus-visible:border-bordo-300"
                  aria-invalid={!!errors.confirmPassword}
                  {...register("confirmPassword")}
                />
                {errors.confirmPassword && (
                  <p className="text-xs text-destructive">
                    {errors.confirmPassword.message}
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
                  <Lock className="size-4" />
                )}
                {isLoading ? "Guardando..." : "Guardar contraseña"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
