"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useBackgroundMusic } from "@/components/game/background-music";
import { Board, PlayerRail, type BoardCell } from "@/components/game/board";
import {
  HoldToReveal,
  HostMoves,
  HostToggles,
  PendingAnswers,
  answererId,
  callHostAction,
  decisionsFrom,
  type HostSheet,
} from "@/components/game/host-controls";
import { HostPhonePair } from "@/components/game/host-phone-pair";
import { MediaPlayer } from "@/components/game/media-player";
import { PictureTask } from "@/components/game/picture-task";
import { MusicToggle } from "@/components/game/music-toggle";
import {
  armSpeechUnlock,
  prewarmSpeech,
  speakRussian,
  stopSpeech,
  type TtsAuth,
} from "@/components/game/speech";
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
import { mediaPlaysSound } from "@/lib/game/music-pause";
import { scoreboardPlayers } from "@/lib/game/scoreboard";
import { verdictLine } from "@/lib/game/verdict-speech";
import { normalizeRoomCode } from "@/lib/rooms/codes";
import { messageFor } from "@/lib/rooms/messages";
import {
  hashWithoutSecret,
  hostLink,
  secretFromHash,
} from "@/lib/rooms/host-link";
import { phonePath } from "@/lib/rooms/host-phone";
import {
  readHostSecret,
  readPhoneToken,
  saveHostSecret,
  useHasHostSecret,
} from "@/lib/rooms/storage";
import type { PlayerRow } from "@/lib/supabase/types";

const noopSubscribe = () => () => undefined;

// Голос Марины доступен только телевизору с ключом ведущего: /api/tts
// озвучивает фразы комнаты лишь для её хозяина.
function ttsAuth(code: string | null, ownsRoom: boolean): TtsAuth | null {
  if (!code || !ownsRoom) return null;
  const hostSecret = readHostSecret(code);
  return hostSecret ? { code, hostSecret } : null;
}

