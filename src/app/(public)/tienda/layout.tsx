import { WhatsAppFlotante } from "@/components/tienda/whatsapp-flotante";

/**
 * Tienda pública + botón de consultas por WhatsApp. El botón lee el número
 * en el navegador (RPC pública): no vuelve dinámicas las páginas.
 */
export default function TiendaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <WhatsAppFlotante />
    </>
  );
}
