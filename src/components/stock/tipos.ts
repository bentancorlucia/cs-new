import type { MetodoCosteo } from "@/lib/comercial/stock";

/** Ítem vendible tal como lo muestran las pantallas de stock. */
export interface ItemVista {
  clave: string;
  productoId: number;
  varianteId: number | null;
  nombre: string;
  sku: string | null;
  activo: boolean;
  itemId: number | null;
  stock: number;
  valor: number;
  reservado: number;
  disponible: number;
  conMovimientos: boolean;
  metodo: MetodoCosteo;
  heredado: boolean;
}

export interface ProductoVista {
  id: number;
  nombre: string;
  sku: string | null;
  categoria: string | null;
  stockMinimo: number;
  activo: boolean;
  activoPos: boolean;
  tieneVariantes: boolean;
  items: ItemVista[];
  stock: number;
  reservado: number;
  disponible: number;
  valor: number;
  metodo: MetodoCosteo | "mixto";
}
