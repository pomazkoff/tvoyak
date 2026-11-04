import { connection } from "next/server";
import { paywallEnabled } from "@/lib/billing/config";
import { isProductId } from "@/lib/billing/products";
import { startCheckout, userFromRequest } from "@/lib/billing/server";
import { paymentsMode } from "@/lib/billing/yookassa";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  await connection();
  if (!paywallEnabled() || paymentsMode() === "off") {
    return Response.json({ error: "payments_off" }, { status: 503 });
  }
  let product: unknown;
  try {
    product = ((await request.json()) as { product?: unknown }).product;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!isProductId(product)) {
    return Response.json({ error: "bad_product" }, { status: 400 });
  }
  const supabase = getServiceSupabase();
  const user = await userFromRequest(supabase, request);
  if (!user) return Response.json({ error: "login_required" }, { status: 401 });
  const result = await startCheckout(supabase, user, product);
  if ("error" in result) return Response.json(result, { status: 502 });
  return Response.json(result);
}
