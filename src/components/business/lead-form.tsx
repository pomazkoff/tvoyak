"use client";

import { vkGoal } from "@/lib/analytics/vk-pixel";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  HONEYPOT_FIELD,
  LEAD_LIMITS,
  LEAD_TYPE_LABEL,
  LEAD_TYPES,
  leadErrorText,
} from "@/lib/b2b/lead";

type State = "idle" | "sending" | "sent";

/** Форма заявки на /business. Отправляет JSON в /api/b2b-lead. */
export function LeadForm() {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;
    setError(null);
    setState("sending");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/b2b-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        field?: string;
      };
      if (response.ok && payload.ok) {
        vkGoal("b2b_lead_submitted");
        setState("sent");
        return;
      }
      setError(leadErrorText(payload.error ?? "unknown", payload.field));
    } catch {
      setError(leadErrorText("network"));
    }
    setState("idle");
  }

  if (state === "sent") {
    return (
      <div className="sheet biz-form biz-sent" role="status">
        <h3 className="home-step-title">Спасибо, заявка у нас!</h3>
        <p className="home-info-text">
          Свяжемся с вами по указанному контакту. А пока можно{" "}
          <Link href="/" className="biz-link">
            сыграть пробную игру
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form className="sheet biz-form" onSubmit={onSubmit} noValidate={false}>
      <div className="biz-grid">
        <label className="biz-field">
          <span>Имя *</span>
          <input
            className="field"
            name="name"
            required
            maxLength={LEAD_LIMITS.name}
            autoComplete="name"
          />
        </label>
        <label className="biz-field">
          <span>Заведение или компания *</span>
          <input
            className="field"
            name="company"
            required
            maxLength={LEAD_LIMITS.company}
            autoComplete="organization"
          />
        </label>
        <label className="biz-field">
          <span>Кто вы *</span>
          <select className="field" name="type" required defaultValue="">
            <option value="" disabled>
              Выберите
            </option>
            {LEAD_TYPES.map((type) => (
              <option key={type} value={type}>
                {LEAD_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="biz-field">
          <span>Телефон, Telegram или почта *</span>
          <input
            className="field"
            name="contact"
            required
            maxLength={LEAD_LIMITS.contact}
            placeholder="+7…, @ник или почта"
          />
        </label>
        <label className="biz-field">
          <span>Дата мероприятия</span>
          <input className="field" name="eventDate" type="date" />
        </label>
        <label className="biz-field biz-wide">
          <span>Комментарий</span>
          <textarea
            className="field"
            name="comment"
            rows={4}
            maxLength={LEAD_LIMITS.comment}
            placeholder="Сколько гостей, какой формат, нужны ли свои вопросы"
          />
        </label>
        {/* Ловушка для ботов: людям не видна и не доступна с клавиатуры. */}
        <div className="biz-hp" aria-hidden>
          <label>
            Сайт
            <input
              name={HONEYPOT_FIELD}
              tabIndex={-1}
              autoComplete="off"
              defaultValue=""
            />
          </label>
        </div>
      </div>
      {error ? (
        <p className="biz-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="action" type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Отправляем…" : "Отправить заявку"}
      </button>
      <p className="biz-note">
        Данные нужны только чтобы связаться с вами по заявке. Отправляя заявку,
        вы даёте{" "}
        <Link href="/consent" className="biz-link">
          согласие на обработку персональных данных.
        </Link>{" "}
        <Link href="/privacy" className="biz-link">
          Политика в отношении обработки персональных данных.
        </Link>
      </p>
    </form>
  );
}
