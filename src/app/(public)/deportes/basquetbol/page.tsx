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
            "El Papibasket, es un grupo de disfrute, deporte y encuentros sociales. Un gran grupo humano que sigue creciendo en todos los aspectos. Durante el año realizamos torneos internos, reuniones, asados y cerramos con una despedida del año.",
          schedule: "Martes y jueves de 20:00 a 21:00",
          location: "Polideportivo Gonzaga",
          contact: { name: "Mauricio Rinaldi", phone: "099 628 071" },
          image: "/images/deportes/PapiBasket.JPG",
        },
        {
          name: "Mami Basket",
          description:
            "En MamiBasket, nuestro objetivo es aprender, divertirnos y salir de la rutina. Cada una de nosotras enfrenta su propio desafío a su propio ritmo, porque todas somos nuevas en el deporte.",
          schedule: "Martes y jueves de 19:00 a 20:00",
          location: "Polideportivo Gonzaga",
          contact: { name: "Mónica Gómez", phone: "091 399 993" },
          image: "/images/deportes/MamiBasket.JPG",
        },
      ]}
    />
  );
}
