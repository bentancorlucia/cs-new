import { Suspense } from "react";
import AdminComprasPage from "./compras-client";

export default function Page() {
  return (
    <Suspense>
      <AdminComprasPage />
    </Suspense>
  );
}
