"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Minus, Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCart } from "@/hooks/use-cart";
import {
  type ProductoVariante,
  getVariantesActivas,
  getAtributoKeys,
  getValoresPorAtributo,
  findVarianteInicial,
  resolveVariante,
  isAtributoValueAvailable,
  getStockForAtributoValue,
} from "@/lib/tienda/variantes";
import { springBouncy, springSmooth } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface ProductoConVariantes {
  id: number;
  nombre: string;
  slug: string;
  precio: number;
  precio_socio: number | null;
  stock_actual: number;
  producto_imagenes?: { url: string; es_principal: boolean; focal_point: string }[];
  producto_variantes: ProductoVariante[];
}

interface Props {
  producto: ProductoConVariantes | null;
  onClose: () => void;
}

export function VariantSelectorDialog({ producto, onClose }: Props) {
  const open = producto !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        {producto && (
          <SelectorBody key={producto.id} producto={producto} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SelectorBody({
  producto,
  onClose,
}: {
  producto: ProductoConVariantes;
  onClose: () => void;
}) {
  const { addItem } = useCart();

  const variantes = useMemo(
    () => getVariantesActivas(producto.producto_variantes),
    [producto.producto_variantes]
  );
  const atributoKeys = useMemo(() => getAtributoKeys(variantes), [variantes]);
  const esMultiAtributo = atributoKeys.length >= 2;
  const valoresPorAtributo = useMemo(
    () => getValoresPorAtributo(variantes, atributoKeys),
    [variantes, atributoKeys]
  );

  const varianteInicial = useMemo(() => findVarianteInicial(variantes), [variantes]);

  const [seleccionAtributos, setSeleccionAtributos] = useState<Record<string, string>>(() => {
    if (!esMultiAtributo || !varianteInicial) return {};
    const initial: Record<string, string> = {};
    for (const key of atributoKeys) {
      initial[key] = varianteInicial.atributos[key] ?? "";
    }
    return initial;
  });
  const [varianteSeleccionada, setVarianteSeleccionada] = useState<number | null>(
    varianteInicial?.id ?? null
  );
  const [cantidad, setCantidad] = useState(1);
  const [added, setAdded] = useState(false);

  const varianteActual = useMemo(() => {
    if (esMultiAtributo) {
      return resolveVariante(variantes, atributoKeys, seleccionAtributos);
    }
    return variantes.find((v) => v.id === varianteSeleccionada) ?? null;
  }, [esMultiAtributo, variantes, atributoKeys, seleccionAtributos, varianteSeleccionada]);

  const stockDisponible = varianteActual?.stock_actual ?? 0;
  const sinStock = stockDisponible <= 0;
  const precioActual = varianteActual?.precio_override ?? producto.precio;
  const tieneDescuento = producto.precio_socio != null && producto.precio_socio < precioActual;

  const imagen =
    producto.producto_imagenes?.find((i) => i.es_principal) ??
    producto.producto_imagenes?.[0];

  function handleAdd() {
    if (!varianteActual || sinStock) return;
    addItem(
      {
        productoId: producto.id,
        varianteId: varianteActual.id,
        nombre: `${producto.nombre} - ${varianteActual.nombre}`,
        precio: precioActual,
        precioSocio: producto.precio_socio ?? undefined,
        imagenUrl: imagen?.url ?? "",
        maxStock: stockDisponible,
        slug: producto.slug,
      },
      cantidad
    );
    setAdded(true);
    toast.success("Agregado al carrito", {
      description: `${cantidad}x ${producto.nombre} - ${varianteActual.nombre}`,
    });
    setTimeout(() => {
      onClose();
    }, 600);
  }

  return (
    <div className="flex flex-col">
      {/* Header con imagen */}
      <div className="flex gap-3 p-4 border-b border-bordo-800/10">
        {imagen?.url && (
          <div className="relative w-20 h-24 shrink-0 overflow-hidden bg-superficie">
            <Image
              src={imagen.url}
              alt={producto.nombre}
              fill
              className="object-cover"
              sizes="80px"
              style={{ objectPosition: imagen.focal_point || "50% 50%" }}
            />
          </div>
        )}
        <div className="flex flex-col justify-between min-w-0 flex-1 pr-8">
          <DialogHeader>
            <DialogTitle className="font-display text-base uppercase tracking-tight text-bordo-950 line-clamp-2">
              {producto.nombre}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-baseline gap-2 mt-1">
            {tieneDescuento ? (
              <>
                <span className="font-display text-lg font-bold text-bordo-800">
                  ${producto.precio_socio!.toLocaleString("es-UY")}
                </span>
                <span className="text-xs text-bordo-950/40 line-through">
                  ${precioActual.toLocaleString("es-UY")}
                </span>
              </>
            ) : (
              <span className="font-display text-lg font-bold text-bordo-950">
                ${precioActual.toLocaleString("es-UY")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Selector */}
      <div className="p-4 flex flex-col gap-5 max-h-[50vh] overflow-y-auto">
        {esMultiAtributo ? (
          atributoKeys.map((key) => (
            <div key={key} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-widest text-bordo-950">
                  {key}
                </span>
                <span className="text-xs text-bordo-800/50">
                  {seleccionAtributos[key]}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {valoresPorAtributo[key]?.map((val) => {
                  const selected = seleccionAtributos[key] === val;
                  const available = isAtributoValueAvailable(
                    variantes,
                    atributoKeys,
                    key,
                    val,
                    seleccionAtributos
                  );
                  const stock = getStockForAtributoValue(
                    variantes,
                    atributoKeys,
                    key,
                    val,
                    seleccionAtributos
                  );
                  return (
                    <motion.button
                      key={val}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setSeleccionAtributos((prev) => ({ ...prev, [key]: val }));
                        setCantidad(1);
                      }}
                      disabled={!available || stock <= 0}
                      className={cn(
                        "h-10 border px-3 text-sm font-bold transition-all min-w-[40px]",
                        selected
                          ? "border-bordo-800 bg-bordo-800 text-white shadow-sm"
                          : "border-bordo-800/20 text-bordo-950 hover:border-bordo-800 hover:bg-bordo-800/5",
                        (!available || stock <= 0) &&
                          "opacity-40 line-through cursor-not-allowed"
                      )}
                    >
                      {val}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-bordo-950">
              Variante
            </span>
            <div className="flex flex-wrap gap-2">
              {variantes.map((v) => (
                <motion.button
                  key={v.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setVarianteSeleccionada(v.id);
                    setCantidad(1);
                  }}
                  disabled={v.stock_actual <= 0}
                  className={cn(
                    "h-10 border px-3 text-sm font-bold transition-all min-w-[40px]",
                    varianteSeleccionada === v.id
                      ? "border-bordo-800 bg-bordo-800 text-white shadow-sm"
                      : "border-bordo-800/20 text-bordo-950 hover:border-bordo-800 hover:bg-bordo-800/5",
                    v.stock_actual <= 0 && "opacity-40 line-through cursor-not-allowed"
                  )}
                >
                  {v.nombre}
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* Stock indicator */}
        {varianteActual && (
          <div className="flex items-center gap-1.5 text-[11px]">
            {sinStock ? (
              <span className="font-semibold text-red-600 uppercase tracking-wider">
                Sin stock
              </span>
            ) : stockDisponible <= 5 ? (
              <span className="font-semibold text-amber-600 uppercase tracking-wider">
                Quedan {stockDisponible}
              </span>
            ) : (
              <span className="font-semibold text-bordo-800/60 uppercase tracking-wider">
                En stock
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer: cantidad + CTA */}
      <div className="flex items-center gap-3 p-4 border-t border-bordo-800/10 bg-superficie/40">
        <div className="flex items-center border border-bordo-800/20 bg-white h-12">
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => setCantidad((q) => Math.max(1, q - 1))}
            disabled={cantidad <= 1}
            className="flex size-10 items-center justify-center text-bordo-800 disabled:opacity-30"
          >
            <Minus className="size-4" />
          </motion.button>
          <motion.span
            key={cantidad}
            initial={{ scale: 0.7 }}
            animate={{ scale: 1 }}
            transition={springBouncy}
            className="min-w-[2.5ch] text-center text-base font-bold text-bordo-950"
          >
            {cantidad}
          </motion.span>
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => setCantidad((q) => Math.min(stockDisponible, q + 1))}
            disabled={cantidad >= stockDisponible}
            className="flex size-10 items-center justify-center text-bordo-800 disabled:opacity-30"
          >
            <Plus className="size-4" />
          </motion.button>
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleAdd}
          disabled={!varianteActual || sinStock}
          className={cn(
            "flex-1 h-12 flex items-center justify-center gap-2 font-display text-sm uppercase tracking-wide transition-all",
            !varianteActual || sinStock
              ? "bg-bordo-800/30 text-bordo-800/50 cursor-not-allowed"
              : "bg-bordo-800 text-dorado-300 hover:bg-bordo-950"
          )}
        >
          <AnimatePresence mode="wait">
            {added ? (
              <motion.span
                key="added"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={springSmooth}
                className="flex items-center gap-2"
              >
                <Check className="size-4" />
                Agregado
              </motion.span>
            ) : sinStock ? (
              <span>Sin stock</span>
            ) : !varianteActual ? (
              <span>Elegí una opción</span>
            ) : (
              <motion.span
                key="add"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="flex items-center gap-2"
              >
                <ShoppingCart className="size-4" />
                Agregar
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  );
}
