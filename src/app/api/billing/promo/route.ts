import { connection } from "next/server";
import { paywallEnabled } from "@/lib/billing/config";
import { isProductId } from "@/lib/billing/products";
import { applyPromo, promoRateOk, userFromRequest } from "@/lib/billing/server";
import { getServiceSupabase } from "@/lib/supabase/admin";

/**
 * POST {code, product?, apply?}
 * Без apply — проверка на лету (цена со скидкой для product).
 * apply=true — применить бонус (партии/дни безлимита); скидки применяются
 * при оплате через /api/billing/checkout.
 * Сначала лимит, потом проверка: иначе ручка — оракул для перебора (как в бюро).
 */
export async function POST(request: Request) {
  await connection();
  if (!paywallEnabled()) {
    return Response.json({ error: "payments_off" }, { status: 503 });
  }
  let body: { code?: unknown; product?: unknown; apply?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const supabase = getServiceSupabase();
  if (!(await promoRateOk(supabase, request))) {
    return Response.json({ error: "promo_rate_limited" }, { status: 429 });
  }
  const user = await userFromRequest(supabase, request);
  const product = isProductId(body.product) ? body.product : null;
  const apply = body.apply === true;
  if (apply && !user) {
    return Response.json({ error: "login_required" }, { status: 401 });
  }
  const r = await applyPromo(supabase, {
    code: body.code,
    userId: user?.id ?? null,
    // При применении скидочный код не должен бронироваться без оплаты.
    product: apply ? null : product,
    commit: apply,
  });
  if (!r.ok) return Response.json({ error: r.reason }, { status: 400 });
  // Скидку через apply не применяем: её бронирует только оплата.
  if (apply && !r.granted) {
    return Response.json({ error: "promo_needs_payment" }, { status: 400 });
  }
  return Response.json(r);
}
