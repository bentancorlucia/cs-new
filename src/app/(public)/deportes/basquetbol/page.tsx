import { Metadata } from "next";
import { SportPage } from "@/components/shared/sport-page";

export const metadata: Metadata = {
  title: "Básquetbol",
  description:
    "Básquetbol en Club Seminario: Basket Universitario, Papi Basket y Mami Basket en el Polideportivo Gonzaga, Montevideo. Horarios, categorías y contacto.",
  alternates: { canonical: "/deportes/basquetbol" },
  openGraph: {
    title: "Básquetbol — Club Seminario",
    description:
      "Basket Universitario, Papi Basket y Mami Basket en el Polideportivo Gonzaga.",
    url: "/deportes/basquetbol",
    images: [{ url: "/images/deportes/PapiBasket.JPG", width: 1200, height: 630 }],
  },
};

export default function BasquetbolPage() {
  return (
    <SportPage
      title="Básquetbol"
      description="Compartí la cancha con nosotros. Básquetbol para hombres y mujeres en el Polideportivo Gonzaga."
      heroImage="/images/deportes/PapiBasket.JPG"
      categories={[
        {
          name: "Basket Universitario",
          description:
            "Entrenamos durante la semana para representar al club en la Liga Universitaria de Basketball. Somos un grupo con ganas de competir y mejorar, donde lo que importa es el compromiso y las ganas de jugar.",
          schedule: "Lunes y jueves de 21:00 a 22:00",
          location: "Gonzaga",
          contact: { name: "Juan Abou-Nigm", phone: "095 050 431" },
          image: "/images/deportes/basket-universitario.jpeg",
        },
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
