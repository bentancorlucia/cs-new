import React from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { formatFecha, formatImporte, hoyUruguay } from "@/lib/contabilidad/formato";

/**
 * PDF de la orden de compra que se le manda al proveedor. Se arma en el
 * servidor con los datos de la base (descarga y adjunto del mail usan
 * los mismos datos: ver datosPdfOrdenCompra en lib/comercial/compras).
 */

export type OrdenCompraPdfDatos = {
  numero: string;
  fecha: string;
  estado: string;
  moneda: string;
  notas: string | null;
  aprobada_at: string | null;
  /** Plazo de pago acordado con el proveedor (0 = contado, null = sin condiciones). */
  plazo_dias: number | null;
  proveedor: {
    nombre: string;
    razon_social: string | null;
    rut: string | null;
    direccion: string | null;
    contacto_nombre: string | null;
    contacto_email: string | null;
    contacto_telefono: string | null;
  };
  items: { codigo: string | null; descripcion: string; cantidad: number; precio: number }[];
};

const CLUB = {
  nombre: "Club Seminario",
  direccion: "Soriano 1472 · Montevideo, Uruguay",
  email: "secretaria@clubseminario.com.uy",
  web: "clubseminario.com.uy",
};

const COLORS = {
  bordo: "#730d32",
  bordoOscuro: "#5a0a27",
  dorado: "#f7b643",
  doradoClaro: "#fdf3e0",
  doradoTexto: "#f5d7a3",
  fondoClaro: "#faf8f5",
  texto: "#1f1f1f",
  textoSecundario: "#6b7280",
  blanco: "#ffffff",
  grisClaro: "#ece8e6",
};

const MARGEN = 40;

