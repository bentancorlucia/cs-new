import type { MetadataRoute } from "next";
import { createServerClient } from "@/lib/supabase/server";

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://clubseminario.com.uy";

const deportes = [
  "basquetbol",
  "corredores",
  "handball",
  "hockey",
  "futbol",
  "rugby",
  "voley",
];

const clubPages = [
  "quienes-somos",
  "directiva",
  "instalaciones",
  "estatuto",
  "reglamento",
  "memorias",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/socios`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/beneficios`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/tienda`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];

  const clubRoutes: MetadataRoute.Sitemap = clubPages.map((page) => ({
    url: `${BASE_URL}/club/${page}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const deporteRoutes: MetadataRoute.Sitemap = deportes.map((deporte) => ({
    url: `${BASE_URL}/deportes/${deporte}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  // Productos activos (dinámico)
  let productoRoutes: MetadataRoute.Sitemap = [];
  try {
    const supabase = await createServerClient();
    const { data } = await supabase
      .from("productos")
      .select("slug, updated_at")
      .eq("activo", true);
    productoRoutes =
      (data as { slug: string; updated_at: string | null }[] | null)?.map((p) => ({
        url: `${BASE_URL}/tienda/${p.slug}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : now,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })) ?? [];
  } catch {
    // No bloquear el sitemap si Supabase no está disponible
  }

  return [...staticRoutes, ...clubRoutes, ...deporteRoutes, ...productoRoutes];
}
