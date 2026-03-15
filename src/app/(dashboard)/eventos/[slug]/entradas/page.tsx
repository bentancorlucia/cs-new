import { EntradasEventoClient } from "./entradas-evento-client";

export const metadata = {
  title: "Entradas del Evento — Panel Admin",
};

export default async function EntradasEventoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <EntradasEventoClient eventoId={Number(slug)} />;
}
