import { EventosClient } from "./eventos-client";

export const metadata = {
  title: "Eventos",
  description: "Eventos deportivos, sociales y culturales del Club Seminario. Comprá tus entradas online.",
  openGraph: {
    title: "Eventos",
    description: "Eventos deportivos, sociales y culturales del Club Seminario.",
  },
};

export default function EventosPage() {
  return <EventosClient />;
}
