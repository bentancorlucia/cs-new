import { Metadata } from "next";
import { DirectivaClient } from "./directiva-client";

export const metadata: Metadata = {
  title: "Directiva — Club Seminario",
  description:
    "Comisión Directiva y Comisión Fiscal del Club Seminario. Conocé a quienes lideran nuestro club.",
};

export default function DirectivaPage() {
  return <DirectivaClient />;
}
