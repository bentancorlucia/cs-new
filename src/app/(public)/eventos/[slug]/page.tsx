import { Suspense } from "react";
import { EventoDetalleClient } from "./evento-detalle-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return {
    title: "Evento",
    description: `Detalle del evento en Club Seminario`,
    openGraph: {
      title: "Evento",
    },
  };
}

export default async function EventoDetallePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <Suspense>
      <EventoDetalleClient slug={slug} />
    </Suspense>
  );
}
