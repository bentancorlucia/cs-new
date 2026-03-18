import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizeCedula(cedula: string): string {
  return cedula.replace(/[\.\-\s]/g, "").trim();
}
