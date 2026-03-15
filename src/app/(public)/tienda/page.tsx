import type { Metadata } from "next";
import { TiendaClient } from "./tienda-client";

export const metadata: Metadata = {
  title: "Tienda | Club Seminario",
  description:
    "Tienda oficial de Club Seminario. Encontrá indumentaria, accesorios y más.",
};

export default function TiendaPage() {
  return <TiendaClient />;
}
