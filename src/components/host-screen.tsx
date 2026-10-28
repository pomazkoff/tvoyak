"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { Board, ScoreStrip, type BoardCell } from "@/components/game/board";
import { speakRussian, stopSpeech } from "@/components/game/speech";
import {
  secondsLeft,
  useMatch,
  useNow,
  type GameRow,
} from "@/components/game/use-match";
import { Panel, Shell } from "@/components/shell";
import { normalizeRoomCode } from "@/lib/rooms/codes";
import { messageFor } from "@/lib/rooms/messages";
import { readHostSecret, useHasHostSecret } from "@/lib/rooms/storage";
import type { PlayerRow } from "@/lib/supabase/types";

type HostSheet = {
  ok?: boolean;
  prompt?: string | null;
  expected?: string | null;
  phase?: string;
  special?: string | null;
  rows?: Array<{
    player_id: string;
    nickname: string;
    raw_text: string;
    wager: number | null;
    suggestion_correct: boolean | null;
    verdict: string;
  }>;
};

export function HostScreen({ code, origin }: { code: string; origin: string }) {
  const normalized = normalizeRoomCode(code);
  const match = useMatch(code);
  const now = useNow();
  const playUrl = normalized && origin ? `${origin}/play/${normalized}` : "";
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const ownsRoom = useHasHostSecret(normalized);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sheet, setSheet] = useState<HostSheet | null>(null);
  const [voiceChoice, setVoiceChoice] = useState<boolean | null>(null);
  const [finalPicks, setFinalPicks] = useState<Record<string, boolean>>({});
  const spoken = useRef<string | null>(null);

  const game = match.status === "ready" ? match.game : null;
  const voiceOn =
    voiceChoice ?? (match.status === "ready" && match.room.host_mode === "bot");

  useEffect(() => {
    if (!normalized || !ownsRoom || !game) return;
    if (
      game.phase === "lobby" ||
      game.phase === "board" ||
      game.phase === "finished"
    )
      return;
    let cancelled = false;
    void callHost(normalized, "clue").then((payload) => {
      if (!cancelled) setSheet(payload as HostSheet);
    });
    return () => {
      cancelled = true;
    };
  }, [normalized, ownsRoom, game]);

  const hostMode = match.status === "ready" ? match.room.host_mode : null;
  const questionPrompt =
    match.status === "ready"
      ? match.board.find((cell) => cell.id === game?.current_question_id)
          ?.prompt
      : null;

  useEffect(() => {
    if (game?.phase !== "question") {
      stopSpeech();
      return;
    }
    if (!voiceOn || !questionPrompt || !normalized || !game.current_question_id)
      return;
    if (spoken.current === game.current_question_id) return;
    spoken.current = game.current_question_id;
    const started = speakRussian(questionPrompt, () => {
      if (hostMode === "bot") void callHost(normalized, "open_buzz");
    });
    if (!started && hostMode === "bot") {
      const timer = setTimeout(
        () => void callHost(normalized, "open_buzz"),
        8000,
      );
      return () => clearTimeout(timer);
    }
  }, [
    game?.phase,
    game?.current_question_id,
    questionPrompt,
    voiceOn,
    normalized,
    hostMode,
  ]);

  useEffect(() => {
    if (!normalized || !ownsRoom || !game || game.phase !== "judging") return;
    if (
      match.status !== "ready" ||
      match.room.host_mode !== "bot" ||
      game.round !== 3
    )
      return;
    void callHost(normalized, "finalize");
  }, [game, match, normalized, ownsRoom]);

  useEffect(() => {
    if (!normalized || !ownsRoom || !game || game.phase !== "reveal") return;
    const timer = setTimeout(() => void callHost(normalized, "continue"), 7000);
    return () => clearTimeout(timer);
  }, [game, normalized, ownsRoom]);

  async function run(action: string, extra?: Record<string, unknown>) {
    if (!normalized) return;
    setPending(true);
    setError(null);
    try {
      const result = await callHost(normalized, action, extra);
      if (result.ok === false) setError(messageFor(String(result.error ?? "")));
    } catch {
      setError(messageFor("network"));
    } finally {
      setPending(false);
    }
  }

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
    <Shell width="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Экран ведущего</p>
          <h1 className="mt-1 font-mono text-4xl font-semibold tracking-[0.28em] text-gold sm:text-5xl">
            {normalized ?? code}
          </h1>
        </div>
        {match.status === "ready" ? (
          <p className="max-w-sm text-sm leading-6 text-muted">
            {match.room.host_mode === "bot"
              ? "Ведущий-бот читает вопрос вслух и сам засчитывает ответ. Вы не играете."
              : "Вы ведущий и не играете. Вердикт можно поправить с этого экрана."}
          </p>
        ) : null}
      </div>

      {match.status === "invalid" ? (
        <Notice text="Код комнаты — четыре латинские буквы." />
      ) : null}
      {match.status === "unconfigured" ? (
        <Notice text="В .env.local нет SUPABASE_URL и SUPABASE_ANON_KEY. Добавьте их и перезапустите сервер." />
      ) : null}
      {match.status === "missing" ? (
        <Notice text="Такой комнаты нет. Проверьте код." />
      ) : null}
      {match.status === "error" ? <Notice text={match.message} /> : null}
      {match.status === "loading" ? <Notice text="Собираем комнату…" /> : null}

      {match.status === "ready" && normalized ? (
        <div className="grid gap-4">
          <ScoreStrip players={match.players} />
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          {match.game.phase === "lobby" ? (
            <Lobby
              players={match.players}
              playUrl={playUrl}
              copied={copied}
              ownsRoom={ownsRoom}
              pending={pending}
              onCopy={() => void copyLink()}
              onStart={() => void run("start")}
            />
          ) : (
            <GameView
              players={match.players}
              board={match.board}
              game={match.game}
              sheet={sheet}
              now={now}
              voiceOn={voiceOn}
              pending={pending}
              finalPicks={finalPicks}
              onVoice={(value) => setVoiceChoice(value)}
              onOpenBuzz={() => void run("open_buzz")}
              onPass={() => void run("pass")}
              onContinue={() => void run("continue")}
              onJudge={(correct) => void run("judge", { correct })}
              onFinalPick={(playerId, correct) =>
                setFinalPicks((current) => ({
                  ...current,
                  [playerId]: correct,
                }))
              }
              onFinalize={() =>
                void run("finalize", {
                  decisions: decisionsFrom(sheet, finalPicks),
                })
              }
            />
          )}
        </div>
      ) : null}
    </Shell>
  );
}

