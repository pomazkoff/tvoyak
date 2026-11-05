import { connection } from "next/server";
/**
 * Уведомления ЮKassa. Как в бюро: телу не верим (уведомления не подписаны),
 * берём из него только id платежа и перечитываем статус через API.
 * Отвечаем 200 на всё разобранное — иначе ЮKassa будет повторять сутками.
 */
import { syncPayment } from "@/lib/billing/server";
import { isYookassaId, paymentsConfigured } from "@/lib/billing/yookassa";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  await connection();
  if (!paymentsConfigured()) return new Response(null, { status: 200 });
  let id: unknown;
  try {
    id = ((await request.json()) as { object?: { id?: unknown } }).object?.id;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!isYookassaId(id)) return new Response(null, { status: 400 });
  try {
    const supabase = getServiceSupabase();
    // Незнакомый платёж — не наш, к ЮKassa не ходим.
    const { data } = await supabase
      .from("host_payments")
      .select("id")
      .eq("yookassa_id", id)
      .maybeSingle();
    if (!data) return new Response(null, { status: 200 });
    await syncPayment(supabase, id);
  } catch (e) {
    console.error("billing_webhook", (e as Error).message);
  }
  return new Response(null, { status: 200 });
}
