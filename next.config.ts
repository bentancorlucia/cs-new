import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["tesseract.js", "pdf-parse"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/pages/club/directiva.html", destination: "/club/directiva", permanent: true },
      { source: "/pages/club/instalaciones.html", destination: "/club/instalaciones", permanent: true },
      { source: "/pages/club/estatuto.html", destination: "/club/estatuto", permanent: true },
      { source: "/pages/club/reglamento.html", destination: "/club/reglamento", permanent: true },
      { source: "/pages/club/memorias.html", destination: "/club/memorias", permanent: true },
      { source: "/pages/deportes/basket.html", destination: "/deportes/basquetbol", permanent: true },
      { source: "/pages/deportes/corredores.html", destination: "/deportes/corredores", permanent: true },
      { source: "/pages/deportes/handball.html", destination: "/deportes/handball", permanent: true },
      { source: "/pages/deportes/hockey.html", destination: "/deportes/hockey", permanent: true },
      { source: "/pages/deportes/futbol.html", destination: "/deportes/futbol", permanent: true },
      { source: "/pages/deportes/rugby.html", destination: "/deportes/rugby", permanent: true },
      { source: "/pages/deportes/voley.html", destination: "/deportes/voley", permanent: true },
      { source: "/pages/socios.html", destination: "/socios", permanent: true },
      { source: "/pages/beneficios.html", destination: "/beneficios", permanent: true },
      {
        source: "/archivos/:file(Memoria-\\d{4}-Club-Seminario\\.pdf)",
        destination: "/documentos/memorias/:file",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
      {
        // Allow PDF embeds in same-origin iframes
        source: "/documentos/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
        ],
      },
      {
        // Cache immutable assets aggressively
        source: "/images/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
