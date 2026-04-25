import { EventosClient } from "./eventos-client";

export const metadata = {
  title: "Eventos",
  description: "Eventos del Club Seminario.",
  robots: { index: false, follow: false },
};

export default function EventosPage() {
  return <EventosClient />;
}
