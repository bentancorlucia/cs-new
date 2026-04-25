import { Metadata } from "next";
import { DocumentPageClient } from "@/components/shared/document-page";

export const metadata: Metadata = {
  title: "Reglamento",
  description:
    "Reglamento interno del Club Seminario: normas de convivencia, uso de instalaciones y participación en actividades deportivas.",
  alternates: { canonical: "/club/reglamento" },
  openGraph: {
    title: "Reglamento — Club Seminario",
    description: "Reglamento interno del Club Seminario — documento oficial.",
    url: "/club/reglamento",
  },
};

export default function ReglamentoPage() {
  return (
    <DocumentPageClient
      title="Reglamento"
      eyebrow="El Club"
      description="El reglamento interno del Club Seminario establece las normas de convivencia, uso de instalaciones y participación en actividades deportivas."
      documentLabel="Reglamento del Club Seminario"
      heroImage="/images/club/foto-reglamento.webp"
      pdfUrl="/documentos/Reglamento - Club Seminario.pdf"
    />
  );
}
