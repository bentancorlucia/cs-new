export interface ProductoVariante {
  id: number;
  nombre: string;
  sku: string | null;
  precio_override: number | null;
  stock_actual: number;
  atributos: Record<string, string>;
  activo: boolean;
}

export function getVariantesActivas<T extends { activo: boolean }>(
  variantes: T[] | null | undefined
): T[] {
  return variantes?.filter((v) => v.activo) ?? [];
}

export function tieneVariantesActivas<T extends { activo: boolean }>(
  variantes: T[] | null | undefined
): boolean {
  return getVariantesActivas(variantes).length > 0;
}

export function getAtributoKeys(variantes: ProductoVariante[]): string[] {
  const keySets = variantes.map((v) => Object.keys(v.atributos || {}));
  if (keySets.length === 0) return [];
  return keySets[0].filter((k) => keySets.every((ks) => ks.includes(k)));
}

export function getValoresPorAtributo(
  variantes: ProductoVariante[],
  atributoKeys: string[]
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const key of atributoKeys) {
    const seen = new Set<string>();
    const values: string[] = [];
    for (const v of variantes) {
      const val = v.atributos[key];
      if (val && !seen.has(val)) {
        seen.add(val);
        values.push(val);
      }
    }
    map[key] = values;
  }
  return map;
}

export function findVarianteInicial(
  variantes: ProductoVariante[],
  stockReservadoVariantes: Record<number, number> = {}
): ProductoVariante | null {
  if (variantes.length === 0) return null;
  const conStock = variantes.find((v) => {
    const reservado = stockReservadoVariantes[v.id] || 0;
    return v.stock_actual - reservado > 0;
  });
  return conStock ?? variantes[0] ?? null;
}

export function getStockDisponible(
  variante: ProductoVariante,
  stockReservadoVariantes: Record<number, number> = {}
): number {
  const reservado = stockReservadoVariantes[variante.id] || 0;
  return Math.max(0, variante.stock_actual - reservado);
}

export function resolveVariante(
  variantes: ProductoVariante[],
  atributoKeys: string[],
  seleccion: Record<string, string>
): ProductoVariante | null {
  return (
    variantes.find((v) =>
      atributoKeys.every((k) => v.atributos[k] === seleccion[k])
    ) ?? null
  );
}

export function isAtributoValueAvailable(
  variantes: ProductoVariante[],
  atributoKeys: string[],
  key: string,
  value: string,
  seleccion: Record<string, string>
): boolean {
  return variantes.some((v) => {
    if (v.atributos[key] !== value) return false;
    return atributoKeys.every(
      (k) => k === key || v.atributos[k] === seleccion[k]
    );
  });
}

export function getStockForAtributoValue(
  variantes: ProductoVariante[],
  atributoKeys: string[],
  key: string,
  value: string,
  seleccion: Record<string, string>,
  stockReservadoVariantes: Record<number, number> = {}
): number {
  const match = variantes.find((v) => {
    if (v.atributos[key] !== value) return false;
    return atributoKeys.every(
      (k) => k === key || v.atributos[k] === seleccion[k]
    );
  });
  if (!match) return 0;
  return getStockDisponible(match, stockReservadoVariantes);
}
