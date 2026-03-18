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
  dorado: "#f7b643",
  fondoClaro: "#faf8f5",
  texto: "#1f1f1f",
  textoSecundario: "#6b7280",
  blanco: "#ffffff",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.fondoClaro,
    padding: 0,
    fontFamily: "Helvetica",
    position: "relative",
  },
  // Header bar
  header: {
    backgroundColor: COLORS.bordo,
    paddingVertical: 28,
    paddingHorizontal: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "bold",
    color: COLORS.blanco,
    fontFamily: "Helvetica-Bold",
    letterSpacing: -0.5,
  },
  headerAccent: {
    color: COLORS.dorado,
  },
  headerSubtitle: {
    fontSize: 10,
    color: COLORS.dorado,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
  },
  // Content area
  content: {
    flex: 1,
    paddingHorizontal: 40,
    paddingTop: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  // Event name
  eventoTitulo: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.bordo,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
  },
  // Ticket type
  tipoEntrada: {
    fontSize: 13,
    color: COLORS.textoSecundario,
    textAlign: "center",
    marginBottom: 24,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  // QR container
  qrContainer: {
    backgroundColor: COLORS.blanco,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
    border: `2 solid ${COLORS.bordo}`,
  },
  qrLabel: {
    fontSize: 10,
    color: COLORS.textoSecundario,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  qrImage: {
    width: 220,
    height: 220,
    marginBottom: 16,
  },
  qrCodigo: {
    fontSize: 11,
    color: COLORS.bordo,
    fontFamily: "Courier-Bold",
    letterSpacing: 0.5,
  },
  // Info section
  infoRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 32,
    marginBottom: 8,
  },
  infoItem: {
    alignItems: "center",
  },
  infoLabel: {
    fontSize: 9,
    color: COLORS.textoSecundario,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 13,
    color: COLORS.texto,
    fontFamily: "Helvetica-Bold",
  },
  // Attendee
  attendee: {
    fontSize: 14,
    color: COLORS.texto,
    textAlign: "center",
    marginBottom: 20,
  },
  attendeeName: {
    fontFamily: "Helvetica-Bold",
  },
  // Footer
  footer: {
    backgroundColor: COLORS.bordo,
    paddingVertical: 16,
    paddingHorizontal: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: {
    fontSize: 9,
    color: COLORS.dorado,
    opacity: 0.8,
  },
  footerInstruction: {
    fontSize: 9,
    color: COLORS.blanco,
    opacity: 0.7,
  },
  // Decorative line
  decorLine: {
    height: 3,
    backgroundColor: COLORS.dorado,
  },
  // Ticket counter badge
  counterBadge: {
    backgroundColor: COLORS.dorado,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  counterText: {
    fontSize: 11,
    color: COLORS.bordo,
    fontFamily: "Helvetica-Bold",
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
  codigo,
  qrDataUrl,
  index,
  total,
}: {
  data: TicketPDFData;
  codigo: string;
  qrDataUrl: string;
  index: number;
  total: number;
}) {
  return (
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            Club <Text style={styles.headerAccent}>Seminario</Text>
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.headerSubtitle}>Entrada</Text>
          {total > 1 && (
            <View style={[styles.counterBadge, { marginTop: 4 }]}>
              <Text style={styles.counterText}>
                {index + 1} de {total}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Gold accent line */}
      <View style={styles.decorLine} />

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.eventoTitulo}>{data.eventoTitulo}</Text>
        <Text style={styles.tipoEntrada}>{data.tipoEntrada}</Text>

        {/* Event info */}
        {(data.eventoFecha || data.eventoLugar) && (
          <View style={[styles.infoRow, { marginBottom: 24 }]}>
            {data.eventoFecha && (
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Fecha</Text>
                <Text style={styles.infoValue}>{data.eventoFecha}</Text>
              </View>
            )}
            {data.eventoLugar && (
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Lugar</Text>
                <Text style={styles.infoValue}>{data.eventoLugar}</Text>
              </View>
            )}
          </View>
        )}

        {/* QR Code */}
        <View style={styles.qrContainer}>
          <Text style={styles.qrLabel}>Escaneá para ingresar</Text>
          <Image style={styles.qrImage} src={qrDataUrl} />
          <Text style={styles.qrCodigo}>{codigo}</Text>
        </View>

        {/* Attendee */}
        <Text style={styles.attendee}>
          Asistente:{" "}
          <Text style={styles.attendeeName}>{data.nombreAsistente}</Text>
        </Text>
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
          codigo={codigo}
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
