import { getServiceSupabase } from "@/lib/supabase/admin";
import { isAllowedImageSource, isQuestionId } from "@/lib/media/image-proxy";
import { buildPictureSvg } from "@/lib/pictures/svg";
import { GENERATED_FORMATS, isPictureFormat } from "@/lib/pictures/types";

// Игрокам отдаём картинку по id вопроса: исходное имя файла
// (например, Statue_of_Liberty.jpg) выдавало бы ответ.
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const notFound = () =>
    new Response("not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  if (!isQuestionId(id)) return notFound();

  let source: string | null = null;
  let picture: unknown = null;
  let spec: unknown = null;
  try {
    const { data } = await getServiceSupabase()
      .from("questions")
      .select("image_url, status, picture, picture_spec")
      .eq("id", id)
      .maybeSingle();
    if (!data || data.status === "hidden") return notFound();
    source = data.image_url as string | null;
    picture = data.picture;
    spec = data.picture_spec;
  } catch {
    return new Response("not configured", { status: 500 });
  }

  // Ребус, эмодзи-шифр и «найди лишнее» собираем сами из эмодзи Twemoji.
  if (isPictureFormat(picture) && GENERATED_FORMATS.includes(picture) && spec) {
    const svg = await buildPictureSvg(picture, spec).catch(() => null);
    if (!svg) {
      return new Response("render failed", {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "private, max-age=86400",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (!isAllowedImageSource(source)) return notFound();

  const upstream = await fetch(source as string, {
    headers: { "User-Agent": "TvoyakQuiz/1.0 (party quiz; image proxy)" },
    redirect: "follow",
  }).catch(() => null);
  if (!upstream?.ok || !upstream.body) {
    return new Response("upstream failed", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const type = upstream.headers.get("content-type") ?? "image/jpeg";
  if (!type.startsWith("image/")) return notFound();
  return new Response(upstream.body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": 'inline; filename="question.jpg"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
