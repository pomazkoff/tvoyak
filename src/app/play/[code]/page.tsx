import { Suspense } from "react";
import type { Metadata } from "next";
import { PlayScreen } from "@/components/play-screen";
import { Opening } from "@/components/shell";
import { normalizeRoomCode } from "@/lib/rooms/codes";
import { inviteMeta } from "@/lib/share/links";

/** Заголовок вкладки с кодом комнаты. noindex задан статически в layout.tsx. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const room = normalizeRoomCode(code);
  const share = inviteMeta(room);
  return {
    title: room ? `Комната ${room}` : "Комната",
    description: share.description,
    openGraph: {
      title: share.title,
      description: share.description,
      url: room ? `/play/${room}` : undefined,
    },
  };
}

export default function PlayPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  return (
    <Suspense fallback={<Opening label="Открываем комнату…" />}>
      <PlayLoader params={params} />
    </Suspense>
  );
}

async function PlayLoader({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PlayScreen code={code} />;
}
