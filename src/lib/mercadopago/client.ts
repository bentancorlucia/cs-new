import { MercadoPagoConfig, Preference, Payment } from "mercadopago";

function getClient() {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN is not set");
  }
  return new MercadoPagoConfig({ accessToken });
}

let _preferenceClient: Preference | null = null;
let _paymentClient: Payment | null = null;

export const preferenceClient = new Proxy({} as Preference, {
  get(_, prop) {
    if (!_preferenceClient) _preferenceClient = new Preference(getClient());
    return (_preferenceClient as any)[prop];
  },
});

export const paymentClient = new Proxy({} as Payment, {
  get(_, prop) {
    if (!_paymentClient) _paymentClient = new Payment(getClient());
    return (_paymentClient as any)[prop];
  },
});

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * Determina si estamos en modo sandbox.
 * Se activa con MERCADOPAGO_SANDBOX=true o cuando APP_URL apunta a localhost.
 */
export function isSandbox(): boolean {
  if (process.env.MERCADOPAGO_SANDBOX === "true") return true;
  return APP_URL.includes("localhost") || APP_URL.includes("127.0.0.1");
}

/**
 * Devuelve la URL de checkout correcta según el entorno (sandbox o producción).
 */
export function getCheckoutUrl(preference: {
  init_point?: string;
  sandbox_init_point?: string;
}): string {
  if (isSandbox()) {
    return preference.sandbox_init_point || preference.init_point || "";
  }
  return preference.init_point || "";
}
