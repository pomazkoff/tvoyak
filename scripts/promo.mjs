#!/usr/bin/env node
/*
 * Промокоды ведущего — как `npm run promo` в бюро. Админки нет намеренно:
 * кодов десятки, каждый канал заводится руками.
 *
 *   npm run promo -- add TG-KANAL --percent 20 --max 50 --until 2026-12-31 --note "посев"
 *   npm run promo -- add BLOG-ANNA --games 3 --max 1 --channel blog
 *   npm run promo -- add BAR-TEST --days 7 --max 10
 *   npm run promo -- add FRIENDS --percent 100 --product month --max 5
 *   npm run promo -- off TG-KANAL      # выключить (on — включить)
 *   npm run promo -- list              # коды и сколько раз сработали
 *
 * Виды (ровно один): --percent N | --rub N (скидка; --product game|month
 * ограничивает тариф), --games N (бесплатные партии), --days N (безлимит).
 * Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY (например, из .env.local).
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const [cmd, ...rest] = process.argv.slice(2);
const flags = new Map();
const positional = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a.startsWith("--")) {
    const v = rest[i + 1];
    if (v === undefined || v.startsWith("--")) flags.set(a.slice(2), "true");
    else {
      flags.set(a.slice(2), v);
      i++;
    }
  } else positional.push(a);
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function normalizeCode(raw) {
  const code = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  return /^[A-Z0-9][A-Z0-9-]{1,30}[A-Z0-9]$/.test(code) ? code : null;
}

/** ГГГГ-ММ-ДД по Москве: начало или конец дня. */
function mskDate(value, endOfDay) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail(`Дата ${value}: нужен ГГГГ-ММ-ДД`);
  return `${value}T${endOfDay ? "23:59:59" : "00:00:00"}+03:00`;
}

const KINDS = {
  percent: "percent",
  rub: "rub",
  games: "games",
  days: "unlimited_days",
};

if (cmd === "add") {
  const code = normalizeCode(positional[0]);
  if (!code) fail("Код: латиница, цифры и дефис, 3–32 символа");
  const given = Object.keys(KINDS).filter((k) => flags.has(k));
  if (given.length !== 1)
    fail("Нужен ровно один вид: --percent | --rub | --games | --days");
  const kind = KINDS[given[0]];
  const value = Number(flags.get(given[0]));
  if (!Number.isInteger(value) || value <= 0)
    fail("Значение — целое больше нуля");
  if (kind === "percent" && value > 100) fail("Процент — до 100");
  const product = flags.get("product") ?? null;
  if (product && !["game", "month"].includes(product))
    fail("--product game|month");
  if (product && !["percent", "rub"].includes(kind))
    fail("--product только для скидок");
  const row = {
    code,
    kind,
    value,
    product,
    channel: flags.get("channel") ?? code.split("-")[0].toLowerCase(),
    note: flags.get("note") ?? null,
    max_uses: flags.has("max") ? Number(flags.get("max")) : null,
    starts_at: flags.has("from")
      ? mskDate(flags.get("from"), false)
      : new Date().toISOString(),
    expires_at: flags.has("until") ? mskDate(flags.get("until"), true) : null,
  };
  const { error } = await db.from("promo_codes").insert(row);
  if (error) fail(error.message);
  console.log(`Готово: ${code}. Ссылка: https://tvoyak.ru/pay?promo=${code}`);
} else if (cmd === "off" || cmd === "on") {
  const code = normalizeCode(positional[0]);
  if (!code) fail("Нужен код");
  const { data, error } = await db
    .from("promo_codes")
    .update({ active: cmd === "on" })
    .eq("code", code)
    .select("code");
  if (error) fail(error.message);
  if (!data?.length) fail(`Кода ${code} нет`);
  console.log(`${code}: ${cmd === "on" ? "включён" : "выключен"}`);
} else if (cmd === "list") {
  const { data: codes, error } = await db
    .from("promo_codes")
    .select("*")
    .order("created_at");
  if (error) fail(error.message);
  const { data: uses } = await db
    .from("promo_redemptions")
    .select("code,status")
    .in("status", ["used", "reserved"]);
  for (const c of codes ?? []) {
    const n = (uses ?? []).filter(
      (u) => u.code === c.code && u.status === "used",
    ).length;
    const r = (uses ?? []).filter(
      (u) => u.code === c.code && u.status === "reserved",
    ).length;
    console.log(
      [
        c.active ? "●" : "○",
        c.code,
        `${c.kind}=${c.value}${c.product ? `/${c.product}` : ""}`,
        `исп. ${n}${r ? ` (+${r} бронь)` : ""}${c.max_uses ? ` из ${c.max_uses}` : ""}`,
        c.expires_at ? `до ${c.expires_at.slice(0, 10)}` : "бессрочно",
        c.channel,
        c.note ?? "",
      ].join("  "),
    );
  }
} else {
  console.log("Команды: add | on | off | list (см. шапку scripts/promo.mjs)");
}
