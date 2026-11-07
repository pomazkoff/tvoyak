"use client";

import { useEffect, useState } from "react";
import { messageFor } from "@/lib/rooms/messages";
import { readHostSecret } from "@/lib/rooms/storage";
import {
  formatCodeTtl,
  formatTvCode,
  isTvDisplay,
  normalizeTvCode,
  tvEntryLabel,
} from "@/lib/rooms/tv-code";

type Pairing = { code: string; expiresAt: string };

type TvResult = {
  ok?: boolean;
  error?: string;
  tvCode?: string;
  expiresAt?: string;
  active?: boolean;
  linked?: boolean;
};

const inflight = new Map<string, Promise<Pairing>>();

function storageKey(room: string) {
  return `tvoyak.tvCode.${room}`;
}

function readStored(room: string): Pairing | null {
  try {
    const raw = sessionStorage.getItem(storageKey(room));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Pairing>;
    const code = normalizeTvCode(parsed.code);
    if (!code || typeof parsed.expiresAt !== "string") return null;
    if (Date.parse(parsed.expiresAt) <= Date.now()) return null;
    return { code, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function writeStored(room: string, pairing: Pairing | null) {
  try {
    if (!pairing) sessionStorage.removeItem(storageKey(room));
    else sessionStorage.setItem(storageKey(room), JSON.stringify(pairing));
  } catch {
    // Код останется на экране, пока вкладка открыта.
  }
}

async function post(body: Record<string, unknown>): Promise<TvResult> {
  const response = await fetch("/api/host/tv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as TvResult;
}

function mint(room: string): Promise<Pairing> {
  const existing = inflight.get(room);
  if (existing) return existing;
  const job = (async () => {
    const hostSecret = readHostSecret(room);
    if (!hostSecret) throw new Error("not_host");
    const result = await post({ action: "mint", code: room, hostSecret });
    const code = normalizeTvCode(result.tvCode);
    if (!result.ok || !code || !result.expiresAt) {
      throw new Error(result.error || "rpc_failed");
    }
    const pairing = { code, expiresAt: result.expiresAt };
    writeStored(room, pairing);
    return pairing;
  })().finally(() => {
    inflight.delete(room);
  });
  inflight.set(room, job);
  return job;
}

/**
 * На телефоне ведущего: «откройте /tv и введите код».
 * На телевизоре, который сам пришёл с /tv, карточки нет.
 */
export function TvPairCard({
  roomCode,
  origin,
  variant,
}: {
  roomCode: string;
  origin: string;
  variant: "banner" | "slim";
}) {
  const [gate, setGate] = useState<"pending" | "tv" | "host">("pending");
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [linked, setLinked] = useState(false);
  const [linkKnown, setLinkKnown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const entry = tvEntryLabel(origin);

  useEffect(() => {
    let stop = false;
    // Не в теле эффекта: чтение localStorage и смена состояния — после отрисовки.
    const id = window.setTimeout(() => {
      if (stop) return;
      if (isTvDisplay(roomCode)) {
        setGate("tv");
        return;
      }
      setGate("host");
      const stored = readStored(roomCode);
      if (stored) {
        setPairing(stored);
        return;
      }
      const pending = inflight.get(roomCode);
      if (pending) {
        void pending
          .then((next) => {
            if (!stop) setPairing(next);
          })
          .catch(() => {
            if (!stop) setLinkKnown(true);
          });
        return;
      }
      if (variant === "banner") {
        setBusy(true);
        void mint(roomCode)
          .then((next) => {
            if (!stop) setPairing(next);
          })
          .catch((reason: unknown) => {
            if (stop) return;
            const code =
              reason instanceof Error ? reason.message : "rpc_failed";
            setError(messageFor(code === "Failed to fetch" ? "network" : code));
          })
          .finally(() => {
            if (!stop) setBusy(false);
          });
        return;
      }
      const hostSecret = readHostSecret(roomCode);
      if (!hostSecret) {
        setLinkKnown(true);
        return;
      }
      void post({ action: "status", code: roomCode, hostSecret })
        .then((result) => {
          if (!stop && result.ok && result.linked) setLinked(true);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!stop) setLinkKnown(true);
        });
    }, 0);
    return () => {
      stop = true;
      window.clearTimeout(id);
    };
  }, [roomCode, variant]);

  const live =
    pairing && formatCodeTtl(pairing.expiresAt, now) ? pairing : null;

  useEffect(() => {
    if (gate !== "host" || !live) return;
    let stop = false;
    async function tick() {
      const hostSecret = readHostSecret(roomCode);
      if (!hostSecret || !live) return;
      try {
        const result = await post({
          action: "status",
          code: roomCode,
          hostSecret,
          tvCode: live.code,
        });
        if (stop || !result.ok) return;
        if (!result.active) {
          writeStored(roomCode, null);
          setPairing(null);
          if (result.linked) setLinked(true);
        }
      } catch {
        // Сеть моргнула — код на экране оставляем.
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), 4000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [gate, live, roomCode]);

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [live]);

  useEffect(() => {
    if (pairing && !live) writeStored(roomCode, null);
  }, [pairing, live, roomCode]);

  async function renew() {
    if (
      linked &&
      !window.confirm(
        "Новый код отключит текущий телевизор, когда его введут. Продолжить?",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setLinked(false);
    try {
      setPairing(await mint(roomCode));
    } catch (reason: unknown) {
      const code = reason instanceof Error ? reason.message : "rpc_failed";
      setError(messageFor(code));
    } finally {
      setBusy(false);
    }
  }

  if (gate !== "host") return null;

  const ttl = live ? formatCodeTtl(live.expiresAt, now) : null;

  if (variant === "slim") {
    if (!live) {
      if (!(linkKnown || pairing) || linked) return null;
      return (
        <button
          type="button"
          className="tv-pair-slim sheet"
          disabled={busy}
          onClick={() => void renew()}
        >
          {busy ? "Готовим код…" : "Код для телевизора"}
        </button>
      );
    }
    return (
      <p className="tv-pair-slim sheet" role="status">
        <span>
          На телевизоре откройте <span className="mono">{entry}</span>
        </span>
        <span className="mono tv-pair-slim-code">
          {formatTvCode(live.code)}
        </span>
      </p>
    );
  }

  return (
    <section className="tv-pair sheet lobby-tv" aria-live="polite">
      <span className="tape tape-red hand">телевизор</span>
      {live ? (
        <>
          <p className="tv-pair-lead hand">
            На телевизоре откройте{" "}
            <span className="mono tv-pair-url">{entry}</span>
            <br />и введите код
          </p>
          <p className="tv-pair-digits mono" aria-label={`Код ${live.code}`}>
            {formatTvCode(live.code)}
          </p>
          <p className="tv-pair-note">
            Код действует {ttl ?? "ещё немного"}. Игрокам не показывайте — по
            нему открывается табло ведущего. Вход на телевизоре не нужен.
          </p>
        </>
      ) : linked ? (
        <p className="tv-pair-lead hand">Телевизор подключён</p>
      ) : (
        <p className="tv-pair-lead hand">
          {busy ? "Готовим код для телевизора…" : "Код для телевизора"}
        </p>
      )}
      {error ? (
        <p className="text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {!live ? (
        <button
          type="button"
          className="action mt-2"
          disabled={busy}
          onClick={() => void renew()}
        >
          {busy ? "Готовим код…" : "Показать код для телевизора"}
        </button>
      ) : (
        <button
          type="button"
          className="tv-pair-refresh"
          disabled={busy}
          onClick={() => void renew()}
        >
          Новый код
        </button>
      )}
    </section>
  );
}
