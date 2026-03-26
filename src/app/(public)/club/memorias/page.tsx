import { Metadata } from "next";
import { MemoriasClient } from "./memorias-client";

export const metadata: Metadata = {
  title: "Memorias",
  description:
    "Memorias anuales del Club Seminario (2014–2024). Descargá los informes de cada año.",
};

export default function MemoriasPage() {
  return <MemoriasClient />;
}
