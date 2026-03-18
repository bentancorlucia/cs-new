"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff, LogIn, Loader2 } from "lucide-react";
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

const loginSchema = z.object({
  email: z.email("Ingresá un email válido"),
  password: z.string().min(1, "Ingresá tu contraseña"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect") || "/mi-cuenta";
  // Prevent open redirect: only allow relative paths starting with /
  const redirectTo = rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") ? rawRedirect : "/mi-cuenta";
  const errorParam = searchParams.get("error");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginForm) {
    setIsLoading(true);
    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        if (error.message.includes("Invalid login")) {
          toast.error("Email o contraseña incorrectos");
        } else if (error.message.includes("Email not confirmed")) {
          toast.error("Debés confirmar tu email antes de iniciar sesión. Revisá tu bandeja de entrada.");
        } else {
          toast.error(error.message);
        }
        return;
      }

      toast.success("Sesión iniciada");
      router.push(redirectTo);
      router.refresh();
    } catch {
      toast.error("Error al iniciar sesión");
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
          {/* Logo visible solo en mobile (en desktop está en el panel izquierdo) */}
          <div className="lg:hidden mb-6">
            <h1 className="font-display text-4xl font-bold text-bordo-800 tracking-tightest">
              Club <span className="text-dorado-400">Seminario</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Iniciá sesión en tu cuenta
            </p>
          </div>
          <div className="hidden lg:block">
            <p className="text-sm text-muted-foreground">
              Iniciá sesión en tu cuenta
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeInUp} transition={easeSmooth}>
        <Card className="border-bordo-100/50 shadow-card">
          <CardHeader>
            <CardTitle className="text-lg font-heading text-bordo-800">
              Iniciar sesión
            </CardTitle>
            <CardDescription>
              Ingresá tus datos para acceder al sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            {errorParam === "auth" && (
              <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                El enlace ya no es válido o expiró. Intentá de nuevo.
              </div>
            )}
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

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Tu contraseña"
                    autoComplete="current-password"
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

              <div className="flex justify-end">
                <Link
                  href="/recuperar"
                  className="text-xs text-muted-foreground hover:text-dorado-500 underline-offset-4 hover:underline transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
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
                  <LogIn className="size-4" />
                )}
                {isLoading ? "Ingresando..." : "Iniciar sesión"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      {/* Separador decorativo */}
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
        ¿No tenés cuenta?{" "}
        <Link
          href="/registro"
          className="font-medium text-dorado-500 hover:text-dorado-600 underline-offset-4 hover:underline transition-colors"
        >
          Registrate
        </Link>
      </motion.p>
    </motion.div>
  );
}
