import { EventoFormClient } from "@/components/eventos/evento-form-client";

export const metadata = {
  title: "Editar Evento",
};

export default async function EditarEventoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <EventoFormClient eventoId={Number(slug)} />
    </div>
  );
}
