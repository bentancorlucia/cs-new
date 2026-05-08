import { createServerClient } from "@/lib/supabase/server";
import type { PopupRow } from "./types";

export function matchesPath(pattern: string, pathname: string): boolean {
  if (pattern === "*") return true;
  if (pattern === pathname) return true;
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    if (pathname === prefix) return true;
    return pathname.startsWith(prefix + "/");
  }
  return false;
}

export async function getActivePopupForPath(
  pathname: string
): Promise<PopupRow | null> {
  const supabase = await createServerClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await (supabase as any)
    .from("popups")
    .select("*")
    .eq("status", "published")
    .lte("starts_at", nowIso)
    .gte("ends_at", nowIso)
    .order("priority", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error || !data) return null;

  for (const row of data as unknown as PopupRow[]) {
    const pages = Array.isArray(row.pages) ? row.pages : [];
    if (pages.some((p) => matchesPath(p, pathname))) {
      return row;
    }
  }
  return null;
}
