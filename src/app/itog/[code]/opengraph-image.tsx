import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { ogFonts } from "@/app/_og/fonts";
import { pendingResultImage, resultImage } from "@/lib/share/images";
import { loadShareResult } from "@/lib/share/load-result";

export const alt = "Итог вечера в Твояке";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await connection();
  const { code } = await params;
  const result = await loadShareResult(code);
  const element =
    result.state === "finished"
      ? resultImage(result, "og")
      : pendingResultImage();
  return new ImageResponse(element, {
    ...size,
    fonts: await ogFonts(),
  });
}
