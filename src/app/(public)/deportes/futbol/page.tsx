import { Metadata } from "next";
import { SportPage } from "@/components/shared/sport-page";

export const metadata: Metadata = {
  title: "Fútbol — Club Seminario",
  description:
    "Fútbol femenino, masculino y mami fútbol del Club Seminario. 10 planteles en 7 categorías.",
};

export default function FutbolPage() {
  return (
    <SportPage
      title="Fútbol"
      description="Contamos con equipos de fútbol femenino y masculino para todas las edades."
      heroImage="/images/deportes/futbol-masculino.jpg"
      categories={[
        {
          name: "Fútbol Femenino",
          description:
            "El Fútbol Femenino del Club ha crecido mucho en estos últimos años, siempre con el objetivo de competir al más alto nivel y lograr un espacio de integración y crecimiento del equipo. Contamos con dos planteles organizados según el objetivo de formación: Plantel A, que compite en la categoría C de la MGC (sábados a la tarde) y el Plantel B, que compite en la categoría E (sábados a la tarde).",
          schedule: "Lunes, martes y jueves de 19:00 a 20:30",
          location: "Parque CUPRA / Polideportivo Gonzaga",
          contact: { name: "Lucía Alvariza", phone: "095 732 333" },
          image: "/images/deportes/foto-futfem.webp",
        },
        {
          name: "Fútbol Masculino",
          description:
            "Competimos en la Liga Universitaria de Deportes en siete categorías, desde Sub 14 hasta Pre-Senior. Contamos con 10 planteles, buscando que todos tengan su lugar para disfrutar de jugar el fútbol con sus amigos.",
          schedule: "Varía según categoría",
          location: "Parque CUPRA",
          contact: { name: "Domingo Martinelli", phone: "099 613 671" },
          image: "/images/deportes/futbol-masculino.jpg",
        },
        {
          name: "Mami Fútbol",
          description:
            "A todas las que tienen muchas ganas de divertirse jugando al fútbol, a todas las que quieran encontrarse con otras mujeres que siguen aprendiendo a jugarlo y por supuesto a todas aquellas que tengan ganas de meter goles o evitarlos… las esperamos en el Mamifútbol del Club Seminario.",
          schedule: "Martes y jueves de 20:30 a 22:00",
          location: "Polideportivo Gonzaga",
          contact: { name: "Cecilia Capozzoli", phone: "099 152 362" },
          image: "/images/deportes/MamiFutbol.JPG",
        },
      ]}
    />
  );
}
