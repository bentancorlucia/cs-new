import { Metadata } from "next";
import { SportPage } from "@/components/shared/sport-page";

export const metadata: Metadata = {
  title: "Básquetbol — Club Seminario",
  description:
    "Papi Basket y Mami Basket del Club Seminario. Horarios, categorías y contacto.",
};

export default function BasquetbolPage() {
  return (
    <SportPage
      title="Básquetbol"
      description="Compartí la cancha con nosotros. Básquetbol para hombres y mujeres en el Polideportivo Gonzaga."
      heroImage="/images/deportes/PapiBasket.JPG"
      categories={[
        {
          name: "Papi Basket",
          description:
            "Un grupo para disfrutar, hacer deporte y compartir socialmente. El programa enfatiza el crecimiento en múltiples dimensiones. Torneos internos, encuentros y asados.",
          schedule: "Martes y jueves de 20:00 a 21:00",
          location: "Polideportivo Gonzaga",
          contact: { name: "Mauricio Rinaldi", phone: "099 628 071" },
          image: "/images/deportes/PapiBasket.JPG",
        },
        {
          name: "Mami Basket",
          description:
            "Programa femenino para aprender, divertirse y salir de la rutina. Bienvenidas quienes se inician en el básquetbol, avanzando cada una a su ritmo.",
          schedule: "Martes y jueves de 19:00 a 20:00",
          location: "Polideportivo Gonzaga",
          contact: { name: "Mónica Gómez", phone: "091 399 993" },
          image: "/images/deportes/MamiBasket.JPG",
        },
      ]}
    />
  );
}