function Lobby({
  players,
  playUrl,
  copied,
  ownsRoom,
  pending,
  onCopy,
  onStart,
}: {
  players: PlayerRow[];
  playUrl: string;
  copied: "idle" | "copied" | "failed";
  ownsRoom: boolean;
  pending: boolean;
  onCopy: () => void;
  onStart: () => void;
}) {
  const seated = players.filter((player) => player.role === "player");
  const watchers = players.filter((player) => player.role === "spectator");
  return (
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
          onClick={onCopy}
          className="mt-4 inline-flex h-11 items-center justify-center rounded-full border border-line px-4 text-sm font-semibold hover:border-gold"
        >
          {copied === "copied" ? "Ссылка скопирована" : "Скопировать ссылку"}
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
        <Panel>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Игроки</h2>
            <p className="font-mono text-sm text-gold">{seated.length}/10</p>
          </div>
          {seated.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              Пока никого. Покажите QR-код.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {seated.map((player) => (
                <li key={player.id} className="flex justify-between py-3">
                  <span>{player.nickname}</span>
                  <span className="font-mono text-gold">{player.score}</span>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            disabled={!ownsRoom || seated.length < 2 || pending}
            onClick={onStart}
            className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full bg-gold font-semibold text-navy disabled:opacity-50"
          >
            {pending ? "Раздаём поле…" : "Начать игру"}
          </button>
          <p className="mt-2 text-sm text-muted">
            {seated.length < 2
              ? "Нужно минимум два игрока."
              : "Максимум десять игроков за столом."}
          </p>
        </Panel>
        <Panel>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Зрители</h2>
            <p className="font-mono text-sm text-gold">{watchers.length}</p>
          </div>
          {watchers.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Зрителей нет.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {watchers.map((player) => (
                <li key={player.id} className="py-3">
                  {player.nickname}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function GameView({
  players,
  board,
  game,
  sheet,
  now,
  voiceOn,
  pending,
  finalPicks,
  onVoice,
  onOpenBuzz,
  onPass,
  onContinue,
  onJudge,
  onFinalPick,
  onFinalize,
}: {
  players: PlayerRow[];
  board: BoardCell[];
  game: GameRow;
  sheet: HostSheet | null;
  now: number;
  voiceOn: boolean;
  pending: boolean;
  finalPicks: Record<string, boolean>;
  onVoice: (value: boolean) => void;
  onOpenBuzz: () => void;
  onPass: () => void;
  onContinue: () => void;
  onJudge: (correct: boolean) => void;
  onFinalPick: (playerId: string, correct: boolean) => void;
  onFinalize: () => void;
}) {
  const current = board.find((cell) => cell.id === game.current_question_id);
  const chooser = players.find(
    (player) => player.id === game.chooser_player_id,
  );
  const buzzWinner = players.find(
    (player) => player.id === game.buzz_winner_player_id,
  );
  const answering =
    current?.special === "cat"
      ? players.find((player) => player.id === current.assigned_player_id)
      : buzzWinner;
  const left = secondsLeft(game.deadline, now);
  const publicPrompt = current?.prompt;
  const showAnswerToHost =
    Boolean(sheet?.expected) &&
    ["question", "buzzing", "answering", "judging", "final_answer"].includes(
      game.phase,
    );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {roundLabel(game.round)}
          {chooser && game.phase === "board"
            ? ` · выбирает ${chooser.nickname}`
            : ""}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={voiceOn}
            onChange={(event) => onVoice(event.target.checked)}
          />
          Читать вопрос вслух
        </label>
      </div>

      {game.phase === "board" || game.phase === "cat_pick" ? (
        <Board cells={board} round={game.round} canPick={false} />
      ) : null}

      {game.phase === "cat_pick" ? (
        <Panel>
          <h2 className="text-2xl font-semibold">Кот в мешке</h2>
          <p className="mt-2 text-muted">
            {chooser?.nickname ?? "Игрок"} выбирает, кому отдать вопрос. Ответит
            только он.
          </p>
        </Panel>
      ) : null}

      {publicPrompt && game.phase !== "finished" ? (
        <Panel>
          <p className="text-sm text-gold">
            {current?.category} · {current?.value || "финал"}
            {current?.special === "cat" ? " · кот в мешке" : ""}
          </p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight">
            {publicPrompt}
          </h2>
          {left !== null && game.phase !== "reveal" ? (
            <p className="mt-3 font-mono text-gold">Осталось {left} с</p>
          ) : null}
          {game.phase === "question" ? (
            <button
              type="button"
              disabled={pending}
              onClick={onOpenBuzz}
              className="mt-5 inline-flex h-12 items-center rounded-full bg-gold px-6 font-semibold text-navy"
            >
              К кнопке
            </button>
          ) : null}
          {game.phase === "buzzing" ? (
            <button
              type="button"
              disabled={pending}
              onClick={onPass}
              className="mt-5 inline-flex h-12 items-center rounded-full border border-line px-6 font-semibold"
            >
              Никто не берёт
            </button>
          ) : null}
          {answering &&
          (game.phase === "answering" || game.phase === "judging") ? (
            <p className="mt-3 text-muted">Отвечает {answering.nickname}</p>
          ) : null}
        </Panel>
      ) : null}

      {showAnswerToHost ? (
        <Panel>
          <p className="text-sm text-muted">
            Только для ведущего, на телефонах этого нет
          </p>
          <p className="mt-2 text-xl">Эталон: {sheet?.expected}</p>
          {sheet?.rows
            ?.filter((row) => row.verdict === "pending" && row.raw_text)
            .map((row) => (
              <p key={row.player_id} className="mt-2">
                {row.nickname}: «{row.raw_text}»
                {row.suggestion_correct === null
                  ? ""
                  : row.suggestion_correct
                    ? " · автопроверка: верно"
                    : " · автопроверка: неверно"}
              </p>
            ))}
          {game.phase === "judging" && game.round !== 3 ? (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => onJudge(true)}
                className="h-12 rounded-full bg-gold px-5 font-semibold text-navy"
              >
                Верно
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => onJudge(false)}
                className="h-12 rounded-full border border-line px-5 font-semibold"
              >
                Неверно
              </button>
            </div>
          ) : null}
          {game.phase === "judging" && game.round === 3 ? (
            <div className="mt-4 grid gap-3">
              {sheet?.rows?.map((row) => {
                const picked =
                  finalPicks[row.player_id] ?? row.suggestion_correct === true;
                return (
                  <div
                    key={row.player_id}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <p>
                      {row.nickname}: «{row.raw_text || "—"}» · ставка{" "}
                      {row.wager ?? 0}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => onFinalPick(row.player_id, true)}
                        className={`rounded-full px-3 py-2 ${picked ? "bg-gold text-navy" : "border border-line"}`}
                      >
                        Верно
                      </button>
                      <button
                        type="button"
                        onClick={() => onFinalPick(row.player_id, false)}
                        className={`rounded-full px-3 py-2 ${picked ? "border border-line" : "bg-gold text-navy"}`}
                      >
                        Неверно
                      </button>
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                disabled={pending}
                onClick={onFinalize}
                className="h-12 rounded-full bg-gold font-semibold text-navy"
              >
                Показать итог
              </button>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {game.phase === "reveal" ? (
        <Panel>
          <p className="text-sm text-muted">Правильный ответ</p>
          <h2 className="mt-2 text-4xl font-semibold">
            {game.revealed_answer}
          </h2>
          <button
            type="button"
            disabled={pending}
            onClick={onContinue}
            className="mt-5 h-12 rounded-full bg-gold px-6 font-semibold text-navy"
          >
            Дальше
          </button>
        </Panel>
      ) : null}

      {game.phase === "wager" ? (
        <Panel>
          <h2 className="text-2xl font-semibold">Финал: тайные ставки</h2>
          <p className="mt-2 text-muted">
            Ставят только те, у кого больше нуля. Суммы скрыты.
          </p>
        </Panel>
      ) : null}

      {game.phase === "finished" ? <Results players={players} /> : null}
    </div>
  );
}

function Results({ players }: { players: PlayerRow[] }) {
  const table = players
    .filter((player) => player.role === "player")
    .slice()
    .sort((left, right) => right.score - left.score);
  return (
    <Panel>
      <h2 className="text-3xl font-semibold">Итог</h2>
      <ol className="mt-4 grid gap-2">
        {table.map((player, index) => (
          <li
            key={player.id}
            className="flex items-center justify-between rounded-2xl bg-navy px-4 py-3"
          >
            <span>
              {index + 1}. {player.nickname}
            </span>
            <span
              className={`font-mono text-xl ${player.score < 0 ? "text-danger" : "text-gold"}`}
            >
              {player.score}
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <Panel>
      <p role="status">{text}</p>
    </Panel>
  );
}

function roundLabel(round: number): string {
  if (round === 1) return "Раунд 1 · 100–500";
  if (round === 2) return "Раунд 2 · 200–1000";
  if (round === 3) return "Финал";
  return "Партия";
}

function decisionsFrom(
  sheet: HostSheet | null,
  picks: Record<string, boolean>,
) {
  return (sheet?.rows ?? []).map((row) => ({
    playerId: row.player_id,
    correct: picks[row.player_id] ?? row.suggestion_correct === true,
  }));
}

async function callHost(
  code: string,
  action: string,
  extra?: Record<string, unknown>,
) {
  const hostSecret = readHostSecret(code);
  if (!hostSecret) return { ok: false, error: "not_host" };
  const response = await fetch("/api/host/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, code, hostSecret, ...extra }),
  });
  return (await response.json()) as { ok?: boolean; error?: string };
}
