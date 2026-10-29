import { Suspense } from "react";
import { connection } from "next/server";
import { AdminLogin } from "@/components/admin-login";
import {
  PictureReview,
  type ReviewItem,
} from "@/components/admin/picture-review";
import { Shell } from "@/components/shell";
import { canReviewPictures } from "@/lib/admin-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { PICTURE_FORMATS, isPictureFormat } from "@/lib/pictures/types";

export default function PictureReviewPage() {
  return (
    <Suspense
      fallback={
        <Shell width="max-w-6xl">
          <p className="text-muted">Открываем задания…</p>
        </Shell>
      }
    >
      <ReviewBody />
    </Suspense>
  );
}

/** Что из picture_spec нужно эффекту (без содержимого ребуса). */
function fxOf(spec: unknown): Record<string, unknown> | null {
  if (!spec || typeof spec !== "object") return null;
  const rest: Record<string, unknown> = {
    ...(spec as Record<string, unknown>),
  };
  for (const key of ["parts", "lines", "base", "odd"]) delete rest[key];
  return rest;
}

async function ReviewBody() {
  await connection();
  if (!process.env.ADMIN_TOKEN && !process.env.ADMIN_REVIEW_TOKEN) {
    return (
      <Shell width="max-w-xl">
        <p>Задайте ADMIN_TOKEN в окружении сервера.</p>
      </Shell>
    );
  }
  if (!(await canReviewPictures())) {
    return (
      <Shell width="max-w-xl">
        <AdminLogin title="Картиночные задания" />
      </Shell>
    );
  }

  const { data, error } = await getServiceSupabase()
    .from("question_bank")
    .select(
      "id, category, prompt, answer, variants, picture, picture_spec, reveal_seconds, image_url, image_credit, image_license, image_page, enabled",
    )
    .not("picture", "is", null)
    .order("category")
    .order("prompt")
    .limit(2000);
  if (error) {
    return (
      <Shell width="max-w-xl">
        <p>Не удалось загрузить задания: {error.message}</p>
      </Shell>
    );
  }

  const order = new Map(
    PICTURE_FORMATS.map((format, index) => [format, index]),
  );
  const items: ReviewItem[] = (data ?? [])
    .filter((row) => isPictureFormat(row.picture))
    .map((row) => ({
      id: row.id as string,
      category: row.category as string,
      prompt: row.prompt as string,
      answer: row.answer as string,
      variants: (row.variants as string[] | null) ?? [],
      picture: row.picture as ReviewItem["picture"],
      fx: fxOf(row.picture_spec),
      reveal_seconds: (row.reveal_seconds as number | null) ?? null,
      image_credit: (row.image_credit as string | null) ?? null,
      image_license: (row.image_license as string | null) ?? null,
      image_page: (row.image_page as string | null) ?? null,
      enabled: row.enabled !== false,
    }))
    .sort(
      (a, b) =>
        (order.get(a.picture) ?? 0) - (order.get(b.picture) ?? 0) ||
        a.prompt.localeCompare(b.prompt, "ru", { numeric: true }),
    );

  return (
    <Shell width="max-w-6xl">
      <PictureReview initial={items} />
    </Shell>
  );
}
