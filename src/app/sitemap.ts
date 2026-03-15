import type { MetadataRoute } from "next";

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

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/socios`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/beneficios`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/tienda`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/eventos`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];

  const clubRoutes: MetadataRoute.Sitemap = clubPages.map((page) => ({
    url: `${BASE_URL}/club/${page}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const deporteRoutes: MetadataRoute.Sitemap = deportes.map((deporte) => ({
    url: `${BASE_URL}/deportes/${deporte}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...staticRoutes, ...clubRoutes, ...deporteRoutes];
}
