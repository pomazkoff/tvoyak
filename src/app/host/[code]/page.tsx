import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { HostScreen } from "@/components/host-screen";
import { Opening } from "@/components/shell";
import { originFromHeaders } from "@/lib/http/origin";
import { normalizeRoomCode } from "@/lib/rooms/codes";

/** Заголовок вкладки с кодом комнаты. noindex задан статически в layout.tsx. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const room = normalizeRoomCode(code);
  return {
    title: room ? `Табло комнаты ${room}` : "Табло комнаты",
  };
}

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
