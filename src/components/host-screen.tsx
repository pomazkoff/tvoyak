"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Board, PlayerRail, type BoardCell } from "@/components/game/board";
import { MediaPlayer } from "@/components/game/media-player";
import { speakRussian, stopSpeech } from "@/components/game/speech";
import {
  requestMatchReload,
  secondsLeft,
  useMatch,
  useNow,
  type GameRow,
} from "@/components/game/use-match";
import { Logo } from "@/components/marks";
import { Panel, Shell } from "@/components/shell";
import { StyledQr } from "@/components/styled-qr";
import { scoreboardPlayers } from "@/lib/game/scoreboard";
import { verdictLine } from "@/lib/game/verdict-speech";
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
  const [toast, setToast] = useState<string | null>(null);
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
      // На поле не обрываем: бот договаривает вердикт после вскрытия.
      if (game?.phase !== "board" || !voiceOn) stopSpeech();
      return;
    }
    if (!questionPrompt || !normalized || !game.current_question_id) return;
    const openBuzz = () =>
      void callHost(normalized, "open_buzz").then(() => requestMatchReload());
    let started = false;
    if (voiceOn && spoken.current !== game.current_question_id) {
      spoken.current = game.current_question_id;
      started = speakRussian(questionPrompt, () => {
        if (hostMode === "bot") openBuzz();
      });
    }
    if (hostMode !== "bot") return;
    // Бот открывает кнопку и без голоса: голос выключен, синтеза нет или
    // onend так и не пришёл. Срок — примерно время чтения вслух.
    const readMs = Math.min(
      30000,
      Math.max(6000, questionPrompt.length * 70 + 2500),
    );
    const timer = setTimeout(openBuzz, started ? readMs + 4000 : readMs);
    return () => clearTimeout(timer);
  }, [
    game?.phase,
    game?.current_question_id,
    questionPrompt,
    voiceOn,
    normalized,
    hostMode,
  ]);

  // Бот-ведущий озвучивает вердикт. Очки и фаза приходят отдельными
  // событиями, поэтому сравниваем очки чуть позже перехода.
  const scores =
    match.status === "ready"
      ? Object.fromEntries(match.players.map((p) => [p.id, p.score]))
      : {};
  const scoresRef = useRef(scores);
  const verdictFrom = useRef<{ phase: string; scores: Record<string, number> }>(
    { phase: "", scores: {} },
  );
  const phaseNow = game?.phase ?? "";
  const answerRef = useRef<string | null>(null);
  const roundNow = game?.round ?? 0;
  useEffect(() => {
    const from = verdictFrom.current;
    verdictFrom.current = { phase: phaseNow, scores: scoresRef.current };
    if (!voiceOn || hostMode !== "bot" || roundNow === 3) return;
    if (from.phase === phaseNow) return;
    const timer = window.setTimeout(() => {
      const line = verdictLine({
        from: from.phase,
        to: phaseNow,
        before: from.scores,
        after: scoresRef.current,
        answer: answerRef.current,
      });
      if (line) speakRussian(line);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [phaseNow, roundNow, voiceOn, hostMode]);
  // После эффекта вердикта: там scoresRef ещё хранит очки прошлого рендера.
  const revealedAnswer = game?.revealed_answer ?? null;
  useEffect(() => {
    scoresRef.current = scores;
    answerRef.current = revealedAnswer;
  });

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

  // Переход reveal → поле делают серверные часы (advance_clock в useMatch):
  // через 4 секунды после вскрытия ответа, даже если телевизор закрыт.

  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => {
      setToast((current) => (current === text ? null : current));
    }, 2400);
  }

  async function run(action: string, extra?: Record<string, unknown>) {
    if (!normalized) return;
    setPending(true);
    setError(null);
    try {
      const result = await callHost(normalized, action, extra);
      // Не ждём realtime: сразу перечитываем партию, иначе экран (и кнопки
      // ведущего) ещё секунды показывают старую фазу.
      requestMatchReload();
      // «Дальше» и «Никто не берёт» могли опередить серверные часы — это не ошибка.
      const raced =
        (action === "continue" || action === "pass") &&
        result.error === "bad_phase";
      if (result.ok !== true && !raced) {
        const text = messageFor(String(result.error ?? ""));
        setError(text);
        if (action === "pick") showToast(text);
      }
    } catch {
      const text = messageFor("network");
      setError(text);
      if (action === "pick") showToast(text);
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
        pending={pending}
        ownsRoom={ownsRoom}
        hostStartsMedia={match.room.host_starts_media}
        hostMode={match.room.host_mode}
        onHostPick={(questionId) => void run("pick", { questionId })}
        onBlockedPick={(nickname) =>
          showToast(`Выбирает ${nickname} с телефона`)
        }
      />
      {toast ? (
        <p className="toast hand" role="status">
          {toast}
        </p>
      ) : null}
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
        onJudge={(correct) =>
          void run("judge", { correct, playerId: answererId(match) })
        }
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
        <header className="app-header">
          <Logo compact />
        </header>
        {playUrl ? (
          <div className="qr-card">
            <span className="tape hand" style={{ transform: "rotate(-3deg)" }}>
              наведи камеру
            </span>
            <StyledQr value={playUrl} />
            <div className="qr-aside">
              <p className="hand qr-hand-code">{code}</p>
              <p className="hand qr-hand-hint">наведи камеру</p>
            </div>
          </div>
        ) : null}
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
  pending,
  ownsRoom,
  hostStartsMedia,
  hostMode,
  onHostPick,
  onBlockedPick,
}: {
  code: string;
  players: PlayerRow[];
  board: BoardCell[];
  game: GameRow;
  now: number;
  error: string | null;
  pending: boolean;
  ownsRoom: boolean;
  hostStartsMedia: boolean;
  hostMode: "human" | "bot";
  onHostPick: (questionId: string) => void;
  onBlockedPick: (nickname: string) => void;
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
  // Видео и музыка остаются на месте и при ответе: снимаются только полоски.
  const hasMedia =
    Boolean(current) &&
    current?.kind !== "text" &&
    (current?.kind !== "image" || game.phase !== "reveal");
  const hot = left !== null && left <= 5;
  const chooserName = chooser?.nickname ?? "игрок";
  // В обоих режимах ведущий может выбрать клетку за игрока (телефон отвалился).
  const hostCanPick = ownsRoom && game.phase === "board" && !pending;

  return (
    <main className="stage">
      <header className="stage-head">
        <Logo compact />
        <PlayerRail
          players={players}
          activeId={game.chooser_player_id}
          note={game.phase === "board" ? "выбирает" : undefined}
        />
        <p className="enter-code mono">войти: {code}</p>
      </header>
      <div className="stage-body">
        {error ? (
          <p className="text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {game.phase === "board" ? (
          <p className="pick-prompt hand">
            Выбирает {chooserName} с телефона
            {hostCanPick && hostMode !== "bot"
              ? " — или нажмите клетку за него"
              : ""}
          </p>
        ) : null}
        {game.phase === "board" || game.phase === "cat_pick" ? (
          <Board
            cells={board}
            round={game.round}
            canPick={hostCanPick}
            activeId={game.current_question_id}
            onPick={(cell) => onHostPick(cell.id)}
            onRefuse={() => {
              if (!pending) onBlockedPick(chooserName);
            }}
          />
        ) : null}
        {game.phase === "cat_pick" ? (
          <p className="hand absolute text-4xl text-danger">
            Кот в мешке. {chooser?.nickname ?? "Игрок"} выбирает, кому отдать.
          </p>
        ) : null}
        {showSheet && current ? (
          <article className={`question-sheet ${hasMedia ? "has-media" : ""}`}>
            <span className="corner-tape a" />
            <span className="corner-tape b" />
            <p className="tape tape-red poster">
              {current.category} · {current.value || "финал"}
              {current.special === "cat" ? " · кот" : ""}
            </p>
            <h2 className="question-copy mt-4">
              {game.phase === "reveal" ? game.revealed_answer : current.prompt}
            </h2>
            {hasMedia ? (
              <MediaPlayer
                cell={current}
                autoplay={!(hostMode === "human" && hostStartsMedia)}
                revealed={game.phase === "reveal"}
              />
            ) : null}
            {answering &&
            (game.phase === "answering" || game.phase === "judging") ? (
              <p key={answering.id} className="name-sticker hand">
                {answering.nickname}
              </p>
            ) : null}
            {left === 0 &&
            (game.phase === "answering" || game.phase === "buzzing") ? (
              <p className="time-up hand" role="status">
                Время вышло
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

/** Кого судит ведущий: отвечающий по кнопке или адресат «кота». */
function answererId(match: {
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
