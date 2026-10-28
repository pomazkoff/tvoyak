"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Panel, Shell } from "@/components/shell";
import { useRoomLobby } from "@/components/use-room-lobby";
import { normalizeRoomCode } from "@/lib/rooms/codes";
import { useHasHostSecret } from "@/lib/rooms/storage";
import type { PlayerRow } from "@/lib/supabase/types";

export function HostScreen({ code, origin }: { code: string; origin: string }) {
  const normalized = normalizeRoomCode(code);
  const lobby = useRoomLobby(code);
  const playUrl = normalized && origin ? `${origin}/play/${normalized}` : "";
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const ownsRoom = useHasHostSecret(normalized);

  async function copyLink() {
    if (!playUrl) return;
    try {
      await navigator.clipboard.writeText(playUrl);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Экран ведущего</p>
          <h1 className="mt-1 font-mono text-5xl font-semibold tracking-[0.28em] text-gold sm:text-6xl">
            {normalized ?? code}
          </h1>
        </div>
        <p className="max-w-sm text-sm leading-6 text-muted">
          {lobby.status === "ready" && lobby.room.host_mode === "bot"
            ? "В комнате отмечен ведущий-бот. Голос появится позже, пока игру открываете вы и не играете."
            : "Вы ведущий и не играете. Игроки заходят с телефонов."}
        </p>
      </div>

      {lobby.status === "invalid" ? (
        <Notice text="Код комнаты — четыре латинские буквы." />
      ) : null}
      {lobby.status === "unconfigured" ? (
        <Notice text="В .env.local нет SUPABASE_URL и SUPABASE_ANON_KEY. Добавьте их и перезапустите сервер." />
      ) : null}
      {lobby.status === "missing" ? (
        <Notice text="Такой комнаты нет. Проверьте код." />
      ) : null}
      {lobby.status === "error" ? <Notice text={lobby.message} /> : null}
      {lobby.status === "loading" ? <Notice text="Собираем лобби…" /> : null}

      {lobby.status === "ready" && normalized ? (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Panel className="flex flex-col items-center text-center">
            {playUrl ? (
              <div
                className="rounded-2xl bg-white p-3"
                role="img"
                aria-label="QR-код для входа в комнату"
              >
                <QRCodeSVG
                  value={playUrl}
                  size={208}
                  bgColor="#ffffff"
                  fgColor="#07111f"
                  level="M"
                />
              </div>
            ) : null}
            <a
              href={playUrl}
              className="mt-4 break-all text-sm text-gold underline-offset-4 hover:underline"
            >
              {playUrl}
            </a>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="mt-4 inline-flex h-11 items-center justify-center rounded-full border border-line px-4 text-sm font-semibold hover:border-gold"
            >
              {copied === "copied"
                ? "Ссылка скопирована"
                : "Скопировать ссылку"}
            </button>
            {copied === "failed" ? (
              <p className="mt-2 text-xs text-danger">
                Не удалось скопировать. Выделите ссылку вручную.
              </p>
            ) : null}
            <p className="mt-4 text-xs leading-5 text-muted">
              {ownsRoom
                ? "Ключ ведущего записан в этом браузере."
                : "Ключ ведущего есть в браузере, где комнату создали."}
            </p>
          </Panel>

          <div className="grid gap-4">
            <PlayerColumn
              title="Игроки"
              countLabel={`${lobby.players.filter((player) => player.role === "player").length}/10`}
              people={lobby.players.filter(
                (player) => player.role === "player",
              )}
              empty="Пока никого. Покажите QR-код."
              showScore
            />
            <PlayerColumn
              title="Зрители"
              countLabel={String(
                lobby.players.filter((player) => player.role === "spectator")
                  .length,
              )}
              people={lobby.players.filter(
                (player) => player.role === "spectator",
              )}
              empty="Зрителей нет."
            />
            <p className="text-sm text-muted">
              Поле 6×5 появится, когда начнётся партия. Сейчас комната в лобби.
            </p>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <Panel>
      <p role="status">{text}</p>
    </Panel>
  );
}

function PlayerColumn({
  title,
  countLabel,
  people,
  empty,
  showScore = false,
}: {
  title: string;
  countLabel: string;
  people: PlayerRow[];
  empty: string;
  showScore?: boolean;
}) {
  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="font-mono text-sm text-gold" aria-live="polite">
          {countLabel}
        </p>
      </div>
      {people.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {people.map((player) => (
            <li
              key={player.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <span className="truncate font-medium">{player.nickname}</span>
              {showScore ? (
                <span className="font-mono text-gold tabular-nums">
                  {player.score}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