export function HostScreen({ code, origin }: { code: string; origin: string }) {
  const normalized = normalizeRoomCode(code);
  const match = useMatch(code);
  const now = useNow();
  const playUrl = normalized && origin ? `${origin}/play/${normalized}` : "";
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const ownsRoom = useHasHostSecret(normalized);
  const [hostCopied, setHostCopied] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  // Ссылка ведущего (#k=…): сохраняем ключ для этого адреса и сразу стираем
  // его из адресной строки и истории.
  useEffect(() => {
    if (!normalized) return;
    const secret = secretFromHash(window.location.hash);
    if (!secret) return;
    saveHostSecret(normalized, secret);
    const { pathname, search, hash } = window.location;
    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}${search}${hashWithoutSecret(hash)}`,
    );
  }, [normalized]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sheet, setSheet] = useState<HostSheet | null>(null);
  // Выбор «читать вслух» до ответа сервера: действует, пока в комнате
  // тот же host_voice, что был при нажатии (потом верх берёт общий флаг).
  const [voiceChoice, setVoiceChoice] = useState<{
    value: boolean;
    base: boolean | null;
  } | null>(null);
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
  const roomVoice =
    match.status === "ready" ? (match.room.host_voice ?? null) : null;
  const voiceOn =
    voiceChoice && (!ownsRoom || voiceChoice.base === roomVoice)
      ? voiceChoice.value
      : (roomVoice ??
        (match.status === "ready" && match.room.host_mode === "bot"));
  // Ведущий подключил телефон: эталон и пульт только там.
  const phoneHost =
    match.status === "ready" &&
    match.room.host_mode === "human" &&
    match.room.host_phone === true;

  // На этом браузере уже привязан телефон ведущего (а ключа комнаты нет) —
  // сразу на пульт ведущего.
  useEffect(() => {
    if (!normalized || ownsRoom || readHostSecret(normalized)) return;
    if (readPhoneToken(normalized))
      window.location.replace(phonePath(normalized));
  }, [normalized, ownsRoom]);

  useEffect(() => {
    if (!normalized || !ownsRoom || !game || phoneHost) return;
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
  }, [normalized, ownsRoom, game, phoneHost]);

  const hostMode = match.status === "ready" ? match.room.host_mode : null;
  const questionPrompt =
    match.status === "ready"
      ? match.board.find((cell) => cell.id === game?.current_question_id)
          ?.prompt
      : null;

  // Фоновая музыка: тихо в лобби и в игре, пауза на вопросах с видео и
  // треком (до возврата на поле), под голосом ведущего — тише.
  const currentCell =
    match.status === "ready"
      ? match.board.find((cell) => cell.id === game?.current_question_id)
      : undefined;
  useBackgroundMusic({
    suppressed: Boolean(
      game && currentCell && mediaPlaysSound(currentCell, game.phase),
    ),
  });

  // Голос ведущего разблокируется на первом клике/кнопке пульта: без этого
  // телевизоры (Android WebView) не пускают mp3 Марины без свежего жеста.
  useEffect(() => {
    armSpeechUnlock();
  }, []);

  // Прогрев на раунд: пока игроки выбирают клетку, сервер заранее
  // синтезирует вопросы раунда, и на открытии звук уже в кэше.
  const warmedRound = useRef<number | null>(null);
  const roundForWarm = game?.round ?? null;
  const phaseForWarm = game?.phase ?? null;
  useEffect(() => {
    if (!voiceOn || roundForWarm === null) return;
    if (phaseForWarm !== "board" && phaseForWarm !== "question") return;
    if (warmedRound.current === roundForWarm) return;
    const auth = ttsAuth(normalized, ownsRoom);
    if (!auth) return;
    warmedRound.current = roundForWarm;
    prewarmSpeech(auth);
  }, [voiceOn, roundForWarm, phaseForWarm, normalized, ownsRoom]);

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
      started = speakRussian(
        questionPrompt,
        () => {
          if (hostMode === "bot") openBuzz();
        },
        ttsAuth(normalized, ownsRoom),
      );
    }
    if (hostMode !== "bot") return;
    // Бот открывает кнопку и без голоса: голос выключен, синтеза нет или
    // onend так и не пришёл. Срок — примерно время чтения вслух (+ до 3 с
    // на загрузку голоса Марины).
    const readMs = Math.min(
      30000,
      Math.max(6000, questionPrompt.length * 70 + 2500),
    );
    const timer = setTimeout(openBuzz, started ? readMs + 7000 : readMs);
    return () => clearTimeout(timer);
  }, [
    game?.phase,
    game?.current_question_id,
    questionPrompt,
    voiceOn,
    normalized,
    hostMode,
    ownsRoom,
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
      if (line) speakRussian(line, undefined, ttsAuth(normalized, ownsRoom));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [phaseNow, roundNow, voiceOn, hostMode, normalized, ownsRoom]);
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

  async function copyHostLink() {
    const secret = normalized ? readHostSecret(normalized) : null;
    if (!secret || !normalized) return;
    try {
      await navigator.clipboard.writeText(
        hostLink(window.location.origin, normalized, secret),
      );
      setHostCopied("copied");
    } catch {
      setHostCopied("failed");
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
      <>
        <MusicToggle credits />
        <Lobby
          code={normalized}
          players={match.players}
          playUrl={playUrl}
          copied={copied}
          ownsRoom={ownsRoom}
          pending={pending}
          error={error}
          onCopy={() => void copyLink()}
          hostCopied={hostCopied}
          onCopyHost={() => void copyHostLink()}
          onStart={() => void run("start")}
          origin={origin}
          hostMode={match.room.host_mode}
          phoneHost={phoneHost}
        />
      </>
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
      <MusicToggle raised />
      {phoneHost ? (
        <div className="host-phone-corner">
          {ownsRoom ? (
            <HostPhonePair
              key="on"
              code={normalized}
              origin={origin}
              connected
              compact
            />
          ) : (
            <span className="hand">Ведущий с телефона</span>
          )}
        </div>
      ) : (
        <HostDesk
          open={desk}
          onToggle={() => setDeskChoice((value) => !(value ?? queryDesk))}
          code={normalized}
          origin={origin}
          ownsRoom={ownsRoom}
          voiceOn={voiceOn}
          pending={pending}
          finalPicks={finalPicks}
          sheet={sheet}
          game={match.game}
          hostStartsMedia={match.room.host_starts_media}
          hostMode={match.room.host_mode}
          onVoice={(value) => {
            setVoiceChoice({ value, base: roomVoice });
            if (ownsRoom) void run("voice", { correct: value });
          }}
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
            void run("finalize", {
              decisions: decisionsFrom(sheet, finalPicks),
            })
          }
          onHostStarts={(value) => void run("media_cue", { correct: value })}
        />
      )}
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
  hostCopied,
  onCopyHost,
  onStart,
  origin,
  hostMode,
  phoneHost,
}: {
  code: string;
  players: PlayerRow[];
  playUrl: string;
  copied: "idle" | "copied" | "failed";
  ownsRoom: boolean;
  pending: boolean;
  error: string | null;
  onCopy: () => void;
  hostCopied: "idle" | "copied" | "failed";
  onCopyHost: () => void;
  onStart: () => void;
  origin: string;
  hostMode: "human" | "bot";
  phoneHost: boolean;
}) {
  const seated = scoreboardPlayers(players);
  // На сервере ключа не видно — табличку показываем только в браузере.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
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
        {ownsRoom ? (
          <div className="mt-2 max-w-xs text-sm text-muted">
            <p>Ключ ведущего в этом браузере.</p>
            <button
              type="button"
              onClick={onCopyHost}
              className="mt-1 text-pen underline"
            >
              {hostCopied === "copied"
                ? "Ссылка ведущего скопирована"
                : "Скопировать ссылку ведущего"}
            </button>
            <p className="mt-1">
              Откройте её на телевизоре, чтобы вести игру оттуда. Не отправляйте
              игрокам — по ней можно управлять комнатой.
            </p>
            {hostCopied === "failed" ? (
              <p className="text-danger">Не удалось скопировать.</p>
            ) : null}
            {hostMode === "human" ? (
              <div className="mt-3">
                <p>
                  Эталон и пульт — на телефоне ведущего, чтобы игроки не видели
                  ответ на экране.
                </p>
                <HostPhonePair
                  key={phoneHost ? "on" : "off"}
                  code={code}
                  origin={origin}
                  connected={phoneHost}
                />
              </div>
            ) : null}
          </div>
        ) : null}
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
        {ownsRoom || !mounted ? null : (
          <div role="alert" className="not-host-plate mt-6 max-w-md">
            <p className="hand text-3xl">
              Этот браузер не ведущий этой комнаты
            </p>
            <p className="mt-2 text-sm">
              Начать игру может только браузер, где комнату создали, или тот,
              кто открыл ссылку ведущего оттуда. Адрес сайта тоже должен
              совпадать.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/" className="action inline-block">
                Создать новую комнату
              </Link>
              <Link
                href={phonePath(code)}
                className="action is-ink inline-block"
              >
                Я ведущий: ввести код
              </Link>
            </div>
          </div>
        )}
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
  // Картиночные задания (ребус, фрагмент…) остаются и при ответе — целиком,
  // с подписью автора.
  const hasPicture = Boolean(current?.picture && current?.image_url);
  const hasMedia =
    Boolean(current) &&
    current?.kind !== "text" &&
    (current?.kind !== "image" || game.phase !== "reveal" || hasPicture);
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
            {hasMedia && hasPicture && current ? (
              <PictureTask
                key={current.id}
                cell={current}
                revealed={game.phase === "reveal"}
              />
            ) : hasMedia ? (
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
  code,
  origin,
  ownsRoom,
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
  code: string;
  origin: string;
  ownsRoom: boolean;
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
  // Общий экран видят все: эталон только пока держат «Показать ответ».
  // На вскрытии ответ и так на экране.
  const answer =
    sheet?.expected && game.phase !== "reveal" ? sheet.expected : null;
  return (
    <aside className={`drawer ${open ? "is-open" : ""}`}>
      <button type="button" className="drawer-tab" onClick={onToggle}>
        <span>Ведущему</span>
        <span>{open ? "скрыть" : "открыть"}</span>
      </button>
      <div className="grid gap-3 px-4 pb-4">
        <HostToggles
          voiceOn={voiceOn}
          hostStartsMedia={hostStartsMedia}
          hostMode={hostMode}
          onVoice={onVoice}
          onHostStarts={onHostStarts}
        />
        {answer ? (
          <HoldToReveal key={game.current_question_id} answer={answer} />
        ) : null}
        <PendingAnswers sheet={sheet} />
        <HostMoves
          game={game}
          sheet={sheet}
          pending={pending}
          finalPicks={finalPicks}
          onOpenBuzz={onOpenBuzz}
          onPass={onPass}
          onContinue={onContinue}
          onJudge={onJudge}
          onFinalPick={onFinalPick}
          onFinalize={onFinalize}
        />
        {ownsRoom && hostMode === "human" ? (
          <div>
            <HostPhonePair
              key="off"
              code={code}
              origin={origin}
              connected={false}
              compact
            />
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

async function callHost(
  code: string,
  action: string,
  extra?: Record<string, unknown>,
) {
  const hostSecret = readHostSecret(code);
  return callHostAction(
    code,
    action,
    hostSecret ? { hostSecret } : null,
    extra,
  );
}
