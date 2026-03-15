import type { Metadata } from "next";
import { CarritoClient } from "./carrito-client";

export const metadata: Metadata = {
  title: "Carrito | Club Seminario",
};

export default function CarritoPage() {
  return <CarritoClient />;
}
