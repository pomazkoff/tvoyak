import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/seo/site";
import {
  decideAccess,
  PRODUCTS,
  type Access,
  type ProductId,
} from "./products";
import { createYkPayment, fetchYkPayment, type YkPayment } from "./yookassa";

/** Пользователь по токену из заголовка Authorization: Bearer … */
export async function userFromRequest(
  supabase: SupabaseClient,
  request: Request,
): Promise<User | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export function ipHash(request: Request): string | null {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim();
  if (!ip) return null;
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-16) ?? "tvoyak";
  return createHash("sha256")
    .update(`${salt}:${ip}`)
    .digest("hex")
    .slice(0, 32);
}

export type Entitlement = {
  credits: number;
  unlimitedUntil: string | null;
  freeUsed: boolean;
};

export async function loadEntitlement(
  supabase: SupabaseClient,
  userId: string,
): Promise<Entitlement> {
  const { data } = await supabase
    .from("host_entitlements")
    .select("credits, unlimited_until, free_used_at")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    credits: (data?.credits as number | undefined) ?? 0,
    unlimitedUntil:
      (data?.unlimited_until as string | null | undefined) ?? null,
    freeUsed: Boolean(data?.free_used_at),
  };
}

/** Предпроверка при создании комнаты (окончательно решает billing_consume). */
export async function checkAccess(
  supabase: SupabaseClient,
  input: { user: User | null; deviceId: string | null; ipHash: string | null },
): Promise<Access> {
  const ent = input.user
    ? await loadEntitlement(supabase, input.user.id)
    : { credits: 0, unlimitedUntil: null, freeUsed: false };
  let freeUsedByDevice = !input.deviceId;
  if (input.deviceId) {
    const { data } = await supabase
      .from("host_free_games")
      .select("device_id")
      .eq("device_id", input.deviceId)
      .maybeSingle();
    freeUsedByDevice = Boolean(data);
  }
  let freeLimitByIp = false;
  if (input.ipHash) {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { count } = await supabase
      .from("host_free_games")
      .select("device_id", { count: "exact", head: true })
      .eq("ip_hash", input.ipHash)
      .gt("used_at", since);
    freeLimitByIp = (count ?? 0) >= 3;
  }
  return decideAccess({
    loggedIn: Boolean(input.user),
    credits: ent.credits,
    unlimitedUntil: ent.unlimitedUntil,
    freeUsedByDevice,
    freeUsedByUser: ent.freeUsed,
    freeLimitByIp,
  });
}

export async function consumeGame(supabase: SupabaseClient, roomId: string) {
  const { data, error } = await supabase.rpc("billing_consume", {
    p_room_id: roomId,
  });
  if (error || !data) return { ok: false as const, error: "billing_failed" };
  return data as {
    ok: boolean;
    kind?: string;
    error?: string;
    repeat?: boolean;
  };
}

export async function releaseGame(supabase: SupabaseClient, roomId: string) {
  const { error } = await supabase.rpc("billing_release", {
    p_room_id: roomId,
  });
  if (error) console.error("billing_release", error.code);
}

export async function startCheckout(
  supabase: SupabaseClient,
  user: User,
  product: ProductId,
): Promise<{ url: string } | { error: string }> {
  const item = PRODUCTS[product];
  const { data: row, error } = await supabase
    .from("host_payments")
    .insert({ user_id: user.id, product, amount_rub: item.priceRub })
    .select("id")
    .single();
  if (error || !row) return { error: "payment_failed" };
  const ref = row.id as string;
  let payment: YkPayment;
  try {
    payment = await createYkPayment({
      paymentRef: ref,
      amountRub: item.priceRub,
      description: item.description,
      returnUrl: `${siteOrigin()}/pay/return?ref=${ref}`,
      email: user.email,
    });
  } catch (e) {
    console.error("yookassa_create", (e as Error).message);
    await supabase
      .from("host_payments")
      .update({ status: "canceled" })
      .eq("id", ref);
    return { error: "payment_failed" };
  }
  await supabase
    .from("host_payments")
    .update({
      yookassa_id: payment.id,
      status: "pending",
      test: payment.test ?? null,
    })
    .eq("id", ref);
  if (!payment.confirmationUrl) return { error: "payment_failed" };
  return { url: payment.confirmationUrl };
}

/** Перечитать платёж у ЮKassa и, если оплачен, зачислить (идемпотентно). */
export async function syncPayment(
  supabase: SupabaseClient,
  yookassaId: string,
) {
  const payment = await fetchYkPayment(yookassaId);
  if (payment.paid && payment.status === "succeeded") {
    await supabase.rpc("billing_credit", {
      p_yookassa_id: payment.id,
      p_test: payment.test ?? null,
    });
    return "succeeded" as const;
  }
  if (payment.status === "canceled") {
    await supabase
      .from("host_payments")
      .update({ status: "canceled" })
      .eq("yookassa_id", payment.id)
      .is("credited_at", null);
    return "canceled" as const;
  }
  return "pending" as const;
}

export function siteOrigin(): string {
  const preview =
    process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL;
  return preview ? `https://${process.env.VERCEL_URL}` : SITE_URL;
}