const styles = StyleSheet.create({
  // El margen de arriba es para las páginas siguientes; la banda de la primera lo absorbe.
  page: { backgroundColor: COLORS.blanco, fontFamily: "Helvetica", fontSize: 9, color: COLORS.texto, paddingTop: 32, paddingBottom: 56 },
  header: {
    marginTop: -32,
    backgroundColor: COLORS.bordo,
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: MARGEN,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  marca: { flexDirection: "row", alignItems: "center", gap: 12 },
  escudo: { width: 54, height: 54 },
  clubNombre: { fontSize: 16, color: COLORS.blanco, fontFamily: "Helvetica-Bold", letterSpacing: -0.3 },
  clubDato: { fontSize: 8, color: COLORS.doradoTexto, marginTop: 2 },
  docBloque: { alignItems: "flex-end" },
  eyebrow: {
    fontSize: 8,
    color: COLORS.dorado,
    letterSpacing: 2.5,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  docNumero: { fontSize: 24, color: COLORS.blanco, fontFamily: "Helvetica-Bold", letterSpacing: -0.5 },
  docFecha: { fontSize: 9, color: COLORS.doradoTexto, marginTop: 4 },
  accentBar: { height: 3, backgroundColor: COLORS.dorado },

  fichas: { flexDirection: "row", gap: 12, paddingHorizontal: MARGEN, paddingTop: 22 },
  ficha: { flex: 1, backgroundColor: COLORS.fondoClaro, borderRadius: 8, padding: 14 },
  fichaTitulo: {
    fontSize: 7.5,
    color: COLORS.bordo,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
  },
  fichaPrincipal: { fontSize: 11.5, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  fichaLinea: { fontSize: 8.5, color: COLORS.textoSecundario, marginTop: 2 },
  par: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  parEtiqueta: { fontSize: 8.5, color: COLORS.textoSecundario },
  parValor: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },

  seccion: { paddingHorizontal: MARGEN, paddingTop: 22 },
  seccionTitulo: {
    fontSize: 7.5,
    color: COLORS.bordo,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
  },
  th: {
    flexDirection: "row",
    backgroundColor: COLORS.bordo,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  thCelda: {
    fontSize: 7,
    color: COLORS.blanco,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingHorizontal: 3,
  },
  tr: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderColor: COLORS.grisClaro,
  },
  trPar: { backgroundColor: COLORS.fondoClaro },
  celda: { fontSize: 8.5, paddingHorizontal: 3 },
  celdaSec: { fontSize: 8, color: COLORS.textoSecundario, paddingHorizontal: 3 },

  pie: { flexDirection: "row", gap: 16, paddingHorizontal: MARGEN, paddingTop: 16 },
  notas: { flex: 1 },
  caja: { backgroundColor: COLORS.doradoClaro, borderRadius: 6, padding: 10, marginBottom: 8 },
  cajaTitulo: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: COLORS.bordo, marginBottom: 3, textTransform: "uppercase", letterSpacing: 1 },
  cajaTexto: { fontSize: 8.5, lineHeight: 1.4 },
  totales: { width: 200 },
  totalLinea: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, paddingHorizontal: 10 },
  totalFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.bordo,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  totalEtiqueta: { fontSize: 8, color: COLORS.dorado, fontFamily: "Helvetica-Bold", letterSpacing: 1.2, textTransform: "uppercase" },
  totalValor: { fontSize: 14, color: COLORS.blanco, fontFamily: "Helvetica-Bold" },
  monedaNota: { fontSize: 7.5, color: COLORS.textoSecundario, textAlign: "right", marginTop: 5, paddingHorizontal: 2 },

  firmas: { flexDirection: "row", gap: 40, paddingHorizontal: MARGEN, paddingTop: 44 },
  firma: { flex: 1, borderTopWidth: 1, borderColor: COLORS.texto, paddingTop: 5 },
  firmaTexto: { fontSize: 8, color: COLORS.textoSecundario },

  footer: {
    position: "absolute",
    bottom: 20,
    left: MARGEN,
    right: MARGEN,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: COLORS.grisClaro,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerTexto: { fontSize: 7.5, color: COLORS.textoSecundario },

  marcaAgua: {
    position: "absolute",
    top: 360,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 92,
    fontFamily: "Helvetica-Bold",
    color: COLORS.bordo,
    opacity: 0.07,
    transform: "rotate(-30deg)",
  },
});

/** Columnas de la tabla de productos (% del ancho). */
const COL = { n: 6, codigo: 15, descripcion: 41, cantidad: 10, precio: 14, importe: 14 };

const MARCA_AGUA: Record<string, string> = { borrador: "BORRADOR", cancelada: "CANCELADA" };

const NOMBRE_MONEDA: Record<string, string> = {
  UYU: "pesos uruguayos (UYU)",
  USD: "dólares estadounidenses (USD)",
};

function condicionPago(plazo: number | null): string | null {
  if (plazo === null) return null;
  return plazo === 0 ? "Contado" : `Crédito a ${plazo} días`;
}

let escudo: Promise<Buffer | null> | null = null;

/** El escudo del club (public/); si no está en el bundle, el PDF sale igual sin él. */
function cargarEscudo(): Promise<Buffer | null> {
  escudo ??= readFile(path.join(process.cwd(), "public/images/escudo/logo-cs.png")).catch((e) => {
    console.error("[orden-compra-pdf] No se pudo leer el escudo:", e);
    return null;
  });
  return escudo;
}

function Par({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={styles.par}>
      <Text style={styles.parEtiqueta}>{etiqueta}</Text>
      <Text style={styles.parValor}>{valor}</Text>
    </View>
  );
}

function OrdenCompraDocumento({ o, logo }: { o: OrdenCompraPdfDatos; logo: Buffer | null }) {
  const p = o.proveedor;
  const total = o.items.reduce((s, i) => s + Math.round(i.cantidad * i.precio * 100) / 100, 0);
  const unidades = o.items.reduce((s, i) => s + i.cantidad, 0);
  const condicion = condicionPago(o.plazo_dias);
  const marcaAgua = MARCA_AGUA[o.estado];
  const contacto = [p.contacto_telefono, p.contacto_email].filter(Boolean).join(" · ");

  return (
    <Document title={`Orden de compra ${o.numero} — ${p.nombre}`} author={CLUB.nombre} subject="Orden de compra" language="es-UY">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.marca}>
            {logo && <Image style={styles.escudo} src={{ data: logo, format: "png" }} />}
            <View>
              <Text style={styles.clubNombre}>{CLUB.nombre}</Text>
              <Text style={styles.clubDato}>{CLUB.direccion}</Text>
              <Text style={styles.clubDato}>
                {CLUB.email} · {CLUB.web}
              </Text>
            </View>
          </View>
          <View style={styles.docBloque}>
            <Text style={styles.eyebrow}>Orden de compra</Text>
            <Text style={styles.docNumero}>{o.numero}</Text>
            <Text style={styles.docFecha}>Emitida el {formatFecha(o.fecha)}</Text>
          </View>
        </View>
        <View style={styles.accentBar} />

        <View style={styles.fichas} wrap={false}>
          <View style={styles.ficha}>
            <Text style={styles.fichaTitulo}>Proveedor</Text>
            <Text style={styles.fichaPrincipal}>{p.razon_social || p.nombre}</Text>
            {p.razon_social && p.razon_social !== p.nombre && <Text style={styles.fichaLinea}>{p.nombre}</Text>}
            {p.rut && <Text style={styles.fichaLinea}>RUT {p.rut}</Text>}
            {p.direccion && <Text style={styles.fichaLinea}>{p.direccion}</Text>}
            {p.contacto_nombre && <Text style={styles.fichaLinea}>At. {p.contacto_nombre}</Text>}
            {contacto && <Text style={styles.fichaLinea}>{contacto}</Text>}
          </View>
          <View style={styles.ficha}>
            <Text style={styles.fichaTitulo}>Datos de la orden</Text>
            <Par etiqueta="Número" valor={o.numero} />
            <Par etiqueta="Fecha" valor={formatFecha(o.fecha)} />
            <Par etiqueta="Moneda" valor={o.moneda} />
            {condicion && <Par etiqueta="Condición de pago" valor={condicion} />}
            {o.aprobada_at && <Par etiqueta="Aprobada" valor={formatFecha(o.aprobada_at)} />}
          </View>
        </View>

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Detalle</Text>
          <View style={styles.th} fixed>
            <Text style={[styles.thCelda, { width: `${COL.n}%` }]}>#</Text>
            <Text style={[styles.thCelda, { width: `${COL.codigo}%` }]}>Código</Text>
            <Text style={[styles.thCelda, { width: `${COL.descripcion}%` }]}>Descripción</Text>
            <Text style={[styles.thCelda, { width: `${COL.cantidad}%`, textAlign: "right" }]}>Cant.</Text>
            <Text style={[styles.thCelda, { width: `${COL.precio}%`, textAlign: "right" }]}>Precio unit.</Text>
            <Text style={[styles.thCelda, { width: `${COL.importe}%`, textAlign: "right" }]}>Importe</Text>
          </View>
          {o.items.map((i, n) => (
            <View key={n} style={[styles.tr, n % 2 === 1 ? styles.trPar : {}]} wrap={false}>
              <Text style={[styles.celdaSec, { width: `${COL.n}%` }]}>{n + 1}</Text>
              <Text style={[styles.celdaSec, { width: `${COL.codigo}%` }]}>{i.codigo ?? "—"}</Text>
              <Text style={[styles.celda, { width: `${COL.descripcion}%` }]}>{i.descripcion}</Text>
              <Text style={[styles.celda, { width: `${COL.cantidad}%`, textAlign: "right" }]}>{i.cantidad}</Text>
              <Text style={[styles.celda, { width: `${COL.precio}%`, textAlign: "right" }]}>{formatImporte(i.precio)}</Text>
              <Text style={[styles.celda, { width: `${COL.importe}%`, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>
                {formatImporte(i.cantidad * i.precio)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.pie} wrap={false}>
          <View style={styles.notas}>
            {o.notas && (
              <View style={styles.caja}>
                <Text style={styles.cajaTitulo}>Observaciones</Text>
                <Text style={styles.cajaTexto}>{o.notas}</Text>
              </View>
            )}
            <View style={[styles.caja, { backgroundColor: COLORS.fondoClaro }]}>
              <Text style={styles.cajaTitulo}>Importante</Text>
              <Text style={styles.cajaTexto}>
                Indicar el número {o.numero} en el remito y en la factura. Ante cualquier diferencia de precio, cantidad o
                plazo de entrega, comunicarse antes de despachar.
              </Text>
            </View>
          </View>
          <View style={styles.totales}>
            <View style={styles.totalLinea}>
              <Text style={styles.parEtiqueta}>Líneas</Text>
              <Text style={styles.parValor}>{o.items.length}</Text>
            </View>
            <View style={styles.totalLinea}>
              <Text style={styles.parEtiqueta}>Unidades</Text>
              <Text style={styles.parValor}>{unidades}</Text>
            </View>
            <View style={styles.totalFinal}>
              <Text style={styles.totalEtiqueta}>Total</Text>
              <Text style={styles.totalValor}>{formatImporte(total, o.moneda)}</Text>
            </View>
            <Text style={styles.monedaNota}>Importes en {NOMBRE_MONEDA[o.moneda] ?? o.moneda}</Text>
          </View>
        </View>

        <View style={styles.firmas} wrap={false}>
          <View style={styles.firma}>
            <Text style={styles.firmaTexto}>Autorizado por — {CLUB.nombre}</Text>
          </View>
          <View style={styles.firma}>
            <Text style={styles.firmaTexto}>Recibido por — {p.nombre}</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerTexto}>
            {CLUB.nombre} · Orden de compra {o.numero} · Generada el {formatFecha(hoyUruguay())}
          </Text>
          <Text style={styles.footerTexto} render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`} />
        </View>

        {/* Al final, para que quede por encima de las filas de la tabla. */}
        {marcaAgua && (
          <Text style={styles.marcaAgua} fixed>
            {marcaAgua}
          </Text>
        )}
      </Page>
    </Document>
  );
}

export async function renderOrdenCompraPdf(datos: OrdenCompraPdfDatos): Promise<Buffer> {
  const logo = await cargarEscudo();
  return await renderToBuffer(<OrdenCompraDocumento o={datos} logo={logo} />);
}

/** "orden-compra-OC-00012-distribuidora-sur.pdf" */
export function nombreArchivoOrdenCompra(d: Pick<OrdenCompraPdfDatos, "numero" | "proveedor">): string {
  const slug = d.proveedor.nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `orden-compra-${d.numero}${slug ? `-${slug}` : ""}.pdf`;
}
