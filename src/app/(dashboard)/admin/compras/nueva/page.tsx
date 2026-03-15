import { Suspense } from "react";
import NuevaCompraPage from "./nueva-compra-client";

export default function Page() {
  return (
    <Suspense>
      <NuevaCompraPage />
    </Suspense>
  );
}
