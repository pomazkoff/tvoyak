import { Suspense } from "react";
import { headers } from "next/headers";
import { HostScreen } from "@/components/host-screen";
import { Opening } from "@/components/shell";
import { originFromHeaders } from "@/lib/http/origin";

export default function HostPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  return (
    <Suspense fallback={<Opening label="Открываем комнату…" />}>
      <HostLoader params={params} />
    </Suspense>
  );
}

async function HostLoader({ params }: { params: Promise<{ code: string }> }) {
  const [{ code }, headerList] = await Promise.all([params, headers()]);
  return <HostScreen code={code} origin={originFromHeaders(headerList)} />;
}
