import { EventoFormClient } from "@/components/eventos/evento-form-client";

export const metadata = {
  title: "Crear Evento — Panel Admin",
};

export default function CrearEventoPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <EventoFormClient />
    </div>
  );
}
