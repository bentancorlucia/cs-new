import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://clubseminario.com.uy";

export const metadata: Metadata = {
  title: {
    default: "Club Seminario — Club deportivo, social y cultural en Montevideo",
    template: "%s — Club Seminario",
  },
  description:
    "Club Seminario es el club deportivo, social y cultural de la comunidad jesuita en Uruguay. Rugby, hockey, fútbol, handball, básquetbol, vóleibol y corredores. Más de 1.000 socios en Montevideo.",
  applicationName: "Club Seminario",
  authors: [{ name: "Club Seminario" }],
  creator: "Club Seminario",
  publisher: "Club Seminario",
  metadataBase: new URL(BASE_URL),
  alternates: {
    canonical: "/",
  },
  keywords: [
    "Club Seminario",
    "club deportivo Montevideo",
    "club jesuita Uruguay",
    "rugby Montevideo",
    "hockey Montevideo",
    "fútbol Uruguay",
    "handball Uruguay",
    "básquetbol Montevideo",
    "vóleibol Uruguay",
    "Parque CUPRA",
    "Polideportivo Gonzaga",
    "Liga Universitaria",
    "exalumnos Seminario",
    "comunidad jesuita",
  ],
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "es_UY",
    url: BASE_URL,
    siteName: "Club Seminario",
    title: "Club Seminario — Club deportivo, social y cultural en Montevideo",
    description:
      "Club deportivo, social y cultural de la comunidad jesuita en Uruguay. Rugby, hockey, fútbol, handball, básquetbol, vóleibol y corredores.",
    images: [
      {
        url: "/images/og-default.jpg",
        width: 1200,
        height: 630,
        alt: "Club Seminario — Club deportivo, social y cultural",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Club Seminario — Club deportivo, social y cultural",
    description:
      "Club deportivo, social y cultural de la comunidad jesuita en Uruguay.",
    images: ["/images/og-default.jpg"],
  },
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
  category: "sports",
};

export const viewport: Viewport = {
  themeColor: "#730d32",
  width: "device-width",
  initialScale: 1,
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SportsClub",
  name: "Club Seminario",
  alternateName: "CS",
  url: BASE_URL,
  logo: `${BASE_URL}/images/escudo/logo-cs.png`,
  image: `${BASE_URL}/images/og-default.jpg`,
  description:
    "Club deportivo, social y cultural de la comunidad jesuita en Uruguay.",
  foundingDate: "2010-05-13",
  sport: [
    "Rugby",
    "Hockey",
    "Fútbol",
    "Handball",
    "Básquetbol",
    "Vóleibol",
    "Atletismo",
  ],
  address: {
    "@type": "PostalAddress",
    streetAddress: "Cochabamba 2882",
    addressLocality: "Montevideo",
    addressCountry: "UY",
  },
  areaServed: {
    "@type": "Country",
    name: "Uruguay",
  },
  sameAs: [
    "https://www.instagram.com/clubseminariouy",
    "https://www.facebook.com/clubseminariouy",
  ],
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Club Seminario",
  url: BASE_URL,
  inLanguage: "es-UY",
  potentialAction: {
    "@type": "SearchAction",
    target: `${BASE_URL}/tienda?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Fontshare — Clash Display, Cabinet Grotesk, Satoshi */}
        <link
          href="https://api.fontshare.com/v2/css?f[]=clash-display@600,700&f[]=cabinet-grotesk@500,700,800&f[]=satoshi@400,500,700&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body className="antialiased">
        <TooltipProvider>
          {children}
        </TooltipProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#ffffff",
              border: "1px solid #e8e4de",
              fontFamily: '"Satoshi", sans-serif',
              borderRadius: "0.875rem",
            },
            duration: 3000,
          }}
          visibleToasts={3}
        />
        <Analytics />
      </body>
    </html>
  );
}
