import { Suspense } from "react";
import type { Metadata } from "next";
import { HostPhoneScreen } from "@/components/host-phone-screen";
import { Opening } from "@/components/shell";

export const metadata: Metadata = {
  title: "Твояк — пульт ведущего",
  robots: { index: false, follow: false },
};

export default function HostPhonePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  return (
    <Suspense fallback={<Opening label="Открываем пульт ведущего…" />}>
      <HostPhoneLoader params={params} />
    </Suspense>
  );
}

async function HostPhoneLoader({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <HostPhoneScreen code={code} />;
}
