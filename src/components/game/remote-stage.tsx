"use client";

import { useEffect, useRef } from "react";
import type { BoardCell } from "@/components/game/board";
import { MediaPlayer } from "@/components/game/media-player";
import { PictureTask } from "@/components/game/picture-task";
import { serverOffset } from "@/components/game/server-clock";
import {
  armSpeechUnlock,
  speakRussian,
  stopSpeech,
} from "@/components/game/speech";
import type { MatchState } from "@/components/game/use-match";
import { displayPrompt } from "@/lib/game/prompt";
import { hasEffect, scrambleWords } from "@/lib/game/surprises";
import { scoreboardPlayers } from "@/lib/game/scoreboard";
import type { PlayerRow } from "@/lib/supabase/types";

type ReadyMatch = Extract<MatchState, { status: "ready" }>;

/** Голос по умолчанию — как на общем экране (бот читает вслух). */
export function roomVoiceDefault(match: ReadyMatch): boolean {
  return match.room.host_voice ?? match.room.host_mode === "bot";
}

/**
 * Телефон игрока «не у экрана»: то же, что показывает общий экран, — счёт,
 * итоги раунда, «кот в мешке», лист вопроса с картинкой, видео или треком
 * (со старта общего экрана) и финал. Правильный ответ приходит в
 * question_board только после вскрытия, поэтому здесь его не бывает раньше.
 */
export function RemoteStage({
  code,
  playerToken,
  match,
  voice,
}: {
  code: string;
  playerToken: string;
  match: ReadyMatch;
  voice: boolean;
}) {
  const { game, players, board, room } = match;
  const current = board.find((cell) => cell.id === game.current_question_id);
  const chooser = players.find(
    (player) => player.id === game.chooser_player_id,
  );

  // Часы сервера нужны медиа и картинкам — меряем сразу.
  useEffect(() => {
    void serverOffset();
    armSpeechUnlock();
    return () => stopSpeech();
  }, []);

  // Картинку грузим, как только клетку выбрали (ещё во время «кота»).
  const pictureUrl = current?.image_url ?? null;
  useEffect(() => {
    if (!pictureUrl) return;
    const preload = new Image();
    preload.decoding = "async";
    preload.src = pictureUrl;
  }, [pictureUrl]);

  // Голос: тот же закэшированный текст вопроса, что читает общий экран.
  const spoken = useRef<string | null>(null);
  const prompt = displayPrompt(current?.prompt);
  const questionId = game.current_question_id;
  useEffect(() => {
    if (game.phase !== "question") {
      stopSpeech();
      return;
    }
    if (!voice || !prompt || !questionId) return;
    if (spoken.current === questionId) return;
    spoken.current = questionId;
    speakRussian(prompt, undefined, { code, playerToken });
  }, [game.phase, questionId, prompt, voice, code, playerToken]);
  useEffect(() => {
    if (!voice) stopSpeech();
  }, [voice]);

  const roundCells = board.filter((cell) => cell.round === game.round);
  const freshRound =
    game.phase === "board" &&
    game.round > 1 &&
    roundCells.length > 0 &&
    roundCells.every((cell) => cell.status === "hidden");
  const showSheet =
    Boolean(current?.prompt) &&
    !["board", "cat_pick", "finished", "lobby"].includes(game.phase);
  const assigned =
    current?.special === "cat"
      ? players.find((player) => player.id === current.assigned_player_id)
      : undefined;
  const autoplay = !(room.host_mode === "human" && room.host_starts_media);
  // «Перемешка»: на телефонах слова вопроса вразнобой (экран — как есть).
  const scrambled = hasEffect(match.effects, "scramble", null, questionId);

  return (
    <section className="remote-stage" data-remote-phase={game.phase}>
      <RemoteScores players={players} activeId={game.chooser_player_id} />

      {freshRound ? (
        <RoundResults
          title={`Итоги ${game.round - 1}-го раунда`}
          players={players}
        />
      ) : null}

      {game.phase === "cat_pick" ? (
        <div className="remote-cat" role="status">
          <p className="tape tape-red poster">
            Кот в мешке
            {current ? ` · ${current.category} · ${current.value}` : ""}
          </p>
          <p className="mt-2">
            {chooser?.nickname ?? "Игрок"} выбирает, кому отдать вопрос.
          </p>
        </div>
      ) : null}

      {game.phase === "wager" ? (
        <div className="remote-final">
          <RoundResults title="Перед финалом" players={players} />
          <p className="tape tape-red poster mt-3">Финал</p>
          {current?.category ? (
            <p className="remote-q mt-2">Тема: {current.category}</p>
          ) : null}
          <p className="mt-1 text-sm">
            Тайные ставки: от 0 до своего счёта. Играют только игроки с
            положительным счётом.
          </p>
        </div>
      ) : null}

      {showSheet && current ? (
        <article className="remote-sheet" data-kind={current.kind}>
          <p className="tape tape-red poster">
            {current.category} · {current.value || "финал"}
            {current.special === "cat" ? " · кот в мешке" : ""}
          </p>
          {assigned ? (
            <p className="remote-cat-note hand">Отвечает {assigned.nickname}</p>
          ) : null}
          <h2
            className="remote-q"
            data-scrambled={scrambled ? "yes" : undefined}
          >
            {scrambled && prompt && questionId
              ? scrambleWords(prompt, questionId)
              : prompt}
          </h2>
          <RemoteMedia cell={current} phase={game.phase} autoplay={autoplay} />
        </article>
      ) : null}
    </section>
  );
}

