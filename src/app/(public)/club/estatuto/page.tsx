import { Metadata } from "next";
import { DocumentPageClient } from "@/components/shared/document-page";

export const metadata: Metadata = {
  title: "Estatuto — Club Seminario",
  description:
    "Estatuto del Club Seminario. Consultá el documento completo contactando a secretaría.",
};

export default function EstatutoPage() {
  return (
    <DocumentPageClient
      title="Estatuto"
      eyebrow="El Club"
      description="El estatuto del Club Seminario define los principios fundacionales, la estructura organizativa y las normas que rigen nuestra institución."
      documentLabel="Estatuto del Club Seminario"
      heroImage="/images/club/foto-estatuto.webp"
      pdfUrl="/documentos/Estatutos - Club Seminario.pdf"
    />
  );
}
