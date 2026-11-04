import { connection } from "next/server";
import { paywallEnabled } from "@/lib/billing/config";
import { PRODUCTS } from "@/lib/billing/products";
import { loadEntitlement, userFromRequest } from "@/lib/billing/server";
import { paymentsMode } from "@/lib/billing/yookassa";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  await connection();
  const enabled = paywallEnabled();
  const mode = paymentsMode();
  const prices = {
    game: PRODUCTS.game.priceRub,
    month: PRODUCTS.month.priceRub,
  };
  const supabase = getServiceSupabase();
  const user = await userFromRequest(supabase, request);
  if (!user) return Response.json({ enabled, mode, prices, user: null });
  if (!enabled) {
    return Response.json({
      enabled,
      mode,
      prices,
      user: {
        email: user.email ?? null,
        name: hostName(user.user_metadata, user.email ?? null),
      },
    });
  }
  const ent = await loadEntitlement(supabase, user.id);
  return Response.json({
    enabled,
    mode,
    prices,
    user: {
      email: user.email ?? null,
      name: hostName(user.user_metadata, user.email ?? null),
    },
    entitlement: {
      ...ent,
      unlimitedActive: Boolean(
        ent.unlimitedUntil && Date.parse(ent.unlimitedUntil) > Date.now(),
      ),
    },
  });
}

function hostName(
  meta: Record<string, unknown> | undefined,
  email: string | null,
): string | null {
  const username = meta?.telegram_username;
  const full = meta?.full_name;
  if (typeof username === "string" && username) return `@${username}`;
  if (typeof full === "string" && full) return full;
  return email;
}
