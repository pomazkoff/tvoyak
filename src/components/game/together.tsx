"use client";

import { vkGoal } from "@/lib/analytics/vk-pixel";
import { scoreboardPlayers } from "@/lib/game/scoreboard";
import {
  hitNote,
  liveMultiplierLabel,
  missNote,
  recordLine,
} from "@/lib/game/together";
import { messageFor } from "@/lib/rooms/messages";
import { savePlayer, useStoredPlayer } from "@/lib/rooms/storage";
import { requestMatchReload } from "@/components/game/use-match";
import { SeasonalLine } from "@/components/seasonal/seasonal-line";
import { Panel } from "@/components/shell";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { JoinRoomResult, PlayerRow, RoomRow } from "@/lib/supabase/types";
import { useState, type FormEvent } from "react";

export function TeamPlaque({
  room,
  players,
  activeId,
}: {
  room: RoomRow;
  players: PlayerRow[];
  activeId?: string | null;
}) {
  const seated = scoreboardPlayers(players);
  const score = room.team_score ?? 0;
  return (
    <div className="team-plaque" data-together="score">
      <div>
        <p className="hand team-kicker">вместе</p>
        <p className="poster team-score-num" aria-label={`Общий счёт ${score}`}>
          {score}
        </p>
        <p className="hand team-streak">
          {room.status === "finished"
            ? (room.team_best_streak ?? 0) > 0
              ? `Лучшая серия ${room.team_best_streak}`
              : "Серия не собралась"
            : liveMultiplierLabel(room.team_streak ?? 0)}
        </p>
      </div>
      <ul className="together-names">
        {seated.map((player) => (
          <li
            key={player.id}
            className={`tape hand${player.id === activeId ? " is-on" : ""}`}
          >
            {player.nickname}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TogetherFinale({
  room,
  players,
  compact = false,
}: {
  room: RoomRow;
  players: PlayerRow[];
  compact?: boolean;
}) {
  const seated = scoreboardPlayers(players);
  const score = room.team_score ?? 0;
  const correct = room.team_correct ?? 0;
  const played = room.team_played ?? 0;
  const best = room.team_best_streak ?? 0;
  return (
    <Panel>
      <p className="hand text-2xl text-pen">вместе</p>
      <h2
        className={
          compact
            ? "mt-1 text-3xl font-semibold"
            : "mt-1 text-4xl font-semibold"
        }
      >
        Общий счёт
      </h2>
      <p className="poster team-finale-score" data-together="finale">
        {score}
      </p>
      <SeasonalLine className="seasonal-finale">С Новым годом!</SeasonalLine>
      <p className="mt-3 text-lg">
        Угадано {correct} из {played}
      </p>
      <p>{best > 0 ? `Лучшая серия: ${best}` : "Серия так и не собралась."}</p>
      <p className="mt-2">{recordLine(score, room.team_record ?? null)}</p>
      {seated.length > 0 ? (
        <>
          <h3 className="hand mt-4 text-2xl">Кто принёс</h3>
          <ul className="mt-2 grid gap-2">
            {seated.map((player) => (
              <li
                key={player.id}
                className="flex items-center justify-between border border-line bg-white px-4 py-3"
              >
                <span>{player.nickname}</span>
                <span className="font-mono text-xl text-gold">
                  {player.score}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Panel>
  );
}

export function TogetherAnswer({
  code,
  token,
}: {
  code: string;
  token: string;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const answer = text.trim();
    if (!answer || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/play/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, token, text: answer }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        correct?: boolean;
        waiting?: boolean;
        points?: number;
        multiplier?: number;
      };
      if (result.ok === false) {
        setNote(null);
        setError(messageFor(result.error));
        return;
      }
      setText("");
      if (result.correct) {
        setNote(hitNote(result.points ?? 0, result.multiplier ?? 1));
      } else if (result.waiting) {
        setNote(missNote());
      } else {
        setNote("Мимо. Ответ сейчас покажут.");
      }
    } catch {
      setError(messageFor("network"));
    } finally {
      setPending(false);
      requestMatchReload();
    }
  }

  return (
    <form className="together-answer" onSubmit={(event) => void submit(event)}>
      <label htmlFor="together-answer" className="text-sm text-muted">
        Ответ команды
      </label>
      <input
        id="together-answer"
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={300}
        required
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="send"
        placeholder="Пишите, кто знает"
        className="field mt-2"
      />
      {note ? (
        <p className="mt-2" role="status">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="action mt-3 w-full">
        {pending ? "Проверяем…" : "Это наш ответ"}
      </button>
    </form>
  );
}

/** Сесть игроком на том же экране, где комната создана. Для соло этого хватает. */
export function TogetherSeat({ code }: { code: string }) {
  const stored = useStoredPlayer(code);
  const [nickname, setNickname] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = nickname.trim();
    if (!name || pending) return;
    setPending(true);
    setError(null);
    try {
      const { data, error: rpcError } = await getBrowserSupabase().rpc(
        "join_room",
        { p_code: code, p_nickname: name, p_role: "player" },
      );
      if (rpcError || !data) {
        setError(messageFor("network"));
        return;
      }
      const result = data as JoinRoomResult;
      if (!result.ok) {
        setError(messageFor(result.error));
        return;
      }
      vkGoal("player_joined");
      savePlayer(code, {
        playerId: result.player_id,
        token: result.player_token,
        nickname: result.nickname,
        role: result.role,
      });
      requestMatchReload();
    } catch {
      setError(messageFor("network"));
    } finally {
      setPending(false);
    }
  }

  if (stored?.role === "player") {
    return (
      <p className="mt-4 text-lg" data-together="seated">
        Ты за этим экраном: <b>{stored.nickname}</b>. Отвечать можно прямо тут.
      </p>
    );
  }

  return (
    <form className="mt-4 grid gap-2" onSubmit={(event) => void join(event)}>
      <label htmlFor="together-nick" className="hand text-2xl">
        Играю с этого экрана
      </label>
      <input
        id="together-nick"
        value={nickname}
        onChange={(event) => setNickname(event.target.value)}
        maxLength={24}
        required
        autoComplete="nickname"
        placeholder="Как тебя звать"
        className="field"
      />
      {error ? (
        <p className="text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="action">
        {pending ? "Садимся…" : "Сесть и отвечать здесь"}
      </button>
    </form>
  );
}
