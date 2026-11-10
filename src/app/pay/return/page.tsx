import type { Metadata } from "next";
import { PayReturn } from "@/components/billing/pay-return";
import { LegalFooter } from "@/components/legal-footer";

export const metadata: Metadata = {
  title: "Оплата",
  robots: { index: false, follow: false },
};

export default function PayReturnPage() {
  return (
    <>
      <PayReturn />
      <LegalFooter />
    </>
  );
}
