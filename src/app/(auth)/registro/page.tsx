"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff, UserPlus, Loader2 } from "lucide-react";
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

const registroSchema = z
  .object({
    nombre: z.string().min(2, "Mínimo 2 caracteres"),
    apellido: z.string().min(2, "Mínimo 2 caracteres"),
    email: z.email("Ingresá un email válido"),
    password: z.string().min(8, "Mínimo 8 caracteres"),
    confirmPassword: z.string(),
    telefono: z.string().optional(),
    cedula: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

type RegistroForm = z.infer<typeof registroSchema>;

export default function RegistroPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegistroForm>({
    resolver: zodResolver(registroSchema),
  });

  async function onSubmit(data: RegistroForm) {
    setIsLoading(true);
    try {
      const supabase = createBrowserClient();

      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/mi-cuenta`,
          data: {
            nombre: data.nombre,
            apellido: data.apellido,
            telefono: data.telefono || null,
            cedula: data.cedula || null,
          },
        },
      });

      if (error) {
        if (error.message.includes("already registered")) {
          toast.error("Este email ya está registrado");
        } else {
          toast.error(error.message);
        }
        return;
      }

      toast.success("Cuenta creada. Revisá tu email para confirmar.");
      router.push(`/confirmar-email?email=${encodeURIComponent(data.email)}`);
    } catch {
      toast.error("Error al crear la cuenta");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="w-full max-w-md px-4 py-8"
    >
      <motion.div variants={fadeInUp} transition={easeSmooth}>
        <div className="mb-8 text-center">
          <div className="lg:hidden mb-6">
            <h1 className="font-display text-4xl font-bold text-bordo-800 tracking-tightest">
              Club <span className="text-dorado-400">Seminario</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Creá tu cuenta</p>
          </div>
          <div className="hidden lg:block">
            <p className="text-sm text-muted-foreground">Creá tu cuenta</p>
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeInUp} transition={easeSmooth}>
        <Card className="border-bordo-100/50 shadow-card">
          <CardHeader>
            <CardTitle className="text-lg font-heading text-bordo-800">
              Registro
            </CardTitle>
            <CardDescription>
              Completá tus datos para unirte al club
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre</Label>
                  <Input
                    id="nombre"
                    placeholder="Juan"
                    autoComplete="given-name"
                    className="focus-visible:ring-bordo-700/30 focus-visible:border-bordo-300"
                    aria-invalid={!!errors.nombre}
                    {...register("nombre")}
                  />
                  {errors.nombre && (
                    <p className="text-xs text-destructive">
                      {errors.nombre.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="apellido">Apellido</Label>
                  <Input
                    id="apellido"
                    placeholder="Pérez"
                    autoComplete="family-name"
                    className="focus-visible:ring-bordo-700/30 focus-visible:border-bordo-300"
                    aria-invalid={!!errors.apellido}
                    {...register("apellido")}
                  />
                  {errors.apellido && (
                    <p className="text-xs text-destructive">
                      {errors.apellido.message}
                    </p>
                  )}
                </div>
              </div>

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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="telefono">
                    Teléfono{" "}
                    <span className="text-muted-foreground font-normal">
                      (opcional)
                    </span>
                  </Label>
                  <Input
                    id="telefono"
                    type="tel"
                    placeholder="099 123 456"
                    autoComplete="tel"
                    className="focus-visible:ring-bordo-700/30 focus-visible:border-bordo-300"
                    {...register("telefono")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cedula">
                    Cédula{" "}
                    <span className="text-muted-foreground font-normal">
                      (opcional)
                    </span>
                  </Label>
                  <Input
                    id="cedula"
                    placeholder="1.234.567-8"
                    className="focus-visible:ring-bordo-700/30 focus-visible:border-bordo-300"
                    {...register("cedula")}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Si sos socio, ingresá tu cédula para vincular tu cuenta automáticamente
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
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
                  <UserPlus className="size-4" />
                )}
                {isLoading ? "Creando cuenta..." : "Crear cuenta"}
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
        ¿Ya tenés cuenta?{" "}
        <Link
          href="/login"
          className="font-medium text-dorado-500 hover:text-dorado-600 underline-offset-4 hover:underline transition-colors"
        >
          Iniciá sesión
        </Link>
      </motion.p>
    </motion.div>
  );
}
