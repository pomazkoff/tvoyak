"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { authHeader } from "@/lib/billing/client";
import { CONTACT_MAX, FEEDBACK_MAX } from "@/lib/feedback";

const errors: string[] = [];
let hooked = false;

function remember(message: string) {
  if (!message) return;
  errors.push(message.slice(0, 300));
  if (errors.length > 5) errors.shift();
}

function hookErrors() {
  if (hooked || typeof window === "undefined") return;
  hooked = true;
  window.addEventListener("error", (e) =>
    remember(`${e.message}${e.filename ? ` @ ${e.filename}:${e.lineno}` : ""}`),
  );
  window.addEventListener("unhandledrejection", (e) =>
    remember(`unhandled: ${String((e.reason as Error)?.message ?? e.reason)}`),
  );
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    remember(
      args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "),
    );
    original(...args);
  };
}

function roomInfo(path: string): {
  room: string | null;
  role: "host" | "player" | null;
} {
  const m = /^\/(host|play)\/([^/]+)/.exec(path);
  if (!m) return { room: null, role: null };
  return {
    room: decodeURIComponent(m[2]).toUpperCase(),
    role: m[1] === "host" ? "host" : "player",
  };
}

/** Кнопка «Что-то не работает» — на всех страницах; в игре — маленькая. */
export function BugReport() {
  const path = usePathname() ?? "/";
  const inGame = /^\/(host|play)\//.test(path);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [contact, setContact] = useState("");
  const [trap, setTrap] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => hookErrors(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeader()),
        },
        body: JSON.stringify({
          text,
          contact,
          website: trap,
          url: window.location.href,
          ...roomInfo(path),
          screen: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
          errors: [...errors],
        }),
      });
      if (res.ok) {
        setDone(true);
        setText("");
      } else if (res.status === 429) {
        setError("Слишком много сообщений. Попробуйте через час.");
      } else {
        setError("Не получилось отправить. Попробуйте ещё раз.");
      }
    } catch {
      setError("Нет связи. Попробуйте ещё раз.");
    }
    setBusy(false);
  }

  function close() {
    setOpen(false);
    setDone(false);
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        className={inGame ? "bug-fab bug-fab-mini" : "bug-fab"}
        aria-label="Что-то не работает"
        title="Что-то не работает"
        onClick={() => setOpen(true)}
      >
        <BugIcon />
        {inGame ? null : <span>Что-то не работает</span>}
      </button>
      {open ? (
        <div className="bug-backdrop" role="presentation" onClick={close}>
          <div
            className="bug-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bug-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="bug-close"
              aria-label="Закрыть"
              onClick={close}
            >
              ×
            </button>
            {done ? (
              <p id="bug-title" className="bug-thanks">
                Спасибо, починим!
              </p>
            ) : (
              <form onSubmit={(e) => void submit(e)}>
                <h2 id="bug-title" className="bug-title">
                  Что-то не работает?
                </h2>
                <label htmlFor="bug-text">Опиши проблему</label>
                <textarea
                  id="bug-text"
                  required
                  maxLength={FEEDBACK_MAX}
                  rows={5}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Что делали и что пошло не так"
                />
                <label htmlFor="bug-contact">
                  Контакт для ответа (необязательно)
                </label>
                <input
                  id="bug-contact"
                  maxLength={CONTACT_MAX}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="@telegram или почта"
                />
                <input
                  className="bug-trap"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  name="website"
                  value={trap}
                  onChange={(e) => setTrap(e.target.value)}
                />
                {error ? (
                  <p className="bug-error" role="alert">
                    {error}
                  </p>
                ) : null}
                <button
                  type="submit"
                  className="action"
                  disabled={busy || !text.trim()}
                >
                  {busy ? "Отправляем…" : "Отправить"}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function BugIcon() {
  return (
    <svg
      className="bug-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="#1d1d1d" strokeWidth="1.6" strokeLinecap="round">
        <path d="M9 5.5 7.5 3.5M15 5.5l1.5-2M5 11H2.5M21.5 11H19M5.5 16l-2.5 1.5M18.5 16l2.5 1.5M6 7.5 3.5 6M18 7.5 20.5 6" />
      </g>
      <circle cx="12" cy="7" r="3" fill="#1d1d1d" />
      <ellipse
        cx="12"
        cy="14"
        rx="6.5"
        ry="7.5"
        fill="#d7282f"
        stroke="#1d1d1d"
        strokeWidth="1.4"
      />
      <path d="M12 6.5v15" stroke="#1d1d1d" strokeWidth="1.4" />
      <circle cx="9" cy="12" r="1.3" fill="#1d1d1d" />
      <circle cx="15" cy="12" r="1.3" fill="#1d1d1d" />
      <circle cx="9.5" cy="17" r="1.1" fill="#1d1d1d" />
      <circle cx="14.5" cy="17" r="1.1" fill="#1d1d1d" />
    </svg>
  );
}
