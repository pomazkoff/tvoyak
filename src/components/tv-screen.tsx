"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/marks";
import { hostPath } from "@/lib/rooms/host-link";
import { messageFor } from "@/lib/rooms/messages";
import { saveHostSecret } from "@/lib/rooms/storage";
import { markTvDisplay, normalizeTvCode } from "@/lib/rooms/tv-code";

const KEYS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "←",
  "0",
  "OK",
] as const;

function stepFocus(index: number, key: string): number {
  const col = index % 3;
  const row = Math.floor(index / 3);
  if (key === "ArrowLeft") return row * 3 + ((col + 2) % 3);
  if (key === "ArrowRight") return row * 3 + ((col + 1) % 3);
  if (key === "ArrowUp") return ((row + 3) % 4) * 3 + col;
  if (key === "ArrowDown") return ((row + 1) % 4) * 3 + col;
  return index;
}

/**
 * /tv: без входа, крупные цифры и клавиатура под пульт.
 * Стрелки двигают фокус, цифры пульта набирают код, шестая открывает табло.
 */
export function TvScreen() {
  const [digits, setDigits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const digitsRef = useRef("");
  const busyRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    buttons.current[focusIndex]?.focus();
  }, [focusIndex]);

  const submit = useCallback(
    async (raw: string) => {
      const code = normalizeTvCode(raw);
      if (!code || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/host/tv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "claim", tvCode: code }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          code?: string;
          hostSecret?: string;
        };
        if (!payload.ok || !payload.code || !payload.hostSecret) {
          digitsRef.current = "";
          setDigits("");
          setError(messageFor(payload.error));
          busyRef.current = false;
          setBusy(false);
          return;
        }
        saveHostSecret(payload.code, payload.hostSecret);
        markTvDisplay(payload.code);
        router.push(hostPath(payload.code, payload.hostSecret));
      } catch {
        digitsRef.current = "";
        setDigits("");
        setError(messageFor("network"));
        busyRef.current = false;
        setBusy(false);
      }
    },
    [router],
  );

  const append = useCallback(
    (digit: string) => {
      if (busyRef.current || digitsRef.current.length >= 6) return;
      const next = digitsRef.current + digit;
      digitsRef.current = next;
      setDigits(next);
      setError(null);
      if (next.length === 6) void submit(next);
    },
    [submit],
  );

  const backspace = useCallback(() => {
    if (busyRef.current) return;
    const next = digitsRef.current.slice(0, -1);
    digitsRef.current = next;
    setDigits(next);
    setError(null);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "TEXTAREA" || target.tagName === "INPUT")
      ) {
        return;
      }
      if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        setFocusIndex((index) => stepFocus(index, event.key));
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        backspace();
        return;
      }
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        append(event.key);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [append, backspace]);

  function press(key: (typeof KEYS)[number]) {
    if (key === "←") {
      backspace();
      return;
    }
    if (key === "OK") {
      if (digitsRef.current.length < 6) {
        setError("Нужны все шесть цифр.");
        return;
      }
      void submit(digitsRef.current);
      return;
    }
    append(key);
  }

  return (
    <main className="tv-page">
      <Logo compact />
      <h1 className="hand tv-title">Код с телефона ведущего</h1>
      <p className="tv-lead">
        Шесть цифр. Вход не нужен — наберите их пультом.
      </p>
      <div
        className="tv-digits mono"
        aria-label={`Введено ${digits.length} из 6`}
      >
        {Array.from({ length: 6 }, (_, index) => (
          <span
            key={index}
            className={index === digits.length ? "is-next" : undefined}
          >
            {digits[index] ?? ""}
          </span>
        ))}
      </div>
      {error ? (
        <p className="tv-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="tv-status">
          {busy ? "Открываем табло…" : "Цифры с пульта или кнопки на экране"}
        </p>
      )}
      <div className="tv-pad" role="group" aria-label="Клавиатура">
        {KEYS.map((key, index) => (
          <button
            key={key}
            type="button"
            ref={(node) => {
              buttons.current[index] = node;
            }}
            className={`tv-key${key === "OK" ? " is-ok" : ""}${key === "←" ? " is-back" : ""}`}
            disabled={busy}
            aria-label={
              key === "←"
                ? "Стереть цифру"
                : key === "OK"
                  ? "Открыть табло"
                  : key
            }
            onClick={() => {
              setFocusIndex(index);
              press(key);
            }}
          >
            {key === "OK" ? "ОК" : key}
          </button>
        ))}
      </div>
    </main>
  );
}
