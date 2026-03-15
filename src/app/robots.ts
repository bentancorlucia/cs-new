import type { MetadataRoute } from "next";

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://clubseminario.com.uy";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/secretaria/",
          "/mi-cuenta/",
          "/eventos/crear",
          "/eventos/scanner",
          "/eventos/admin",
          "/api/",
          "/login",
          "/registro",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
