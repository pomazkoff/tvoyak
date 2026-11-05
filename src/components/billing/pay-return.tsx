"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/marks";
import { authHeader } from "@/lib/billing/client";

type State = "checking" | "succeeded" | "canceled" | "pending" | "error";

export function PayReturn() {
  const [state, setState] = useState<State>("checking");
  const [next, setNext] = useState("/");

  useEffect(() => {
    const target = sessionStorage.getItem("tvoyak:pay-next");
    const ref = new URLSearchParams(window.location.search).get("ref");
    let stopped = false;
    let tries = 0;
    async function poll() {
      if (stopped) return;
      tries += 1;
      try {
        const res = await fetch(
          `/api/billing/status?ref=${encodeURIComponent(ref ?? "")}`,
          {
            headers: await authHeader(),
          },
        );
        const payload = (await res.json()) as { status?: string };
        if (payload.status === "succeeded" || payload.status === "canceled") {
          setState(payload.status);
          return;
        }
        if (!res.ok) {
          setState("error");
          return;
        }
      } catch {
        // повторим
      }
      if (tries >= 30) setState("pending");
      else setTimeout(() => void poll(), 2000);
    }
    queueMicrotask(() => {
      if (target && target.startsWith("/") && !target.startsWith("//"))
        setNext(target);
    });
    void poll();
    return () => {
      stopped = true;
    };
  }, []);

  const text: Record<State, string> = {
    checking: "Проверяем оплату…",
    succeeded: "Оплачено! Партия зачислена — можно начинать.",
    canceled: "Платёж отменён, деньги не списаны.",
    pending:
      "ЮKassa ещё не подтвердила платёж. Обновите страницу через минуту.",
    error: "Не нашли платёж. Войдите тем же адресом, с которого платили.",
  };

  return (
    <main className="pay-page">
      <Link href="/" aria-label="Твояк — на главную">
        <Logo />
      </Link>
      <section className="sheet pay-card" role="status">
        <h1 className="pay-title">{text[state]}</h1>
        <Link href={state === "succeeded" ? next : "/pay"} className="action">
          {state === "succeeded" ? "Вернуться к игре" : "К оплате"}
        </Link>
      </section>
    </main>
  );
}
