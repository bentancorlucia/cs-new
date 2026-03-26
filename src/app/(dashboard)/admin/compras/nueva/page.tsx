import type { Metadata } from "next";
import { Suspense } from "react";
import NuevaCompraPage from "./nueva-compra-client";

export const metadata: Metadata = { title: "Nueva Compra" };

export default function Page() {
  return (
    <Suspense>
      <NuevaCompraPage />
    </Suspense>
  );
}
