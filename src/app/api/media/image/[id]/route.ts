import { getServiceSupabase } from "@/lib/supabase/admin";
import { isAllowedImageSource, isQuestionId } from "@/lib/media/image-proxy";

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
  try {
    const { data } = await getServiceSupabase()
      .from("questions")
      .select("image_url, status")
      .eq("id", id)
      .maybeSingle();
    if (!data || data.status === "hidden") return notFound();
    source = data.image_url as string | null;
  } catch {
    return new Response("not configured", { status: 500 });
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
