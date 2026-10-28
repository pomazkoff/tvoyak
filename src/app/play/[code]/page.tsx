import { Suspense } from "react";
import { PlayScreen } from "@/components/play-screen";
import { Opening } from "@/components/shell";

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
