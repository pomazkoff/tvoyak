"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { StyledQr } from "@/components/styled-qr";
import { messageFor } from "@/lib/rooms/messages";
import { formatPairCode, phoneLink, phonePath } from "@/lib/rooms/host-phone";
import { readHostSecret } from "@/lib/rooms/storage";

type Pairing = { pair: string; expiresAt: string };

async function phoneRequest(body: Record<string, unknown>) {
  const response = await fetch("/api/host/phone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as {
    ok?: boolean;
    error?: string;
    pair?: string;
    expiresAt?: string;
  };
}

/**
 * Привязка телефона ведущего с большого экрана. Код и QR появляются только
 * по кнопке, одноразовые и на 10 минут; как только телефон подключился,
 * карточка исчезает сама (rooms.host_phone приходит по realtime).
 */
export function HostPhonePair({
  code,
  origin,
  connected,
  compact = false,
}: {
  code: string;
  origin: string;
  connected: boolean;
  compact?: boolean;
}) {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startPairing() {
    const hostSecret = readHostSecret(code);
    if (!hostSecret) {
      setError(messageFor("not_host"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await phoneRequest({ action: "pair", code, hostSecret });
      if (!result.ok || !result.pair || !result.expiresAt) {
        setError(messageFor(result.error));
        return;
      }
      const pair = result.pair;
      setPairing({ pair, expiresAt: result.expiresAt });
      // Просроченный код не висит на экране.
      const ttl = Math.max(0, Date.parse(result.expiresAt) - Date.now());
      window.setTimeout(() => {
        setPairing((current) => (current?.pair === pair ? null : current));
      }, ttl);
    } catch {
      setError(messageFor("network"));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    const hostSecret = readHostSecret(code);
    if (!hostSecret) return;
    if (!window.confirm("Отключить телефон ведущего? Пульт вернётся на экран."))
      return;
    setBusy(true);
    try {
      const result = await phoneRequest({
        action: "disconnect",
        code,
        hostSecret,
      });
      if (!result.ok) setError(messageFor(result.error));
    } catch {
      setError(messageFor("network"));
    } finally {
      setBusy(false);
    }
  }

  if (connected) {
    return (
      <div className={`host-phone-badge ${compact ? "is-compact" : ""}`}>
        <span className="hand">Ведущий с телефона</span>
        <button
          type="button"
          className="host-phone-off"
          disabled={busy}
          onClick={() => void disconnect()}
        >
          отключить
        </button>
        {error ? <span className="text-danger">{error}</span> : null}
      </div>
    );
  }

  const base =
    origin || (typeof window === "undefined" ? "" : window.location.origin);
  return (
    <>
      <button
        type="button"
        className={compact ? "text-pen underline" : "action is-ink mt-3"}
        disabled={busy}
        onClick={() => void startPairing()}
      >
        {busy ? "Готовим код…" : "Вести с телефона"}
      </button>
      {error ? <p className="text-danger">{error}</p> : null}
      {pairing
        ? createPortal(
            <div
              className="host-pair-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Подключить телефон ведущего"
            >
              <div className="sheet host-pair-card">
                <span className="tape tape-red hand">только для ведущего</span>
                <p className="hand mt-2 text-3xl">
                  Наведите камеру телефона ведущего
                </p>
                <StyledQr
                  value={phoneLink(base, code, pairing.pair)}
                  size={220}
                />
                <p className="mt-2 text-sm text-muted">
                  или откройте {base.replace(/^https?:\/\//, "")}
                  {phonePath(code)} и введите код
                </p>
                <p className="mono host-pair-code">
                  {formatPairCode(pairing.pair)}
                </p>
                <p className="text-sm text-muted">
                  Код одноразовый, действует 10 минут. Игрокам не показывайте —
                  с ним видно ответы.
                </p>
                <button
                  type="button"
                  className="action mt-3"
                  onClick={() => setPairing(null)}
                >
                  Спрятать
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
