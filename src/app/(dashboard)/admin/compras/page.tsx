import type { Metadata } from "next";
import { Suspense } from "react";
import AdminComprasPage from "./compras-client";

export const metadata: Metadata = { title: "Compras" };

export default function Page() {
  return (
    <Suspense>
      <AdminComprasPage />
    </Suspense>
  );
}
