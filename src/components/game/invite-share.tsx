"use client";

import { useState, useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

export function useClientOrigin(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => "",
  );
}

function useCanShare(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof navigator.share === "function",
    () => false,
  );
}

/**
 * Ссылка сразу открывает вход в комнату (/play/КОД).
 * На телефоне рядом — системное «поделиться», чтобы кинуть её в чат.
 */
export function InviteShare({ url, code }: { url: string; code: string }) {
  const canShare = useCanShare();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  if (!url) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: "Твояк",
        text: `Заходите в комнату ${code}. Первая партия бесплатно.`,
        url,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      await copy();
    }
  }

  return (
    <div className="invite-share">
      <div className="invite-actions">
        <button type="button" className="action" onClick={() => void copy()}>
          {state === "copied" ? "Ссылка скопирована" : "Скопировать ссылку"}
        </button>
        {canShare ? (
          <button
            type="button"
            className="action is-ink"
            onClick={() => void share()}
          >
            Отправить
          </button>
        ) : null}
      </div>
      {state === "failed" ? (
        <p className="invite-fallback">
          Не получилось скопировать. Вот ссылка: <a href={url}>{url}</a>
        </p>
      ) : null}
    </div>
  );
}
