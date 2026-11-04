import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const TG_LOGIN_PREFIX = "login_";

export function botUsername(): string {
  return process.env.TELEGRAM_BOT_USERNAME?.trim() || "tvoyak_bot";
}

/** Токен для deep-link: только [A-Za-z0-9_-], до 64 символов вместе с префиксом. */
export function newLoginToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isTokenShape(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{20,58}$/.test(token);
}

export function checkWebhookSecret(header: string | null): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function tgEmail(tgId: number | string): string {
  return `tg${tgId}@users.tvoyak.ru`;
}

/** Достаёт токен из текста «/start login_xxx» (в т.ч. «/start@bot login_xxx»). */
export function tokenFromStart(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const m = /^\/start(?:@\w+)?\s+login_([A-Za-z0-9_-]+)\s*$/.exec(text.trim());
  return m && isTokenShape(m[1]) ? m[1] : null;
}

export async function tgSend(
  chatId: number,
  text: string,
  button?: { text: string; url: string },
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        ...(button ? { reply_markup: { inline_keyboard: [[button]] } } : {}),
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    console.error("tg_login_send", "network");
  }
}

export type TgProfile = { id: number; name: string; username: string | null };

/**
 * Находит или создаёт пользователя Supabase для Telegram id и выпускает
 * сессию: generateLink(magiclink) без отправки письма + verifyOtp по token_hash.
 */
export async function sessionForTelegram(
  admin: SupabaseClient,
  profile: TgProfile,
): Promise<{ access_token: string; refresh_token: string } | null> {
  const email = tgEmail(profile.id);
  const metadata = {
    telegram_id: profile.id,
    telegram_username: profile.username,
    full_name: profile.name,
    provider: "telegram",
  };
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (created.error && created.error.status !== 422) {
    // 422 — такой пользователь уже есть, это нормально.
    console.error("tg_login_create", created.error.status, created.error.code);
  }
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const hashed = link.data?.properties?.hashed_token;
  if (link.error || !hashed || !link.data.user) {
    console.error("tg_login_link", link.error?.status, link.error?.code);
    return null;
  }
  if (!created.data?.user) {
    await admin.auth.admin.updateUserById(link.data.user.id, {
      user_metadata: { ...link.data.user.user_metadata, ...metadata },
    });
  }
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const pub = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await pub.auth.verifyOtp({
    type: "magiclink",
    token_hash: hashed,
  });
  if (error || !data.session) {
    console.error("tg_login_verify", error?.status, error?.code);
    return null;
  }
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
}
