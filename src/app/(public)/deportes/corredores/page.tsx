import { Metadata } from "next";
import { SportPage } from "@/components/shared/sport-page";

export const metadata: Metadata = {
  title: "Corredores — Club Seminario",
  description:
    "Grupo de corredores del Club Seminario. De 5K al maratón. Entrenamientos en Rambla de Punta Carretas.",
};

export default function CorredoresPage() {
  return (
    <SportPage
      title="Corredores"
      description="Running grupal en la Rambla. De los 5K al maratón, el objetivo es disfrutar y lograr metas colectivas."
      heroImage="/images/deportes/Corredores.jpg"
      categories={[
        {
          name: "Corredores",
          description:
            "Grupo de running enfocado en el disfrute, la motivación y el logro de metas colectivas. Los miembros participan en distancias desde los 5K hasta el maratón.",
          schedule: "Martes y jueves a las 8:10 AM",
          location: "Mojón 7.500, Rambla de Punta Carretas",
          contact: { name: "María Victoria Pieri", phone: "099 443 230" },
          image: "/images/deportes/Corredores.jpg",
        },
      ]}
    />
  );
}
