"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Logo } from "@/components/marks";
import { authHeader, getAuthSupabase } from "@/lib/billing/client";
import { PRODUCTS, type ProductId } from "@/lib/billing/products";

type Me = {
  enabled: boolean;
  mode: "off" | "test" | "live";
  prices: { game: number; month: number };
  user?: { email: string | null } | null;
  entitlement?: {
    credits: number;
    unlimitedUntil: string | null;
    unlimitedActive?: boolean;
    freeUsed: boolean;
  };
};

const NEXT_KEY = "tvoyak:pay-next";

function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

export function PayScreen() {
  const [me, setMe] = useState<Me | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [next, setNext] = useState("/");
  const [need, setNeed] = useState<string | null>(null);

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
    queueMicrotask(() => {
      setNext(target);
      setNeed(params.get("need"));
    });
    const supabase = getAuthSupabase();
    // Ссылка из письма возвращает сюда с токеном в адресе — клиент сам его
    // подхватит; ждём событие и перечитываем статус.
    const sub = supabase?.auth.onAuthStateChange(() => void refresh());
    const first = setTimeout(() => void refresh(), 0);
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
        body: JSON.stringify({ product }),
      });
      const payload = (await res.json()) as { url?: string; error?: string };
      if (payload.url) {
        window.location.assign(payload.url);
        return;
      }
      setError("Оплата сейчас недоступна. Попробуйте позже.");
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
              {me.user.email}:{" "}
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
                  className="pay-option"
                  disabled={busy || me.mode === "off"}
                  onClick={() => void buy(id)}
                >
                  <span className="pay-price">{PRODUCTS[id].priceRub} ₽</span>
                  <span>{PRODUCTS[id].title}</span>
                </button>
              ))}
            </div>
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
          Оплата через ЮKassa. Нажимая «оплатить», вы соглашаетесь с условиями
          сервиса.
        </p>
      </section>
    </main>
  );
}
