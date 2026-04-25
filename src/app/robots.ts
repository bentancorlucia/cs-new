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
          "/tesoreria/",
          "/mi-cuenta/",
          "/eventos",
          "/eventos/",
          "/socio/",
          "/auth/",
          "/api/",
          "/login",
          "/registro",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
