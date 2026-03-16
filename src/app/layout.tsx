import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://clubseminario.com.uy";

export const metadata: Metadata = {
  title: {
    default: "Club Seminario",
    template: "%s | Club Seminario",
  },
  description:
    "Club deportivo, social y cultural de la comunidad jesuita en Uruguay. Fundado el 13 de mayo de 2010.",
  metadataBase: new URL(BASE_URL),
  openGraph: {
    type: "website",
    locale: "es_UY",
    siteName: "Club Seminario",
    title: "Club Seminario",
    description:
      "Club deportivo, social y cultural de la comunidad jesuita en Uruguay.",
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
    title: "Club Seminario",
    description:
      "Club deportivo, social y cultural de la comunidad jesuita en Uruguay.",
    images: ["/images/og-default.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#730d32",
  width: "device-width",
  initialScale: 1,
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
      </body>
    </html>
  );
}
