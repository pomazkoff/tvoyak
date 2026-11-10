import type { Metadata } from "next";
import { PayScreen } from "@/components/billing/pay-screen";
import { LegalFooter } from "@/components/legal-footer";

export const metadata: Metadata = {
  title: "Оплата партий",
  robots: { index: false, follow: false },
};

export default function PayPage() {
  return (
    <>
      <PayScreen />
      <LegalFooter />
    </>
  );
}
