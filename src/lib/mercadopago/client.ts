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
