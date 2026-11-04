import type { Metadata } from "next";
import { PayReturn } from "@/components/billing/pay-return";

export const metadata: Metadata = {
  title: "Оплата",
  robots: { index: false, follow: false },
};

export default function PayReturnPage() {
  return <PayReturn />;
}
