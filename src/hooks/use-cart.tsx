"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import type { MtoValores } from "@/types/mto";

export interface CartItem {
  lineId: string;
  productoId: number;
  varianteId?: number;
  nombre: string;
  precio: number;
  precioSocio?: number;
  cantidad: number;
  imagenUrl: string;
  maxStock: number;
  slug: string;
  // Made-to-order
  esEncargue?: boolean;
  personalizacion?: MtoValores;
  precioExtra?: number;
  tiempoFabricacionDias?: number | null;
  resumenPersonalizacion?: Array<{ key: string; label: string; valor: string }>;
}

interface CartContextValue {
  items: CartItem[];
  loaded: boolean;
  idempotencyKey: string;
  addItem: (item: Omit<CartItem, "cantidad" | "lineId"> & { lineId?: string }, cantidad?: number) => void;
  updateQuantity: (lineId: string, cantidad: number) => void;
  removeItem: (lineId: string) => void;
  clearCart: () => void;
  itemCount: number;
  total: number;
  totalSocio: number;
}

const CartContext = createContext<CartContextValue | null>(null);

const CART_KEY = "cs-carrito-v2";
const LEGACY_KEY = "cs-carrito";
const IDEM_KEY = "cs-checkout-idem-v1";

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function stockLineId(productoId: number, varianteId?: number) {
  return `stock:${productoId}:${varianteId ?? ""}`;
}

function loadCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CartItem[];
      // Defensive migration: ensure all items have lineId
      return parsed.map((it) => ({
        ...it,
        lineId: it.lineId || stockLineId(it.productoId, it.varianteId),
      }));
    }
    // Migrate from legacy key
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy) as Array<Omit<CartItem, "lineId">>;
      const migrated = old.map((it) => ({
        ...it,
        lineId: stockLineId(it.productoId, it.varianteId),
      }));
      localStorage.setItem(CART_KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_KEY);
      return migrated;
    }
    return [];
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

function loadOrCreateIdempotencyKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = localStorage.getItem(IDEM_KEY);
    if (existing) return existing;
  } catch {
    // localStorage may be unavailable (private mode, etc).
  }
  const fresh = uuid();
  try {
    localStorage.setItem(IDEM_KEY, fresh);
  } catch {
    // ignore
  }
  return fresh;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");

  useEffect(() => {
    setItems(loadCart());
    setIdempotencyKey(loadOrCreateIdempotencyKey());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveCart(items);
  }, [items, loaded]);

  const addItem = useCallback<CartContextValue["addItem"]>((item, cantidad = 1) => {
    setItems((prev) => {
      // Para items no-MTO: mergear por productoId+varianteId (lineId determinístico).
      // Para items MTO: cada add es una línea nueva (lineId aleatorio).
      const isMto = item.esEncargue === true;
      const lineId = item.lineId ?? (isMto ? `mto:${uuid()}` : stockLineId(item.productoId, item.varianteId));

      if (!isMto) {
        const existing = prev.find((i) => i.lineId === lineId);
        if (existing) {
          return prev.map((i) =>
            i.lineId === lineId
              ? { ...i, cantidad: Math.min(i.cantidad + cantidad, i.maxStock || Infinity) }
              : i
          );
        }
      }

      const nuevo: CartItem = {
        ...item,
        lineId,
        cantidad: Math.min(cantidad, item.maxStock || Infinity),
      };
      return [...prev, nuevo];
    });
  }, []);

  const updateQuantity = useCallback((lineId: string, cantidad: number) => {
    setItems((prev) => {
      if (cantidad <= 0) return prev.filter((i) => i.lineId !== lineId);
      return prev.map((i) =>
        i.lineId === lineId
          ? { ...i, cantidad: Math.min(cantidad, i.maxStock || Infinity) }
          : i
      );
    });
  }, []);

  const removeItem = useCallback((lineId: string) => {
    setItems((prev) => prev.filter((i) => i.lineId !== lineId));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    const fresh = uuid();
    setIdempotencyKey(fresh);
    if (typeof window !== "undefined") {
      localStorage.removeItem(CART_KEY);
      try {
        localStorage.setItem(IDEM_KEY, fresh);
      } catch {
        // ignore
      }
    }
  }, []);

  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.cantidad, 0), [items]);

  const total = useMemo(
    () => items.reduce((sum, i) => sum + (i.precio + (i.precioExtra ?? 0)) * i.cantidad, 0),
    [items]
  );

  const totalSocio = useMemo(
    () =>
      items.reduce(
        (sum, i) => sum + ((i.precioSocio ?? i.precio) + (i.precioExtra ?? 0)) * i.cantidad,
        0
      ),
    [items]
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      loaded,
      idempotencyKey,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      itemCount,
      total,
      totalSocio,
    }),
    [items, loaded, idempotencyKey, addItem, updateQuantity, removeItem, clearCart, itemCount, total, totalSocio]
  );

  return <CartContext value={value}>{children}</CartContext>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return ctx;
}
