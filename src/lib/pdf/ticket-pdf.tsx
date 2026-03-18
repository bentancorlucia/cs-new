import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

const COLORS = {
  bordo: "#730d32",
  bordoOscuro: "#5a0a27",
  dorado: "#f7b643",
  doradoClaro: "#fdf3e0",
  fondoClaro: "#faf8f5",
  texto: "#1f1f1f",
  textoSecundario: "#6b7280",
  blanco: "#ffffff",
  grisClaro: "#f0eded",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.blanco,
    padding: 0,
    fontFamily: "Helvetica",
    position: "relative",
  },
  // Header
  header: {
    backgroundColor: COLORS.bordo,
    paddingTop: 36,
    paddingBottom: 28,
    paddingHorizontal: 48,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.blanco,
    fontFamily: "Helvetica-Bold",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  headerAccent: {
    color: COLORS.dorado,
  },
  headerSubtitle: {
    fontSize: 10,
    color: COLORS.dorado,
    letterSpacing: 3,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
  },
  // Gold accent bar
  accentBar: {
    height: 4,
    backgroundColor: COLORS.dorado,
  },
  // Main content
  content: {
    flex: 1,
    paddingHorizontal: 48,
    paddingTop: 36,
    alignItems: "center",
  },
  // Event title
  eventoTitulo: {
    fontSize: 26,
    fontWeight: "bold",
    color: COLORS.bordo,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  tipoEntrada: {
    fontSize: 12,
    color: COLORS.textoSecundario,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 28,
  },
  // Info pills row
  infoRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginBottom: 32,
  },
  infoPill: {
    backgroundColor: COLORS.fondoClaro,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: "center",
    minWidth: 120,
  },
  infoPillLabel: {
    fontSize: 8,
    color: COLORS.textoSecundario,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 3,
    fontFamily: "Helvetica-Bold",
  },
  infoPillValue: {
    fontSize: 13,
    color: COLORS.texto,
    fontFamily: "Helvetica-Bold",
  },
  // QR section
  qrWrapper: {
    alignItems: "center",
    marginBottom: 28,
  },
  qrBox: {
    backgroundColor: COLORS.blanco,
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: COLORS.grisClaro,
  },
  qrImage: {
    width: 200,
    height: 200,
    marginBottom: 16,
  },
  qrInstruction: {
    fontSize: 11,
    color: COLORS.textoSecundario,
    letterSpacing: 0.5,
  },
  // Attendee section
  attendeeSection: {
    backgroundColor: COLORS.fondoClaro,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: "center",
    marginBottom: 20,
  },
  attendeeLabel: {
    fontSize: 8,
    color: COLORS.textoSecundario,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 3,
    fontFamily: "Helvetica-Bold",
  },
  attendeeName: {
    fontSize: 15,
    color: COLORS.texto,
    fontFamily: "Helvetica-Bold",
  },
  // Counter badge
  counterBadge: {
    backgroundColor: COLORS.dorado,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginTop: 8,
  },
  counterText: {
    fontSize: 11,
    color: COLORS.bordo,
    fontFamily: "Helvetica-Bold",
  },
  // Footer
  footer: {
    backgroundColor: COLORS.bordo,
    paddingVertical: 18,
    paddingHorizontal: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: {
    fontSize: 9,
    color: COLORS.dorado,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.5,
  },
  footerInstruction: {
    fontSize: 9,
    color: COLORS.blanco,
    opacity: 0.75,
  },
});

interface TicketPDFData {
  nombreAsistente: string;
  eventoTitulo: string;
  tipoEntrada: string;
  codigos: string[];
  qrDataUrls: string[];
  eventoFecha?: string;
  eventoLugar?: string;
}

function TicketPage({
  data,
  qrDataUrl,
  index,
  total,
}: {
  data: TicketPDFData;
  qrDataUrl: string;
  index: number;
  total: number;
}) {
  return (
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          Club <Text style={styles.headerAccent}>Seminario</Text>
        </Text>
        <Text style={styles.headerSubtitle}>Entrada</Text>
      </View>

      {/* Gold accent bar */}
      <View style={styles.accentBar} />

      {/* Content */}
      <View style={styles.content}>
        {/* Event title + type */}
        <Text style={styles.eventoTitulo}>{data.eventoTitulo}</Text>
        <Text style={styles.tipoEntrada}>{data.tipoEntrada}</Text>

        {/* Info pills: fecha, lugar */}
        {(data.eventoFecha || data.eventoLugar) && (
          <View style={styles.infoRow}>
            {data.eventoFecha && (
              <View style={styles.infoPill}>
                <Text style={styles.infoPillLabel}>Fecha</Text>
                <Text style={styles.infoPillValue}>{data.eventoFecha}</Text>
              </View>
            )}
            {data.eventoLugar && (
              <View style={styles.infoPill}>
                <Text style={styles.infoPillLabel}>Lugar</Text>
                <Text style={styles.infoPillValue}>{data.eventoLugar}</Text>
              </View>
            )}
          </View>
        )}

        {/* QR Code */}
        <View style={styles.qrWrapper}>
          <View style={styles.qrBox}>
            <Image style={styles.qrImage} src={qrDataUrl} />
            <Text style={styles.qrInstruction}>Escaneá este QR para ingresar</Text>
          </View>
        </View>

        {/* Attendee */}
        <View style={styles.attendeeSection}>
          <Text style={styles.attendeeLabel}>Asistente</Text>
          <Text style={styles.attendeeName}>{data.nombreAsistente}</Text>
        </View>

        {/* Counter badge */}
        {total > 1 && (
          <View style={styles.counterBadge}>
            <Text style={styles.counterText}>
              Entrada {index + 1} de {total}
            </Text>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>clubseminario.com.uy</Text>
        <Text style={styles.footerInstruction}>
          Presentá este QR en la entrada del evento
        </Text>
      </View>
    </Page>
  );
}

function TicketDocument({ data }: { data: TicketPDFData }) {
  return (
    <Document
      title={`Entradas — ${data.eventoTitulo}`}
      author="Club Seminario"
      subject={`Entradas para ${data.eventoTitulo}`}
    >
      {data.codigos.map((codigo, i) => (
        <TicketPage
          key={codigo}
          data={data}
          qrDataUrl={data.qrDataUrls[i]}
          index={i}
          total={data.codigos.length}
        />
      ))}
    </Document>
  );
}

/**
 * Genera un PDF con las entradas (una por página) y devuelve el buffer.
 */
export async function generarTicketPDF(
  data: TicketPDFData
): Promise<Buffer> {
  const buffer = await renderToBuffer(
    <TicketDocument data={data} />
  );
  return Buffer.from(buffer);
}
