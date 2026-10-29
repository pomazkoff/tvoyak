"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Board, PlayerRail, type BoardCell } from "@/components/game/board";
import { MediaPlayer } from "@/components/game/media-player";
import { speakRussian, stopSpeech } from "@/components/game/speech";
import {
  secondsLeft,
  useMatch,
  useNow,
  type GameRow,
} from "@/components/game/use-match";
import { Panel, Shell } from "@/components/shell";
import { scoreboardPlayers } from "@/lib/game/scoreboard";
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
  const queryDesk = useSyncExternalStore(
    () => () => undefined,
    () => new URLSearchParams(window.location.search).has("host"),
    () => false,
  );
  const [deskChoice, setDeskChoice] = useState<boolean | null>(null);
  const desk = deskChoice ?? queryDesk;
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

  if (match.status !== "ready" || !normalized) {
    const text =
      match.status === "invalid"
        ? "Код комнаты — четыре латинские буквы."
        : match.status === "unconfigured"
          ? "В .env.local нет SUPABASE_URL и SUPABASE_ANON_KEY."
          : match.status === "missing"
            ? "Такой комнаты нет."
            : match.status === "error"
              ? match.message
              : "Собираем комнату…";
    return (
      <Shell>
        <p className="hand text-4xl">{text}</p>
      </Shell>
    );
  }

  if (match.game.phase === "lobby") {
    return (
      <Lobby
        code={normalized}
        players={match.players}
        playUrl={playUrl}
        copied={copied}
        ownsRoom={ownsRoom}
        pending={pending}
        error={error}
        onCopy={() => void copyLink()}
        onStart={() => void run("start")}
      />
    );
  }

  return (
    <>
      <GameView
        code={normalized}
        players={match.players}
        board={match.board}
        game={match.game}
        now={now}
        error={error}
        hostStartsMedia={match.room.host_starts_media}
        hostMode={match.room.host_mode}
      />
      <HostDesk
        open={desk}
        onToggle={() => setDeskChoice((value) => !(value ?? queryDesk))}
        voiceOn={voiceOn}
        pending={pending}
        finalPicks={finalPicks}
        sheet={sheet}
        game={match.game}
        hostStartsMedia={match.room.host_starts_media}
        hostMode={match.room.host_mode}
        onVoice={(value) => setVoiceChoice(value)}
        onOpenBuzz={() => void run("open_buzz")}
        onPass={() => void run("pass")}
        onContinue={() => void run("continue")}
        onJudge={(correct) => void run("judge", { correct })}
        onFinalPick={(playerId, correct) =>
          setFinalPicks((current) => ({ ...current, [playerId]: correct }))
        }
        onFinalize={() =>
          void run("finalize", { decisions: decisionsFrom(sheet, finalPicks) })
        }
        onHostStarts={(value) => void run("media_cue", { correct: value })}
      />
    </>
  );
}

function Lobby({
  code,
  players,
  playUrl,
  copied,
  ownsRoom,
  pending,
  error,
  onCopy,
  onStart,
}: {
  code: string;
  players: PlayerRow[];
  playUrl: string;
  copied: "idle" | "copied" | "failed";
  ownsRoom: boolean;
  pending: boolean;
  error: string | null;
  onCopy: () => void;
  onStart: () => void;
}) {
  const seated = scoreboardPlayers(players);
  const watchers = players.filter((player) => player.role === "spectator");
  return (
    <main className="lobby">
      <div>
        {playUrl ? (
          <div
            className="polaroid inline-block"
            style={{ transform: "rotate(-2deg)" }}
            role="img"
            aria-label="QR-код"
          >
            <QRCodeSVG
              value={playUrl}
              size={220}
              bgColor="#ffffff"
              fgColor="#141414"
              level="M"
            />
          </div>
        ) : null}
        <p
          className="tape lobby-code poster"
          style={{ transform: "rotate(2deg)" }}
        >
          {code}
        </p>
        <button
          type="button"
          onClick={onCopy}
          className="hand mt-3 block text-2xl text-pen"
        >
          {copied === "copied" ? "Ссылка у вас" : "Скопировать ссылку"}
        </button>
        {copied === "failed" ? (
          <p className="text-danger">Не удалось скопировать.</p>
        ) : null}
        <p className="mt-2 max-w-xs text-sm text-muted">
          {ownsRoom
            ? "Ключ ведущего в этом браузере."
            : "Ключ ведущего в браузере, где комнату создали."}
        </p>
      </div>
      <div>
        {seated.length === 0 ? (
          <p className="hand text-4xl">Покажите QR</p>
        ) : (
          <ul>
            {seated.map((player, index) => (
              <li
                key={player.id}
                className="player-sticker hand"
                style={{ transform: `rotate(${index % 2 ? 4 : -3}deg)` }}
              >
                {player.nickname}
              </li>
            ))}
          </ul>
        )}
        {watchers.length > 0 ? (
          <p className="mt-4 text-muted">
            Зрители: {watchers.map((player) => player.nickname).join(", ")}
          </p>
        ) : null}
        {error ? <p className="mt-3 text-danger">{error}</p> : null}
        <button
          type="button"
          disabled={!ownsRoom || seated.length < 2 || pending}
          onClick={onStart}
          className="action mt-6"
        >
          {pending ? "Раздаём поле…" : "Начать игру"}
        </button>
        <p className="mt-2 text-sm text-muted">
          {seated.length < 2
            ? "Нужно минимум два игрока."
            : `${seated.length}/10`}
        </p>
      </div>
    </main>
  );
}

