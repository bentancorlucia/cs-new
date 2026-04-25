import { Metadata } from "next";
import { SportPage } from "@/components/shared/sport-page";

export const metadata: Metadata = {
  title: "Corredores",
  description:
    "Grupo de corredores del Club Seminario. Running grupal de 5K al maratón. Entrenamientos en la Rambla de Punta Carretas, Montevideo.",
  alternates: { canonical: "/deportes/corredores" },
  openGraph: {
    title: "Corredores — Club Seminario",
    description:
      "Running grupal en la Rambla. De los 5K al maratón, disfrutando y cumpliendo metas en grupo.",
    url: "/deportes/corredores",
    images: [{ url: "/images/deportes/Corredores.jpg", width: 1200, height: 630 }],
  },
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
            "Disfrutamos de la rambla, nos motivamos, nos acompañamos y cumplimos objetivos juntos. Lo importante es tener ganas de moverse, compartir buenos momentos. Desde 5k a Maratón, corremos todas las distancias y participamos en distintas carreras según los intereses de cada uno.",
          schedule: "Martes y jueves a las 8:10 AM",
          location: "Mojón 7.500, Rambla de Punta Carretas",
          contact: { name: "María Victoria Pieri", phone: "099 443 230" },
          image: "/images/deportes/Corredores.jpg",
        },
      ]}
    />
  );
}
