"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useFormStatus } from "react-dom";
import {
  ShieldCheck,
  ShoppingBag,
  Landmark,
  Users,
  Loader2,
  Lock,
  AlertTriangle,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fadeInUp, staggerContainer, easeSmooth, springBouncy } from "@/lib/motion";
import { aprobarAutorizacion, denegarAutorizacion } from "./actions";

const AREAS: Record<string, { icono: typeof ShoppingBag; texto: string }> = {
  tienda: { icono: ShoppingBag, texto: "Ventas, pedidos y stock de la tienda" },
  tesorero: { icono: Landmark, texto: "Saldos, movimientos y presupuesto" },
  secretaria: { icono: Users, texto: "Cantidad de socios, altas, bajas y disciplinas" },
};

type Props =
  | { estado: "invalido" }
  | {
      estado: "pendiente" | "sin_permiso";
      authorizationId: string;
      cliente: string;
      email: string;
      roles: string[];
      errorAprobar?: boolean;
    };

export function ConsentCard(props: Props) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="w-full max-w-md px-4"
    >
      <motion.div variants={fadeInUp} transition={easeSmooth}>
        <Card className="border-bordo-100/50 shadow-card">
          {props.estado === "invalido" ? <Invalido /> : <Contenido {...props} />}
        </Card>
      </motion.div>
    </motion.div>
  );
}

function Invalido() {
  return (
    <>
      <CardHeader>
        <CardTitle className="text-lg font-heading text-bordo-800">
          Solicitud no válida
        </CardTitle>
        <CardDescription>
          El pedido de autorización expiró o ya fue usado. Volvé a conectar
          desde Claude o ChatGPT.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link
          href="/mi-cuenta"
          className={cn(buttonVariants({ variant: "outline" }), "w-full")}
        >
          Ir a mi cuenta
        </Link>
      </CardContent>
    </>
  );
}

function Contenido({
  estado,
  authorizationId,
  cliente,
  email,
  roles,
  errorAprobar,
}: Extract<Props, { estado: "pendiente" | "sin_permiso" }>) {
  const esSuperAdmin = roles.includes("super_admin");
  const areas = Object.entries(AREAS).filter(
    ([rol]) => esSuperAdmin || roles.includes(rol)
  );

  return (
    <>
      <CardHeader>
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={springBouncy}
          className="mb-3 flex size-12 items-center justify-center rounded-full bg-bordo-50 text-bordo-700"
        >
          {estado === "pendiente" ? (
            <ShieldCheck className="size-6" />
          ) : (
            <Lock className="size-6" />
          )}
        </motion.div>
        <CardTitle className="text-lg font-heading text-bordo-800">
          {cliente} quiere acceder a los datos del club
        </CardTitle>
        <CardDescription>
          Conectado como <span className="font-medium text-foreground">{email}</span>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {errorAprobar && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            No se pudo completar la autorización. Intentá de nuevo.
          </div>
        )}

        {estado === "sin_permiso" ? (
          <p className="text-sm text-muted-foreground">
            Tu cuenta no tiene ningún rol de gestión (tienda, tesorería o
            secretaría), así que no hay datos que compartir. Pedile a un
            administrador que te asigne el rol correspondiente.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Podrá <strong>consultar</strong> (sin modificar nada):
            </p>
            <motion.ul
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="space-y-2"
            >
              {areas.map(([rol, { icono: Icono, texto }]) => (
                <motion.li
                  key={rol}
                  variants={fadeInUp}
                  transition={easeSmooth}
                  className="flex items-center gap-3 rounded-lg border border-bordo-100/60 bg-white/60 px-3 py-2.5 text-sm"
                >
                  <Icono className="size-4 shrink-0 text-dorado-500" />
                  {texto}
                </motion.li>
              ))}
            </motion.ul>
            <p className="text-xs text-muted-foreground">
              Podés revocar el acceso en cualquier momento desde la
              configuración de conectores de {cliente}.
            </p>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <form action={denegarAutorizacion} className="flex-1">
            <input type="hidden" name="authorization_id" value={authorizationId} />
            <BotonEnviar variant="outline">Cancelar</BotonEnviar>
          </form>
          {estado === "pendiente" && (
            <form action={aprobarAutorizacion} className="flex-1">
              <input type="hidden" name="authorization_id" value={authorizationId} />
              <BotonEnviar className="bg-gradient-to-r from-bordo-800 to-bordo-700 text-white shadow-md hover:from-bordo-900 hover:to-bordo-800 hover:shadow-lg">
                Autorizar
              </BotonEnviar>
            </form>
          )}
        </div>
      </CardContent>
    </>
  );
}

function BotonEnviar({
  children,
  variant,
  className,
}: {
  children: React.ReactNode;
  variant?: "outline";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={springBouncy}>
      <Button
        type="submit"
        size="lg"
        variant={variant}
        disabled={pending}
        className={cn("w-full transition-all duration-300", className)}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : children}
      </Button>
    </motion.div>
  );
}
