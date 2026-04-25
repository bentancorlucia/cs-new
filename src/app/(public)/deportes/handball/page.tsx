import { Metadata } from "next";
import { SportPage } from "@/components/shared/sport-page";

export const metadata: Metadata = {
  title: "Handball",
  description:
    "Handball femenino, masculino y Mami Handball del Club Seminario. Competimos en la Superliga ACB. Entrenamientos en Parque Loyola y Polideportivo Gonzaga.",
  alternates: { canonical: "/deportes/handball" },
  openGraph: {
    title: "Handball — Club Seminario",
    description:
      "Equipos de handball femenino, masculino y Mami Handball compitiendo en la Liga ACB.",
    url: "/deportes/handball",
    images: [{ url: "/images/deportes/hb-femenino.jpg", width: 1200, height: 630 }],
  },
};

export default function HandballPage() {
  return (
    <SportPage
      title="Handball"
      description="Handball femenino, masculino y mami handball del Club Seminario. Horarios y contacto."
      heroImage="/images/deportes/hb-femenino.jpg"
      categories={[
        {
          name: "Handball Femenino",
          description:
            "Competimos en la liga ACB, en la categoría Mayores A. El plantel esta compuesto mayoritariamente por exalumnas, aunque no es excluyente para formar parte del equipo. Todas las jugadoras cuentan con experiencia previa en el deporte.",
          schedule: "Lunes 19:45–21:30 / Miércoles 19:45–21:00",
          location: "Parque Loyola",
          contact: { name: "Agustina Olivera", phone: "099 625 705" },
          image: "/images/deportes/hb-femenino.jpg",
        },
        {
          name: "Handball Masculino",
          description:
            "Competimos en la Superliga de ACB, los partidos son los sábados. Las edades de los jugadores son muy variadas pero todos contamos con experiencia previa en el deporte. No es un requisito excluyente ser exalumno del Colegio para formar parte del plantel.",
          schedule: "Martes y jueves de 20:00 a 21:30",
          location: "Parque Loyola",
          contact: { name: "Facundo Domínguez", phone: "091 075 988" },
          image: "/images/deportes/hb-masculino.jpg",
        },
        {
          name: "Mami Handball",
          description:
            "El objetivo principal es seguir compitiendo y disfrutando del deporte que más nos gusta. Competimos en ADIC y en la Liga ACB. Los partidos son cada 15 días y pueden participar exalumnas, madres y funcionarias del Colegio.",
          schedule: "Martes y jueves de 19:15 a 20:30",
          location: "Polideportivo Gonzaga",
          contact: { name: "Graciela Palacios", phone: "097 300 320" },
          image: "/images/deportes/MamiHB.JPG",
        },
      ]}
    />
  );
}
