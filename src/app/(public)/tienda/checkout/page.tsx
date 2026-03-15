import type { Metadata } from "next";
import { CheckoutClient } from "./checkout-client";

export const metadata: Metadata = {
  title: "Checkout | Club Seminario",
  description: "Completá tu compra en la tienda de Club Seminario.",
};

export default function CheckoutPage() {
  return <CheckoutClient />;
}