function RemoteMedia({
  cell,
  phase,
  autoplay,
}: {
  cell: BoardCell;
  phase: string;
  autoplay: boolean;
}) {
  const revealed = phase === "reveal";
  const hasPicture = Boolean(cell.picture && cell.image_url);
  if (hasPicture) {
    return <PictureTask key={cell.id} cell={cell} revealed={revealed} />;
  }
  if (cell.kind === "image") {
    if (!cell.image_url || revealed) return null;
    return (
      <div className="polaroid remote-image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cell.image_url} alt="" />
      </div>
    );
  }
  if (cell.kind !== "video" && cell.kind !== "music") return null;
  const startedAt = cell.media_started_at ?? null;
  if (!startedAt) {
    // Общий экран ещё не включил ролик: ждём его, сами не стартуем.
    return (
      <div className="media-block">
        <div className="media-frame is-audio" data-remote-wait="1">
          <div className="media-audio">
            <span className="media-disc" aria-hidden="true" />
            <p className="media-audio-label hand">
              {autoplay ? "Сейчас начнётся…" : "Ждём, когда ведущий включит"}
            </p>
            <p className="media-audio-note poster">
              {cell.kind === "music" ? "музыкальный вопрос" : "видеовопрос"}
            </p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <MediaPlayer
      key={`${cell.id}:${startedAt}`}
      cell={cell}
      autoplay
      syncFrom={startedAt}
      revealed={revealed}
    />
  );
}

function RemoteScores({
  players,
  activeId,
}: {
  players: PlayerRow[];
  activeId: string | null;
}) {
  const table = scoreboardPlayers(players);
  if (!table.length) return null;
  return (
    <ul className="remote-scores" aria-label="Счёт">
      {table.map((player) => (
        <li
          key={player.id}
          className={player.id === activeId ? "is-active" : undefined}
        >
          <span className="hand">{player.nickname}</span>
          <span className={`poster ${player.score < 0 ? "text-danger" : ""}`}>
            {player.score}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RoundResults({
  title,
  players,
}: {
  title: string;
  players: PlayerRow[];
}) {
  const table = scoreboardPlayers(players)
    .slice()
    .sort((left, right) => right.score - left.score);
  return (
    <div className="remote-results" role="status">
      <p className="hand text-2xl">{title}</p>
      <ol className="mt-1 grid gap-1">
        {table.map((player, index) => (
          <li key={player.id} className="flex justify-between">
            <span>
              {index + 1}. {player.nickname}
            </span>
            <span className={player.score < 0 ? "text-danger" : "text-gold"}>
              {player.score}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
