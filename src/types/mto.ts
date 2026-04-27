export type MtoFieldType = "texto" | "numero" | "select" | "talle";

export interface MtoCampoOpcion {
  valor: string;
  label: string;
  precio_extra?: number;
  solo_socios?: boolean;
}

export interface MtoCampo {
  id: string;
  key: string;
  label: string;
  tipo: MtoFieldType;
  requerido: boolean;
  solo_socios?: boolean;
  precio_extra?: number;
  max_length?: number;
  placeholder?: string;
  min?: number;
  max?: number;
  opciones?: MtoCampoOpcion[];
}

export type MtoValores = Record<string, string | number>;

export const TALLES_PRESET: MtoCampoOpcion[] = [
  { valor: "XS", label: "XS" },
  { valor: "S", label: "S" },
  { valor: "M", label: "M" },
  { valor: "L", label: "L" },
  { valor: "XL", label: "XL" },
  { valor: "XXL", label: "XXL" },
];