function GameView({
  code,
  players,
  board,
  game,
  now,
  error,
  hostStartsMedia,
  hostMode,
}: {
  code: string;
  players: PlayerRow[];
  board: BoardCell[];
  game: GameRow;
  now: number;
  error: string | null;
  hostStartsMedia: boolean;
  hostMode: "human" | "bot";
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
  const showSheet =
    Boolean(current?.prompt) &&
    !["board", "cat_pick", "finished", "lobby"].includes(game.phase);
  const hot = left !== null && left <= 5;

  return (
    <main className="stage">
      <div className="flex min-h-0 items-end gap-4">
        <PlayerRail
          players={players}
          activeId={game.chooser_player_id}
          note={game.phase === "board" ? "выбирает" : undefined}
        />
        <p className="enter-code mono">войти: {code}</p>
      </div>
      <div className="min-h-0">
        {error ? <p className="text-danger">{error}</p> : null}
        {game.phase === "board" || game.phase === "cat_pick" ? (
          <Board
            cells={board}
            round={game.round}
            canPick={false}
            activeId={game.current_question_id}
          />
        ) : null}
        {game.phase === "cat_pick" ? (
          <p className="hand absolute text-4xl text-danger">
            Кот в мешке. {chooser?.nickname ?? "Игрок"} выбирает, кому отдать.
          </p>
        ) : null}
        {showSheet && current ? (
          <article className="question-sheet">
            <span className="corner-tape a" />
            <span className="corner-tape b" />
            <p className="tape tape-red poster">
              {current.category} · {current.value || "финал"}
              {current.special === "cat" ? " · кот" : ""}
            </p>
            <h2 className="question-copy mt-4">
              {game.phase === "reveal" ? game.revealed_answer : current.prompt}
            </h2>
            {current.kind !== "text" && game.phase !== "reveal" ? (
              <MediaPlayer
                cell={current}
                autoplay={!(hostMode === "human" && hostStartsMedia)}
              />
            ) : null}
            {answering &&
            (game.phase === "answering" || game.phase === "judging") ? (
              <p key={answering.id} className="name-sticker hand">
                {answering.nickname}
              </p>
            ) : null}
            {left !== null && game.phase !== "reveal" ? (
              <div className={`timer poster ${hot ? "is-hot" : ""}`}>
                <svg viewBox="0 0 120 120" aria-hidden>
                  <circle className="timer-ring" cx="60" cy="60" r="48" />
                </svg>
                <span>{left}</span>
              </div>
            ) : null}
          </article>
        ) : null}
        {game.phase === "wager" && !current?.prompt ? (
          <article className="question-sheet">
            <h2 className="question-copy">Тайные ставки</h2>
            {left !== null ? (
              <div className={`timer poster ${hot ? "is-hot" : ""}`}>
                <svg viewBox="0 0 120 120" aria-hidden>
                  <circle className="timer-ring" cx="60" cy="60" r="48" />
                </svg>
                <span>{left}</span>
              </div>
            ) : null}
          </article>
        ) : null}
        {game.phase === "finished" ? <Results players={players} /> : null}
      </div>
    </main>
  );
}

function HostDesk({
  open,
  onToggle,
  voiceOn,
  pending,
  sheet,
  game,
  finalPicks,
  hostStartsMedia,
  hostMode,
  onVoice,
  onOpenBuzz,
  onPass,
  onContinue,
  onJudge,
  onFinalPick,
  onFinalize,
  onHostStarts,
}: {
  open: boolean;
  onToggle: () => void;
  voiceOn: boolean;
  pending: boolean;
  sheet: HostSheet | null;
  game: GameRow;
  finalPicks: Record<string, boolean>;
  hostStartsMedia: boolean;
  hostMode: "human" | "bot";
  onVoice: (value: boolean) => void;
  onOpenBuzz: () => void;
  onPass: () => void;
  onContinue: () => void;
  onJudge: (correct: boolean) => void;
  onFinalPick: (playerId: string, correct: boolean) => void;
  onFinalize: () => void;
  onHostStarts: (value: boolean) => void;
}) {
  return (
    <aside className={`drawer ${open ? "is-open" : ""}`}>
      <button type="button" className="drawer-tab" onClick={onToggle}>
        <span>Ведущему</span>
        <span>{open ? "скрыть" : "открыть"}</span>
      </button>
      <div className="grid gap-3 px-4 pb-4">
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
        {sheet?.expected ? <p>Эталон: {sheet.expected}</p> : null}
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
        <div className="flex flex-wrap gap-2">
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
      </div>
    </aside>
  );
}

function Results({ players }: { players: PlayerRow[] }) {
  const table = scoreboardPlayers(players)
    .slice()
    .sort((left, right) => right.score - left.score);
  return (
    <Panel>
      <h2 className="text-3xl font-semibold">Итог</h2>
      <ol className="mt-4 grid gap-2">
        {table.map((player, index) => (
          <li
            key={player.id}
            className="flex items-center justify-between border border-line bg-white px-4 py-3"
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
