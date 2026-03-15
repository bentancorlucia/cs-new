import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { PageTransition } from "@/components/layout/page-transition";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:bg-bordo-800 focus:px-4 focus:py-2 focus:text-white focus:text-sm focus:font-medium focus:shadow-elevated"
      >
        Ir al contenido principal
      </a>
      <Header />
      <PageTransition>
        <main id="main-content" className="min-h-screen pt-20">{children}</main>
      </PageTransition>
      <Footer />
    </>
  );
}
