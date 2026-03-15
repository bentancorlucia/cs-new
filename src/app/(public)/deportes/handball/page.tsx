import { Metadata } from "next";
import { SportPage } from "@/components/shared/sport-page";

export const metadata: Metadata = {
  title: "Handball — Club Seminario",
  description:
    "Handball femenino, masculino y mami handball del Club Seminario. Horarios y contacto.",
};

export default function HandballPage() {
  return (
    <SportPage
      title="Handball"
      description="Tres equipos compitiendo en ligas ACB y ADIC. Handball para todos los niveles."
      heroImage="/images/deportes/hb-femenino.jpg"
      categories={[
        {
          name: "Handball Femenino",
          description:
            "Compiten en la liga ACB, categoría Mayores A. Equipo compuesto principalmente por ex alumnas con experiencia deportiva previa.",
          schedule: "Lunes 19:45–21:30 / Miércoles 19:45–21:00",
          location: "Parque Loyola",
          contact: { name: "Agustina Olivera", phone: "099 625 705" },
          image: "/images/deportes/hb-femenino.jpg",
        },
        {
          name: "Handball Masculino",
          description:
            "Compiten en la Superliga de ACB con partidos los sábados. Diversos rangos de edad y experiencia. No es necesario ser ex alumno.",
          schedule: "Martes y jueves de 20:00 a 21:30",
          location: "Parque Loyola",
          contact: { name: "Facundo Domínguez", phone: "091 075 988" },
          image: "/images/deportes/hb-masculino.jpg",
        },
        {
          name: "Mami Handball",
          description:
            "Compiten en ADIC y ACB Liga con partidos cada 15 días. Pueden participar ex alumnas, madres y personal del colegio.",
          schedule: "Martes y jueves de 19:15 a 20:30",
          location: "Polideportivo Gonzaga",
          contact: { name: "Graciela Palacios", phone: "097 300 320" },
          image: "/images/deportes/MamiHB.JPG",
        },
      ]}
    />
  );
}
