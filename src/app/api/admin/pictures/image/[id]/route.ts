import { canReviewPictures } from "@/lib/admin-auth";
import {
  isAllowedImageSource,
  isQuestionId,
  isSelfHostedImage,
} from "@/lib/media/image-proxy";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { buildPictureSvg } from "@/lib/pictures/svg";
import { GENERATED_FORMATS, isPictureFormat } from "@/lib/pictures/types";

/** Картинка задания из банка целиком — для страницы ревью. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const fail = (status: number, text: string) =>
    new Response(text, { status, headers: { "Cache-Control": "no-store" } });
  if (!(await canReviewPictures())) return fail(401, "not allowed");
  const { id } = await context.params;
  if (!isQuestionId(id)) return fail(404, "not found");

  const { data } = await getServiceSupabase()
    .from("question_bank")
    .select("image_url, picture, picture_spec")
    .eq("id", id)
    .maybeSingle();
  if (!data || !isPictureFormat(data.picture)) return fail(404, "not found");

  if (GENERATED_FORMATS.includes(data.picture) && data.picture_spec) {
    const svg = await buildPictureSvg(data.picture, data.picture_spec).catch(
      () => null,
    );
    if (!svg) return fail(502, "render failed");
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "private, max-age=3600",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  const source = data.image_url as string | null;
  if (isSelfHostedImage(source)) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: new URL(source as string, request.url).toString(),
        "Cache-Control": "private, max-age=3600",
      },
    });
  }
  if (!isAllowedImageSource(source)) return fail(404, "not found");
  const upstream = await fetch(source as string, {
    headers: { "User-Agent": "TvoyakQuiz/1.0 (party quiz; image proxy)" },
    redirect: "follow",
  }).catch(() => null);
  if (!upstream?.ok || !upstream.body) return fail(502, "upstream failed");
  const type = upstream.headers.get("content-type") ?? "image/jpeg";
  if (!type.startsWith("image/")) return fail(404, "not found");
  return new Response(upstream.body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
