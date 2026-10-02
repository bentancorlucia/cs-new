/**
 * Lógica pura de variantes: ejes, combinaciones y emparejamiento con las
 * variantes que ya existen, para no recrearlas (perderían su stock y su
 * kardex) cuando cambian los ejes.
 */

export interface Eje {
  nombre: string;
  valores: string[];
}

export interface VarianteEditable {
  id?: number;
  nombre: string;
  sku: string | null;
  precio_override: number | null;
  atributos: Record<string, string>;
  activo: boolean;
}

/** Variante tal como viene de la base (atributos jsonb, activo nullable). */
export interface VarianteCruda {
  id: number;
  nombre: string;
  sku: string | null;
  precio_override: number | null;
  atributos: unknown;
  activo: boolean | null;
}

export function generarCombinaciones(ejes: Eje[]): Record<string, string>[] {
  const activos = ejes.filter((e) => e.valores.length > 0);
  if (activos.length === 0) return [];
  return activos.reduce<Record<string, string>[]>(
    (combos, eje) =>
      combos.length === 0
        ? eje.valores.map((v) => ({ [eje.nombre]: v }))
        : combos.flatMap((c) => eje.valores.map((v) => ({ ...c, [eje.nombre]: v }))),
    []
  );
}

export function nombreCombinacion(atributos: Record<string, string>): string {
  return Object.values(atributos).join(" / ");
}

export function mismosAtributos(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}

const clavesDe = (a: Record<string, string>) => Object.keys(a ?? {}).sort().join("\u0000");

/** Ejes a partir de las variantes: claves de las activas y sus valores. */
export function ejesDesdeVariantes(variantes: VarianteEditable[]): Eje[] {
  const base = variantes.some((v) => v.activo) ? variantes.filter((v) => v.activo) : variantes;
  const mapa = new Map<string, string[]>();
  for (const v of base) {
    for (const [k, val] of Object.entries(v.atributos ?? {})) {
      const lista = mapa.get(k) ?? [];
      if (!lista.includes(val)) lista.push(val);
      mapa.set(k, lista);
    }
  }
  return [...mapa.entries()].map(([nombre, valores]) => ({ nombre, valores }));
}

/** Sufijo de SKU legible y sin colisiones ("Rojo claro" / "Rojo oscuro" → ROJOCL / ROJOOS). */
export function skuParaCombinacion(base: string, atributos: Record<string, string>, usados: Set<string>): string {
  const sufijo = Object.values(atributos)
    .map((v) =>
      v
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6)
    )
    .filter(Boolean)
    .join("-");
  const raiz = `${base}-${sufijo || "V"}`.slice(0, 46);
  let sku = raiz;
  for (let n = 2; usados.has(sku.toLowerCase()); n++) sku = `${raiz}-${n}`;
  usados.add(sku.toLowerCase());
  return sku;
}

/**
 * Arma la lista de variantes para las combinaciones de los ejes.
 *  1. Combinación idéntica a una variante existente → se reutiliza.
 *  2. Si cambiaron los ejes (se agregó o quitó uno), una variante cuyas
 *     claves en común coinciden se reutiliza con los atributos nuevos
 *     (mismo id: conserva stock y kardex). Se prefiere la de más stock.
 *  3. El resto se crea nuevo, sin stock.
 * `pool`: variantes conocidas (las actuales primero, para conservar ediciones).
 */
export function emparejar(
  combos: Record<string, string>[],
  pool: VarianteEditable[],
  productoSku: string | null,
  stockDe: (v: VarianteEditable) => number
): VarianteEditable[] {
  const usadas = new Set<VarianteEditable>();
  const resultado: (VarianteEditable | null)[] = combos.map((combo) => {
    const exacta = pool.find((v) => !usadas.has(v) && mismosAtributos(v.atributos, combo));
    if (exacta) usadas.add(exacta);
    return exacta ?? null;
  });

  combos.forEach((combo, i) => {
    if (resultado[i]) return;
    const claves = clavesDe(combo);
    const candidatas = pool
      .filter((v) => !usadas.has(v) && v.id !== undefined && clavesDe(v.atributos) !== claves)
      .filter((v) => {
        const comunes = Object.keys(v.atributos ?? {}).filter((k) => k in combo);
        return comunes.length > 0 && comunes.every((k) => v.atributos[k] === combo[k]);
      })
      .sort((a, b) => stockDe(b) - stockDe(a));
    const elegida = candidatas[0];
    if (elegida) {
      usadas.add(elegida);
      resultado[i] = { ...elegida, atributos: combo, nombre: nombreCombinacion(combo) };
    }
  });

  const skus = new Set(pool.map((v) => v.sku?.toLowerCase()).filter((s): s is string => !!s));
  return combos.map(
    (combo, i) =>
      resultado[i] ?? {
        nombre: nombreCombinacion(combo),
        sku: productoSku ? skuParaCombinacion(productoSku, combo, skus) : null,
        precio_override: null,
        atributos: combo,
        activo: true,
      }
  );
}

/** Separa las variantes que están en la combinación de los ejes de las que quedaron afuera. */
export function particionar(variantes: VarianteEditable[], ejes: Eje[]) {
  const combos = generarCombinaciones(ejes);
  const dentro: VarianteEditable[] = [];
  const fuera: VarianteEditable[] = [];
  for (const v of variantes) {
    if (combos.some((c) => mismosAtributos(c, v.atributos ?? {}))) dentro.push(v);
    else fuera.push(v);
  }
  return { dentro, fuera };
}
