import type { Metadata } from "next";
import { PayScreen } from "@/components/billing/pay-screen";

export const metadata: Metadata = {
  title: "Оплата партий",
  robots: { index: false, follow: false },
};

export default function PayPage() {
  return <PayScreen />;
}
