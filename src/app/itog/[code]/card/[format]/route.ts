import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { ogFonts } from "@/app/_og/fonts";
import { CARD_SIZE, resultImage, type CardKind } from "@/lib/share/images";
import { loadShareResult } from "@/lib/share/load-result";

function kindOf(value: string): CardKind | null {
  if (value === "stories" || value === "square") return value;
  return null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string; format: string }> },
) {
  await connection();
  const { code, format } = await context.params;
  const kind = kindOf(format);
  if (!kind) return new Response("Неизвестный формат", { status: 404 });
  const result = await loadShareResult(code);
  if (result.state !== "finished") {
    return new Response("Итог ещё не готов", { status: 404 });
  }
  return new ImageResponse(resultImage(result, kind), {
    ...CARD_SIZE[kind],
    fonts: await ogFonts(),
    headers: {
      "Cache-Control": "public, max-age=120",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
