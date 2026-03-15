import QRCode from "qrcode";

/**
 * Genera un data URL del QR para una entrada.
 * El código embebido es el UUID de la entrada.
 */
export async function generarQREntrada(codigo: string): Promise<string> {
  const qrDataUrl = await QRCode.toDataURL(codigo, {
    width: 400,
    margin: 2,
    color: {
      dark: "#730d32", // bordó del club
      light: "#ffffff",
    },
    errorCorrectionLevel: "H",
  });

  return qrDataUrl;
}

/**
 * Genera un buffer PNG del QR (para guardar en Storage).
 */
export async function generarQRBuffer(codigo: string): Promise<Buffer> {
  return QRCode.toBuffer(codigo, {
    width: 400,
    margin: 2,
    color: {
      dark: "#730d32",
      light: "#ffffff",
    },
    errorCorrectionLevel: "H",
  });
}
