"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { IdCard, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { springSmooth } from "@/lib/motion";

interface VerificarSocioProps {
  onVerified?: () => void;
}

export function VerificarSocio({ onVerified }: VerificarSocioProps) {
  const [cedula, setCedula] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerificar() {
    if (!cedula.trim()) {
      setError("Ingresá tu cédula");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/verificar-socio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedula }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al verificar");
        return;
      }

      setVerified(true);
      toast.success(data.message || "Verificación exitosa");
      // Refresh perfil data automatically after short delay for visual feedback
      setTimeout(() => {
        onVerified?.();
      }, 1500);
    } catch {
      setError("Error de conexión. Intentá de nuevo.");
    } finally {
      setIsLoading(false);
    }
  }

  if (verified) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={springSmooth}
      >
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="py-6 flex flex-col items-center gap-3">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <CheckCircle className="size-12 text-emerald-600" />
            </motion.div>
            <p className="font-body text-sm font-medium text-emerald-800">
              Tu cuenta fue vinculada como socio del club
            </p>
            <p className="font-body text-xs text-emerald-600">
              Actualizando tu perfil...
            </p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <Card className="border-dorado-200 bg-dorado-50/30">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-dorado-100">
            <IdCard className="size-5 text-dorado-700" />
          </div>
          <div>
            <CardTitle className="font-heading text-sm text-bordo-800">
              ¿Sos socio del club?
            </CardTitle>
            <CardDescription className="text-xs">
              Verificá tu membresía ingresando tu cédula
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="cedula-verificar" className="font-body text-sm">
            Cédula de identidad
          </Label>
          <Input
            id="cedula-verificar"
            placeholder="1.234.567-8"
            value={cedula}
            onChange={(e) => {
              setCedula(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleVerificar()}
            className="font-body focus-visible:ring-dorado-400/30 focus-visible:border-dorado-300"
          />
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3"
          >
            <AlertCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
            <p className="font-body text-xs text-red-700">
              {error.includes("cssecretaria2017@gmail.com") ? (
                <>
                  No encontramos un socio con esa cédula. Si creés que es un error, contactá a secretaría al email{" "}
                  <a
                    href="mailto:cssecretaria2017@gmail.com"
                    className="font-medium underline hover:text-red-900"
                  >
                    cssecretaria2017@gmail.com
                  </a>
                  .
                </>
              ) : (
                error
              )}
            </p>
          </motion.div>
        )}

        <Button
          onClick={handleVerificar}
          disabled={isLoading}
          className="w-full bg-gradient-to-r from-bordo-800 to-bordo-700 hover:from-bordo-900 hover:to-bordo-800 text-white"
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <IdCard className="size-4" />
          )}
          {isLoading ? "Verificando..." : "Verificar membresía"}
        </Button>
      </CardContent>
    </Card>
  );
}
