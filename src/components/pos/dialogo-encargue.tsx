"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MtoForm, calcularExtraSeguro } from "@/components/tienda/mto-form";
import { validarRestriccionSocios, validarValoresMto } from "@/lib/mto/schema";
import { resumirPersonalizacion } from "@/lib/mto/pricing";
import { precioListaUnitario, precioSocioUnitario } from "@/lib/tienda/precios";
import type { MtoValores } from "@/types/mto";
import type { ItemCarrito, ProductoPos } from "./tipos";
import { PrecioAnimado } from "./precio-animado";

// Tope de unidades por línea de encargue (no depende de stock).
export const MAX_CANTIDAD_ENCARGUE = 99;

/** Formulario de personalización (MTO) para tomar un encargue en el POS. */
export function DialogoEncargue({
  producto,
  esSocio,
  onCerrar,
  onAgregar,
}: {
  producto: ProductoPos | null;
  esSocio: boolean;
  onCerrar: () => void;
  onAgregar: (item: ItemCarrito) => void;
}) {
  return (
    <Dialog open={!!producto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        {producto && (
          <FormularioEncargue key={producto.id} producto={producto} esSocio={esSocio} onCerrar={onCerrar} onAgregar={onAgregar} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormularioEncargue({
  producto,
  esSocio,
  onCerrar,
  onAgregar,
}: {
  producto: ProductoPos;
  esSocio: boolean;
  onCerrar: () => void;
  onAgregar: (item: ItemCarrito) => void;
}) {
  const [valores, setValores] = useState<MtoValores>({});
  const campos = producto.mto_campos;

  const v = useMemo(() => {
    const validacion = validarValoresMto(campos, valores);
    const bloqueos = validarRestriccionSocios(campos, validacion.cleaned, esSocio);
    const socio = precioSocioUnitario(producto);
    const base = esSocio && socio != null ? socio : producto.precio;
    return {
      validacion,
      valido: validacion.valid && bloqueos.length === 0,
      precio: base + calcularExtraSeguro(campos, validacion.cleaned, esSocio),
    };
  }, [campos, valores, esSocio, producto]);

  const agregar = () => {
    if (!v.valido) return;
    const cleaned = v.validacion.cleaned;
    const resumen = resumirPersonalizacion(campos, cleaned)
      .map((r) => `${r.label}: ${r.valor}`)
      .join(" · ");
    onAgregar({
      // Cada encargue es su propia línea (personalizaciones distintas).
      key: `mto-${producto.id}-${Date.now()}`,
      producto_id: producto.id,
      variante_id: null,
      nombre: producto.nombre,
      precio: precioListaUnitario(producto),
      precio_socio: precioSocioUnitario(producto),
      cantidad: 1,
      maximo: MAX_CANTIDAD_ENCARGUE,
      imagen_url: producto.imagen_url,
      imagen_focal_point: producto.imagen_focal_point,
      es_encargue: true,
      personalizacion: cleaned,
      precio_extra: calcularExtraSeguro(campos, cleaned, esSocio),
      resumen: resumen || null,
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-heading flex items-center gap-2">
          <Sparkles className="size-4 text-bordo-700" />
          Encargue — {producto.nombre}
        </DialogTitle>
        <DialogDescription>
          Completá la personalización. No descuenta stock: el pedido queda como Encargado hasta que llegue.
        </DialogDescription>
      </DialogHeader>
      <div className="py-2">
        <MtoForm
          campos={campos}
          valores={valores}
          onChange={setValores}
          esSocio={esSocio}
          tiempoFabricacionDias={producto.mto_tiempo_fabricacion_dias}
          contexto="pos"
        />
      </div>
      <DialogFooter className="gap-2 sm:items-center">
        <p className="mr-auto font-heading font-bold text-lg text-bordo-800">
          <PrecioAnimado valor={v.precio} />
        </p>
        <Button variant="outline" onClick={onCerrar} className="h-11">
          Cancelar
        </Button>
        <motion.div whileTap={{ scale: 0.97 }}>
          <Button onClick={agregar} disabled={!v.valido} className="h-11 gap-2">
            <Plus className="size-4" />
            Agregar encargue
          </Button>
        </motion.div>
      </DialogFooter>
    </>
  );
}
