import { connection } from "next/server";
import { syncPayment, userFromRequest } from "@/lib/billing/server";
import { paymentsConfigured } from "@/lib/billing/yookassa";
import { getServiceSupabase } from "@/lib/supabase/admin";

const REF = /^[0-9a-f-]{36}$/i;

/** Экран возврата спрашивает о своём платеже; если вебхук потерялся — догоняем. */
export async function GET(request: Request) {
  await connection();
  const ref = new URL(request.url).searchParams.get("ref") ?? "";
  if (!REF.test(ref))
    return Response.json({ error: "bad_ref" }, { status: 400 });
  const supabase = getServiceSupabase();
  const user = await userFromRequest(supabase, request);
  if (!user) return Response.json({ error: "login_required" }, { status: 401 });
  const { data: row } = await supabase
    .from("host_payments")
    .select("id, user_id, product, status, yookassa_id, credited_at")
    .eq("id", ref)
    .maybeSingle();
  if (!row || row.user_id !== user.id) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  let status = row.credited_at ? "succeeded" : (row.status as string);
  if (!row.credited_at && row.yookassa_id && paymentsConfigured()) {
    try {
      status = await syncPayment(supabase, row.yookassa_id as string);
    } catch (e) {
      console.error("billing_status_sync", (e as Error).message);
    }
  }
  return Response.json({ status, product: row.product });
}
