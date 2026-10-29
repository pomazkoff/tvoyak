import { canReviewPictures } from "@/lib/admin-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Оставить или убрать картиночные задания: { ids: string[], enabled: boolean }. */
export async function POST(request: Request) {
  if (!(await canReviewPictures())) {
    return Response.json({ ok: false, error: "not_host" }, { status: 401 });
  }
  let ids: string[] = [];
  let enabled: boolean | null = null;
  try {
    const body = (await request.json()) as { ids?: unknown; enabled?: unknown };
    ids = Array.isArray(body.ids)
      ? body.ids.filter(
          (id): id is string => typeof id === "string" && UUID.test(id),
        )
      : [];
    enabled = typeof body.enabled === "boolean" ? body.enabled : null;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!ids.length || enabled === null || ids.length > 500) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const { data, error } = await getServiceSupabase()
    .from("question_bank")
    .update({ enabled })
    .in("id", ids)
    .not("picture", "is", null)
    .select("id");
  if (error) {
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }
  return Response.json({ ok: true, updated: data?.length ?? 0, enabled });
}
