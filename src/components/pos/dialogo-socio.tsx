"use client";

import { useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SocioPos } from "./tipos";

/** Busca un socio por cédula para aplicar el precio de socio. */
export function DialogoSocio({
  abierto,
  onCambio,
  buscar,
  onEncontrado,
}: {
  abierto: boolean;
  onCambio: (abierto: boolean) => void;
  buscar: (cedula: string) => Promise<{ ok: true; socio: SocioPos } | { ok: false; error: string }>;
  onEncontrado: (s: SocioPos) => void;
}) {
  const [cedula, setCedula] = useState("");
  const [pendiente, iniciar] = useTransition();

  const enviar = () => {
    if (!cedula.trim() || pendiente) return;
    iniciar(async () => {
      const r = await buscar(cedula);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (!r.socio.es_socio) toast.warning(`${r.socio.nombre} ${r.socio.apellido} no figura como socio: no hay precio de socio`);
      else toast.success(`Socio: ${r.socio.nombre} ${r.socio.apellido}`);
      onEncontrado(r.socio);
      setCedula("");
    });
  };

  return (
    <Dialog open={abierto} onOpenChange={onCambio}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Buscar socio</DialogTitle>
          <DialogDescription>Ingresá la cédula (con o sin puntos) para aplicar el precio de socio.</DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          <Input
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
            placeholder="Cédula"
            inputMode="numeric"
            className="flex-1 h-12 text-lg"
            autoFocus
          />
          <Button type="submit" disabled={pendiente} className="h-12 w-14">
            {pendiente ? <Loader2 className="size-5 animate-spin" /> : <Search className="size-5" />}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
