// MercadoPago API Integration (direct fetch — no SDK)

const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN!;
const MERCADOPAGO_API_URL = "https://api.mercadopago.com";

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// --- Types ---

export interface MercadoPagoItem {
  id: string;
  title: string;
  description?: string;
  quantity: number;
  currency_id: string;
  unit_price: number;
}

export interface MercadoPagoPayer {
  email: string;
  name?: string;
  surname?: string;
  phone?: {
    area_code?: string;
    number?: string;
  };
  address?: {
    street_name?: string;
    street_number?: number;
    zip_code?: string;
  };
}

export interface CreatePreferenceParams {
  items: MercadoPagoItem[];
  payer: MercadoPagoPayer;
  external_reference: string;
  back_urls: {
    success: string;
    failure: string;
    pending: string;
  };
  notification_url: string;
  auto_return?: "approved" | "all";
  statement_descriptor?: string;
}

export interface MercadoPagoPreference {
  id: string;
  init_point: string;
  sandbox_init_point: string;
}

export interface MercadoPagoPayment {
  id: number;
  status:
    | "pending"
    | "approved"
    | "authorized"
    | "in_process"
    | "in_mediation"
    | "rejected"
    | "cancelled"
    | "refunded"
    | "charged_back";
  status_detail: string;
  external_reference: string;
  transaction_amount: number;
  currency_id: string;
  payment_method_id?: string;
  payer: {
    email: string;
    identification?: {
      type: string;
      number: string;
    };
  };
  metadata?: Record<string, unknown>;
  date_approved?: string;
  date_created: string;
}

// --- API Functions ---

export async function createPreference(
  params: CreatePreferenceParams
): Promise<MercadoPagoPreference> {
  const response = await fetch(`${MERCADOPAGO_API_URL}/checkout/preferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      ...params,
      auto_return: params.auto_return || "approved",
      statement_descriptor: params.statement_descriptor || "CLUB SEMINARIO",
      payment_methods: {
        installments: 1,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error("MercadoPago preference error:", JSON.stringify(error, null, 2));
    throw new Error(error.message || "Error creating MercadoPago preference");
  }

  return response.json();
}

export async function getPayment(
  paymentId: string
): Promise<MercadoPagoPayment> {
  const response = await fetch(
    `${MERCADOPAGO_API_URL}/v1/payments/${paymentId}`,
    {
      headers: {
        Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    console.error("MercadoPago payment error:", error);
    throw new Error(error.message || "Error fetching payment");
  }

  return response.json();
}

// --- Helpers ---

export function isSandbox(): boolean {
  if (process.env.MERCADOPAGO_SANDBOX === "true") return true;
  return APP_URL.includes("localhost") || APP_URL.includes("127.0.0.1");
}

export function getCheckoutUrl(preference: MercadoPagoPreference): string {
  return isSandbox()
    ? preference.sandbox_init_point || preference.init_point
    : preference.init_point;
}

export function isPaymentApproved(payment: MercadoPagoPayment): boolean {
  return payment.status === "approved";
}

export function isPaymentPending(payment: MercadoPagoPayment): boolean {
  return payment.status === "pending" || payment.status === "in_process";
}

export function isPaymentRejected(payment: MercadoPagoPayment): boolean {
  return (
    payment.status === "rejected" ||
    payment.status === "cancelled" ||
    payment.status === "refunded" ||
    payment.status === "charged_back"
  );
}
