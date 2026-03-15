"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

export interface CartItem {
  productoId: number;
  varianteId?: number;
  nombre: string;
  precio: number;
  precioSocio?: number;
  cantidad: number;
  imagenUrl: string;
  maxStock: number;
  slug: string;
}

const CART_KEY = "cs-carrito";

function loadCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setItems(loadCart());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveCart(items);
  }, [items, loaded]);

  const addItem = useCallback((item: Omit<CartItem, "cantidad">, cantidad = 1) => {
    setItems((prev) => {
      const key = `${item.productoId}-${item.varianteId ?? ""}`;
      const existing = prev.find(
        (i) => `${i.productoId}-${i.varianteId ?? ""}` === key
      );
      if (existing) {
        return prev.map((i) =>
          `${i.productoId}-${i.varianteId ?? ""}` === key
            ? { ...i, cantidad: Math.min(i.cantidad + cantidad, i.maxStock) }
            : i
        );
      }
      return [...prev, { ...item, cantidad: Math.min(cantidad, item.maxStock) }];
    });
  }, []);

  const updateQuantity = useCallback((productoId: number, varianteId: number | undefined, cantidad: number) => {
    setItems((prev) => {
      const key = `${productoId}-${varianteId ?? ""}`;
      if (cantidad <= 0) {
        return prev.filter((i) => `${i.productoId}-${i.varianteId ?? ""}` !== key);
      }
      return prev.map((i) =>
        `${i.productoId}-${i.varianteId ?? ""}` === key
          ? { ...i, cantidad: Math.min(cantidad, i.maxStock) }
          : i
      );
    });
  }, []);

  const removeItem = useCallback((productoId: number, varianteId?: number) => {
    setItems((prev) => {
      const key = `${productoId}-${varianteId ?? ""}`;
      return prev.filter((i) => `${i.productoId}-${i.varianteId ?? ""}` !== key);
    });
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.cantidad, 0), [items]);

  const total = useMemo(() => items.reduce((sum, i) => sum + i.precio * i.cantidad, 0), [items]);

  const totalSocio = useMemo(
    () =>
      items.reduce(
        (sum, i) => sum + (i.precioSocio ?? i.precio) * i.cantidad,
        0
      ),
    [items]
  );

  return {
    items,
    loaded,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    itemCount,
    total,
    totalSocio,
  };
}
