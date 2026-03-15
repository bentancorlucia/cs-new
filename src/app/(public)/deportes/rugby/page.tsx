import { Metadata } from "next";
import { SportPage } from "@/components/shared/sport-page";

export const metadata: Metadata = {
  title: "Rugby — Club Seminario",
  description:
    "Rugby del Club Seminario. Categorías M19, Intermedia y Primera en la Unión de Rugby del Uruguay.",
};

export default function RugbyPage() {
  return (
    <SportPage
      title="Rugby"
      description="Compitiendo en la Unión de Rugby del Uruguay. Para jóvenes que quieren seguir disfrutando del deporte con amigos al salir del Colegio."
      heroImage="/images/deportes/Rugby.jpg"
      categories={[
        {
          name: "Rugby",
          description:
            "Compite en la Unión de Rugby del Uruguay en tres niveles: M19, Intermedia y Primera. La misión es permitir a los jóvenes seguir disfrutando del deporte con sus amigos.",
          schedule: "Martes y jueves de 20:00 a 22:00",
          location: "Parque CUPRA",
          contact: { name: "Julio Gutiérrez", phone: "099 606 827" },
          image: "/images/deportes/Rugby.jpg",
        },
      ]}
    />
  );
}
