"use client";

import { useState } from "react";
import type { BoardCell } from "@/components/game/board";
import type { GameRow } from "@/components/game/use-match";

export type HostSheet = {
  ok?: boolean;
  error?: string;
  prompt?: string | null;
  expected?: string | null;
  variants?: string[] | null;
  phase?: string;
  special?: string | null;
  category?: string | null;
  value?: number | null;
  rows?: Array<{
    player_id: string;
    nickname: string;
    raw_text: string;
    wager: number | null;
    suggestion_correct: boolean | null;
    verdict: string;
  }>;
};

/** Ключ экрана ведущего или ключ привязанного телефона. */
export type HostCredentials =
  | { hostSecret: string; phoneToken?: undefined }
  | { phoneToken: string; hostSecret?: undefined };

export async function callHostAction(
  code: string,
  action: string,
  credentials: HostCredentials | null,
  extra?: Record<string, unknown>,
): Promise<{ ok?: boolean; error?: string; [key: string]: unknown }> {
  if (!credentials) return { ok: false, error: "not_host" };
  const response = await fetch("/api/host/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, code, ...credentials, ...extra }),
  });
  return (await response.json()) as { ok?: boolean; error?: string };
}

export function decisionsFrom(
  sheet: HostSheet | null,
  picks: Record<string, boolean>,
) {
  return (sheet?.rows ?? []).map((row) => ({
    playerId: row.player_id,
    correct: picks[row.player_id] ?? row.suggestion_correct === true,
  }));
}

/** Кого судит ведущий: отвечающий по кнопке или адресат «кота». */
export function answererId(match: {
  game: GameRow;
  board: BoardCell[];
}): string | undefined {
  const current = match.board.find(
    (cell) => cell.id === match.game.current_question_id,
  );
  const id =
    current?.special === "cat"
      ? current.assigned_player_id
      : match.game.buzz_winner_player_id;
  return id ?? undefined;
}

export type HostControlHandlers = {
  onVoice: (value: boolean) => void;
  onOpenBuzz: () => void;
  onPass: () => void;
  onContinue: () => void;
  onJudge: (correct: boolean) => void;
  onFinalPick: (playerId: string, correct: boolean) => void;
  onFinalize: () => void;
  onHostStarts: (value: boolean) => void;
};

/** Переключатели ведущего: голос и «трек включает ведущий». */
export function HostToggles({
  voiceOn,
  hostStartsMedia,
  hostMode,
  onVoice,
  onHostStarts,
}: {
  voiceOn: boolean;
  hostStartsMedia: boolean;
  hostMode: "human" | "bot";
  onVoice: (value: boolean) => void;
  onHostStarts: (value: boolean) => void;
}) {
  return (
    <>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={voiceOn}
          onChange={(event) => onVoice(event.target.checked)}
        />
        Читать вопрос вслух
      </label>
      {hostMode === "human" ? (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={hostStartsMedia}
            onChange={(event) => onHostStarts(event.target.checked)}
          />
          Трек включает ведущий
        </label>
      ) : null}
    </>
  );
}

/** Ответы игроков, ждущие решения ведущего. */
export function PendingAnswers({ sheet }: { sheet: HostSheet | null }) {
  return (
    <>
      {sheet?.rows
        ?.filter((row) => row.verdict === "pending" && row.raw_text)
        .map((row) => (
          <p key={row.player_id}>
            {row.nickname}: «{row.raw_text}»
            {row.suggestion_correct === null
              ? ""
              : row.suggestion_correct
                ? " · верно"
                : " · неверно"}
          </p>
        ))}
    </>
  );
}

/** Кнопки хода: К кнопке, Никто не берёт, Верно/Неверно, Дальше, финал. */
export function HostMoves({
  game,
  sheet,
  pending,
  finalPicks,
  onOpenBuzz,
  onPass,
  onContinue,
  onJudge,
  onFinalPick,
  onFinalize,
  className = "flex flex-wrap gap-2",
}: Pick<
  HostControlHandlers,
  | "onOpenBuzz"
  | "onPass"
  | "onContinue"
  | "onJudge"
  | "onFinalPick"
  | "onFinalize"
> & {
  game: GameRow;
  sheet: HostSheet | null;
  pending: boolean;
  finalPicks: Record<string, boolean>;
  className?: string;
}) {
  return (
    <>
      <div className={className}>
        {game.phase === "question" ? (
          <button
            type="button"
            disabled={pending}
            onClick={onOpenBuzz}
            className="action"
          >
            К кнопке
          </button>
        ) : null}
        {game.phase === "buzzing" ? (
          <button
            type="button"
            disabled={pending}
            onClick={onPass}
            className="action"
          >
            Никто не берёт
          </button>
        ) : null}
        {game.phase === "judging" && game.round !== 3 ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => onJudge(true)}
              className="action"
            >
              Верно
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => onJudge(false)}
              className="action bg-ink"
            >
              Неверно
            </button>
          </>
        ) : null}
        {game.phase === "reveal" ? (
          <button
            type="button"
            disabled={pending}
            onClick={onContinue}
            className="action"
          >
            Дальше
          </button>
        ) : null}
      </div>
      {game.phase === "judging" && game.round === 3 ? (
        <div className="grid gap-2">
          {sheet?.rows?.map((row) => {
            const picked =
              finalPicks[row.player_id] ?? row.suggestion_correct === true;
            return (
              <div
                key={row.player_id}
                className="flex flex-wrap items-center gap-2"
              >
                <p>
                  {row.nickname}: «{row.raw_text || "—"}» · {row.wager ?? 0}
                </p>
                <button
                  type="button"
                  onClick={() => onFinalPick(row.player_id, true)}
                  className="action"
                >
                  {picked ? "Верно" : "засчитать"}
                </button>
                <button
                  type="button"
                  onClick={() => onFinalPick(row.player_id, false)}
                  className="action bg-ink"
                >
                  Неверно
                </button>
              </div>
            );
          })}
          <button
            type="button"
            disabled={pending}
            onClick={onFinalize}
            className="action"
          >
            Показать итог
          </button>
        </div>
      ) : null}
    </>
  );
}

/**
 * Эталон на общем экране: скрыт, виден только пока кнопку держат нажатой
 * (мышь, палец или пробел/Enter). Отпустили или увели палец — снова скрыт.
 */
export function HoldToReveal({ answer }: { answer: string }) {
  const [shown, setShown] = useState(false);
  const show = () => setShown(true);
  const hide = () => setShown(false);
  return (
    <div className="hold-reveal">
      <button
        type="button"
        className="hold-reveal-button"
        aria-pressed={shown}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          show();
        }}
        onPointerUp={hide}
        onPointerCancel={hide}
        onLostPointerCapture={hide}
        onBlur={hide}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            show();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === " " || event.key === "Enter") hide();
        }}
      >
        {shown ? "Отпустите — спрячем" : "Показать ответ (держать)"}
      </button>
      {shown ? (
        <p className="hold-reveal-answer" role="status">
          Эталон: {answer}
        </p>
      ) : null}
    </div>
  );
}
