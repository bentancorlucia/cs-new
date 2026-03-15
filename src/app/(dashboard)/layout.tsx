import { Sidebar } from "@/components/layout/sidebar";
import { PageTransition } from "@/components/layout/page-transition";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-fondo lg:flex">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <PageTransition>
          <main className="min-h-[calc(100vh-3.5rem)] lg:min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8 xl:px-12">
            <div className="mx-auto w-full max-w-[1400px]">
              {children}
            </div>
          </main>
        </PageTransition>
      </div>
    </div>
  );
}
