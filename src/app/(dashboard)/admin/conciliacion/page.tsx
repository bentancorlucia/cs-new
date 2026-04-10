import type { Metadata } from "next";
import { Suspense } from "react";
import ConciliacionTiendaClient from "./conciliacion-client";

export const metadata: Metadata = {
  title: "Conciliación - Tienda",
};

export default function ConciliacionTiendaPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 lg:p-8 space-y-6">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
        </div>
      }
    >
      <ConciliacionTiendaClient />
    </Suspense>
  );
}
