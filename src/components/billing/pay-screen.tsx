"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Logo } from "@/components/marks";
import { authHeader, getAuthSupabase } from "@/lib/billing/client";
import { isProductId, PRODUCTS, type ProductId } from "@/lib/billing/products";
import {
  describePromo,
  discountFor,
  normalizeCode,
  promoMessage,
  type PromoKind,
} from "@/lib/billing/promo";

type Promo = {
  code: string;
  kind: PromoKind;
  value: number;
  product?: ProductId | null;
};

type Me = {
  enabled: boolean;
  mode: "off" | "test" | "live";
  prices: { game: number; month: number };
  user?: { email: string | null; name?: string | null } | null;
  entitlement?: {
    credits: number;
    unlimitedUntil: string | null;
    unlimitedActive?: boolean;
    freeUsed: boolean;
  };
};

const NEXT_KEY = "tvoyak:pay-next";
const TG_KEY = "tvoyak:tg-login";
// Вход по почте пока скрыт: письма не отправляются. Код оставлен.
const EMAIL_LOGIN = false;

function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

export function PayScreen() {
  const [me, setMe] = useState<Me | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [tgWaiting, setTgWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [next, setNext] = useState("/");
  const [need, setNeed] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<Promo | null>(null);
  const [promoInfo, setPromoInfo] = useState<string | null>(null);
  const [picked, setPicked] = useState<ProductId | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/billing/me", {
        headers: await authHeader(),
      });
      setMe((await res.json()) as Me);
    } catch {
      setError("Не удалось загрузить данные. Обновите страницу.");
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = safeNext(
      params.get("next") ?? sessionStorage.getItem(NEXT_KEY),
    );
    sessionStorage.setItem(NEXT_KEY, target);
    const product = params.get("product");
    queueMicrotask(() => {
      setNext(target);
      setNeed(params.get("need"));
      if (isProductId(product)) setPicked(product);
      const fromLink = params.get("promo");
      if (fromLink) setPromoInput(fromLink);
    });
    const supabase = getAuthSupabase();
    // Ссылка из письма возвращает сюда с токеном в адресе — клиент сам его
    // подхватит; ждём событие и перечитываем статус.
    const sub = supabase?.auth.onAuthStateChange(() => void refresh());
    const first = setTimeout(() => void refresh(), 0);
    // Вернулись из Telegram в эту же вкладку — продолжаем ждать подтверждения.
    const pending = sessionStorage.getItem(TG_KEY);
    if (pending) {
      queueMicrotask(() => setTgWaiting(true));
      void pollTelegram(pending).then((result) => {
        setTgWaiting(false);
        if (result === "ok") void refresh();
      });
    }
    return () => {
      clearTimeout(first);
      sub?.data.subscription.unsubscribe();
    };
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getAuthSupabase();
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/pay` },
    });
    setBusy(false);
    if (authError) setError("Не получилось отправить письмо. Проверьте адрес.");
    else setSent(true);
  }

  async function loginTelegram() {
    const supabase = getAuthSupabase();
    if (!supabase || busy) return;
    setError(null);
    // Окно открываем сразу по клику, иначе браузер его заблокирует.
    const popup = window.open("", "_blank");
    let token: string;
    try {
      const res = await fetch("/api/auth/telegram/start", { method: "POST" });
      const payload = (await res.json()) as { token?: string; url?: string };
      if (!payload.token || !payload.url) throw new Error("start");
      token = payload.token;
      if (popup) popup.location.href = payload.url;
      else window.location.assign(payload.url);
    } catch {
      popup?.close();
      setError("Не получилось начать вход. Попробуйте ещё раз.");
      return;
    }
    sessionStorage.setItem(TG_KEY, token);
    setTgWaiting(true);
    void waitTelegram(token);
  }

  async function waitTelegram(token: string) {
    const result = await pollTelegram(token);
    setTgWaiting(false);
    if (result === "ok") await refresh();
    else if (result === "timeout")
      setError("Время на вход вышло. Попробуйте ещё раз.");
    else setError("Вход не завершён. Нажмите «Войти через Telegram» ещё раз.");
  }

  async function buy(product: ProductId) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeader()),
        },
        body: JSON.stringify({
          product,
          promo: promo && promoFits(promo, product) ? promo.code : undefined,
        }),
      });
      const payload = (await res.json()) as {
        url?: string;
        granted?: boolean;
        error?: string;
      };
      if (payload.url) {
        window.location.assign(payload.url);
        return;
      }
      if (payload.granted) {
        setPromo(null);
        setPromoInfo("Готово! Тариф выдан по промокоду.");
        await refresh();
      } else if (payload.error?.startsWith("promo_")) {
        setError(promoMessage(payload.error));
      } else {
        setError("Оплата сейчас недоступна. Попробуйте позже.");
      }
    } catch {
      setError("Нет связи. Попробуйте ещё раз.");
    }
    setBusy(false);
  }

  async function checkPromo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = normalizeCode(promoInput);
    setError(null);
    setPromoInfo(null);
    setPromo(null);
    if (!code) {
      setError(promoMessage("promo_not_found"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/billing/promo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeader()),
        },
        body: JSON.stringify({ code }),
      });
      const payload = (await res.json()) as {
        ok?: boolean;
        kind?: PromoKind;
        value?: number;
        product?: ProductId | null;
        error?: string;
      };
      if (payload.ok && payload.kind && payload.value) {
        const found: Promo = {
          code,
          kind: payload.kind,
          value: payload.value,
          product: payload.product ?? null,
        };
        setPromo(found);
        setPromoInfo(`Промокод ${code}: ${describePromo(found)}`);
      } else {
        setError(promoMessage(payload.error ?? ""));
      }
    } catch {
      setError("Нет связи. Попробуйте ещё раз.");
    }
    setBusy(false);
  }

  async function activatePromo() {
    if (!promo || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/promo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeader()),
        },
        body: JSON.stringify({ code: promo.code, apply: true }),
      });
      const payload = (await res.json()) as {
        granted?: boolean;
        error?: string;
      };
      if (payload.granted) {
        setPromoInfo(`Готово: ${describePromo(promo)}.`);
        setPromo(null);
        setPromoInput("");
        await refresh();
      } else {
        setError(promoMessage(payload.error ?? ""));
      }
    } catch {
      setError("Нет связи. Попробуйте ещё раз.");
    }
    setBusy(false);
  }

  async function logout() {
    await getAuthSupabase()?.auth.signOut();
    await refresh();
  }

  const ent = me?.entitlement;
  const unlimited =
    ent?.unlimitedUntil && ent.unlimitedActive
      ? new Date(ent.unlimitedUntil).toLocaleDateString("ru-RU")
      : null;

  return (
    <main className="pay-page">
      <Link href="/" aria-label="Твояк — на главную">
        <Logo />
      </Link>
      <section className="sheet pay-card">
        <h1 className="pay-title">Партии для ведущего</h1>
        <p className="pay-lead">
          Первая партия — бесплатно. Дальше {PRODUCTS.game.priceRub} ₽ за партию
          или {PRODUCTS.month.priceRub} ₽ за 30 дней без ограничений. Игроки
          всегда играют бесплатно.
        </p>
        {picked ? (
          <p className="pay-note">
            Выбран тариф «{PRODUCTS[picked].title}» —{" "}
            {PRODUCTS[picked].priceRub} ₽.
          </p>
        ) : null}
        {need === "login_required" && !me?.user ? (
          <p className="pay-note">
            Бесплатная партия на этом устройстве уже сыграна. Войдите, чтобы
            продолжить.
          </p>
        ) : null}

        {me && !me.enabled ? (
          <p className="pay-note">
            Сейчас оплата не нужна — играйте бесплатно.
          </p>
        ) : null}

        {me?.enabled && !me.user ? (
          <div className="pay-login">
            <button
              type="button"
              className="action"
              disabled={tgWaiting}
              onClick={() => void loginTelegram()}
            >
              Войти через Telegram
            </button>
            {tgWaiting ? (
              <p className="pay-note">
                Нажмите «Запустить» в боте @tvoyak_bot и вернитесь сюда — вход
                завершится сам.
              </p>
            ) : null}
          </div>
        ) : null}

        {EMAIL_LOGIN && me?.enabled && !me.user ? (
          sent ? (
            <p className="pay-note">
              Ссылка для входа отправлена на {email}. Откройте письмо на этом
              устройстве.
            </p>
          ) : (
            <form className="pay-login" onSubmit={(e) => void login(e)}>
              <label htmlFor="pay-email">Почта ведущего</label>
              <input
                id="pay-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.ru"
              />
              <button type="submit" className="action" disabled={busy}>
                Получить ссылку для входа
              </button>
            </form>
          )
        ) : null}

        {me?.enabled && me.user ? (
          <>
            <p className="pay-balance">
              {me.user.name ?? me.user.email}:{" "}
              {unlimited
                ? `безлимит до ${unlimited}`
                : `оплаченных партий — ${ent?.credits ?? 0}`}
              {" · "}
              <button
                type="button"
                className="pay-link"
                onClick={() => void logout()}
              >
                выйти
              </button>
            </p>
            <div className="pay-options">
              {(["game", "month"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`pay-option${picked === id ? " is-picked" : ""}`}
                  disabled={busy || me.mode === "off"}
                  onClick={() => void buy(id)}
                >
                  {promo && promoFits(promo, id) ? (
                    <span className="pay-price">
                      <s className="pay-old">{PRODUCTS[id].priceRub} ₽</s>{" "}
                      {priceWith(promo, id)} ₽
                    </span>
                  ) : (
                    <span className="pay-price">{PRODUCTS[id].priceRub} ₽</span>
                  )}
                  <span>{PRODUCTS[id].title}</span>
                </button>
              ))}
            </div>
            <form className="pay-promo" onSubmit={(e) => void checkPromo(e)}>
              <label htmlFor="pay-promo">Есть промокод?</label>
              <div className="pay-promo-row">
                <input
                  id="pay-promo"
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value)}
                  placeholder="КОД"
                  autoComplete="off"
                  autoCapitalize="characters"
                />
                <button type="submit" className="pay-link" disabled={busy}>
                  Проверить
                </button>
              </div>
            </form>
            {promoInfo ? <p className="pay-ok">{promoInfo}</p> : null}
            {promo &&
            (promo.kind === "games" || promo.kind === "unlimited_days") ? (
              <button
                type="button"
                className="action"
                disabled={busy}
                onClick={() => void activatePromo()}
              >
                Активировать: {describePromo(promo)}
              </button>
            ) : null}
            {me.mode === "test" ? (
              <p className="pay-note">
                Тестовый режим: используйте тестовую карту ЮKassa, деньги не
                списываются.
              </p>
            ) : null}
            {me.mode === "off" ? (
              <p className="pay-note">Приём оплаты ещё не подключён.</p>
            ) : null}
          </>
        ) : null}

        {error ? (
          <p className="pay-error" role="alert">
            {error}
          </p>
        ) : null}
        <Link href={next} className="pay-link">
          ← Вернуться к игре
        </Link>
        <p className="pay-small">
          Оплата через ЮKassa. Нажимая кнопку тарифа, вы принимаете{" "}
          <Link href="/oferta" className="pay-link">
            публичную оферту
          </Link>{" "}
          и даёте{" "}
          <Link href="/consent" className="pay-link">
            согласие на обработку персональных данных.
          </Link>{" "}
          <Link href="/privacy" className="pay-link">
            Политика в отношении обработки персональных данных.
          </Link>
        </p>
      </section>
    </main>
  );
}

/** Ждёт подтверждения в боте и ставит сессию. */
async function pollTelegram(token: string): Promise<"ok" | "fail" | "timeout"> {
  const supabase = getAuthSupabase();
  if (!supabase) return "fail";
  const until = Date.now() + 10 * 60 * 1000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 2000));
    let payload: {
      status?: string;
      session?: { access_token: string; refresh_token: string };
    };
    try {
      const res = await fetch("/api/auth/telegram/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      payload = (await res.json()) as typeof payload;
    } catch {
      continue;
    }
    if (payload.status === "pending") continue;
    sessionStorage.removeItem(TG_KEY);
    if (payload.status === "ok" && payload.session) {
      const { error } = await supabase.auth.setSession(payload.session);
      return error ? "fail" : "ok";
    }
    return "fail";
  }
  sessionStorage.removeItem(TG_KEY);
  return "timeout";
}

function promoFits(promo: Promo, product: ProductId): boolean {
  if (promo.kind !== "percent" && promo.kind !== "rub") return false;
  return !promo.product || promo.product === product;
}

function priceWith(promo: Promo, product: ProductId): number {
  if (promo.kind !== "percent" && promo.kind !== "rub") {
    return PRODUCTS[product].priceRub;
  }
  return (
    PRODUCTS[product].priceRub - discountFor(promo.kind, promo.value, product)
  );
}
