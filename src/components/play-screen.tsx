"use client";

import { useState, type FormEvent } from "react";
import { Board, ScoreStrip } from "@/components/game/board";
import { secondsLeft, useMatch, useNow } from "@/components/game/use-match";
import { Panel, Shell } from "@/components/shell";
import { normalizeRoomCode } from "@/lib/rooms/codes";
import { messageFor } from "@/lib/rooms/messages";
import {
  clearPlayer,
  savePlayer,
  useStoredPlayer,
  type StoredPlayer,
} from "@/lib/rooms/storage";
import {
  getBrowserSupabase,
  isSupabaseConfigured,
} from "@/lib/supabase/browser";
import type { JoinRoomResult, PlayerRole } from "@/lib/supabase/types";

export function PlayScreen({ code }: { code: string }) {
  const normalized = normalizeRoomCode(code);
  const storedPlayer = useStoredPlayer(normalized);
  const [memorySession, setMemorySession] = useState<StoredPlayer | null>(null);
  const session = memorySession ?? storedPlayer;
  const [nickname, setNickname] = useState("");
  const [role, setRole] = useState<PlayerRole>("player");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const match = useMatch(code);
  const now = useNow();

  if (!normalized) {
    return (
      <Shell width="max-w-md">
        <Panel>
          <p>Код комнаты — четыре латинские буквы.</p>
        </Panel>
      </Shell>
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <Shell width="max-w-md">
        <Panel>
          <p>Комната не настроена: на сервере нет ключей Supabase.</p>
        </Panel>
      </Shell>
    );
  }

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!normalized) return;
    setPending(true);
    setError(null);
    try {
      const supabase = getBrowserSupabase();
      const { data, error: rpcError } = await supabase.rpc("join_room", {
        p_code: normalized,
        p_nickname: nickname,
        p_role: role,
      });
      if (rpcError || !data) {
        setError(messageFor("network"));
        return;
      }
      const result = data as JoinRoomResult;
      if (!result.ok) {
        setError(messageFor(result.error));
        return;
      }
      const nextSession: StoredPlayer = {
        playerId: result.player_id,
        token: result.player_token,
        nickname: result.nickname,
        role: result.role,
      };
      savePlayer(normalized, nextSession);
      setMemorySession(nextSession);
    } catch {
      setError(messageFor("network"));
    } finally {
      setPending(false);
    }
  }

  async function leave() {
    if (!session || !normalized) return;
    setPending(true);
    try {
      const supabase = getBrowserSupabase();
      await supabase.rpc("leave_room", {
        p_code: normalized,
        p_player_token: session.token,
      });
    } catch {
      // Локальную сессию закрываем в любом случае.
    } finally {
      clearPlayer(normalized);
      setMemorySession(null);
      setPending(false);
    }
  }

  return (
    <Shell width="max-w-xl">
      <p className="text-sm text-muted">Комната</p>
      <h1 className="mt-1 font-mono text-4xl tracking-[0.28em] text-gold">
        {normalized}
      </h1>
      {match.status === "ready" ? (
        <div className="mt-4">
          <ScoreStrip players={match.players} />
        </div>
      ) : null}
      {error ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {session ? (
        <div className="mt-4 grid gap-4">
          <p className="text-lg">
            {session.role === "spectator" ? "Вы зритель" : "Вы в игре"},{" "}
            <span className="font-semibold">{session.nickname}</span>
          </p>
          {match.status === "ready" ? (
            <PlayTurn
              code={normalized}
              session={session}
              match={match}
              now={now}
              pending={pending}
              setPending={setPending}
              setError={setError}
            />
          ) : (
            <p className="text-muted">Подключаемся к партии…</p>
          )}
          <button
            type="button"
            onClick={() => void leave()}
            disabled={pending}
            className="text-left text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Покинуть комнату
          </button>
        </div>
      ) : (
        <Panel className="mt-6">
          <form onSubmit={(event) => void join(event)}>
            <label htmlFor="nickname" className="text-sm text-muted">
              Как вас представить
            </label>
            <input
              id="nickname"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={24}
              required
              autoComplete="nickname"
              placeholder="Анна"
              className="mt-2 w-full rounded-2xl border border-line bg-navy px-4 py-3 text-lg outline-none focus:border-gold"
            />
            <fieldset className="mt-4">
              <legend className="text-sm text-muted">Роль</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <RoleChoice
                  checked={role === "player"}
                  label="Игрок"
                  onSelect={() => setRole("player")}
                />
                <RoleChoice
                  checked={role === "spectator"}
                  label="Зритель"
                  onSelect={() => setRole("spectator")}
                />
              </div>
            </fieldset>
            <button
              type="submit"
              disabled={pending}
              className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-gold font-semibold text-navy disabled:opacity-60"
            >
              {pending ? "Входим…" : "Войти в комнату"}
            </button>
          </form>
        </Panel>
      )}
    </Shell>
  );
}

function PlayTurn({
  code,
  session,
  match,
  now,
  pending,
  setPending,
  setError,
}: {
  code: string;
  session: StoredPlayer;
  match: Extract<ReturnType<typeof useMatch>, { status: "ready" }>;
  now: number;
  pending: boolean;
  setPending: (value: boolean) => void;
  setError: (value: string | null) => void;
}) {
  const { game, players, board } = match;
  const [text, setText] = useState("");
  const [wager, setWager] = useState("");
  const me = players.find((player) => player.id === session.playerId);
  const chooser = players.find(
    (player) => player.id === game.chooser_player_id,
  );
  const current = board.find((cell) => cell.id === game.current_question_id);
  const left = secondsLeft(game.deadline, now);
  const iChoose =
    session.role === "player" && game.chooser_player_id === session.playerId;
  const iAnswer =
    session.role === "player" &&
    ((game.phase === "answering" &&
      (current?.special === "cat"
        ? current.assigned_player_id === session.playerId
        : game.buzz_winner_player_id === session.playerId)) ||
      (game.phase === "final_answer" && (me?.score ?? 0) > 0));

  async function rpc(name: string, args: Record<string, unknown>) {
    setPending(true);
    setError(null);
    try {
      const supabase = getBrowserSupabase();
      const { data, error } = await supabase.rpc(name, args);
      if (error || !data) {
        setError(messageFor("network"));
        return;
      }
      const result = data as { ok?: boolean; error?: string };
      if (result.ok === false) setError(messageFor(result.error));
    } catch {
      setError(messageFor("network"));
    } finally {
      setPending(false);
    }
  }

  async function sendAnswer(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/play/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, token: session.token, text }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        judging?: boolean;
      };
      if (result.ok === false) setError(messageFor(result.error));
      else setText("");
    } catch {
      setError(messageFor("network"));
    } finally {
      setPending(false);
    }
  }

  if (game.phase === "lobby") {
    return (
      <p className="text-muted">
        Ведущий ещё не начал партию. Очки появятся на поле.
      </p>
    );
  }

  if (game.phase === "finished") {
    const table = players
      .filter((player) => player.role === "player")
      .slice()
      .sort((leftPlayer, rightPlayer) => rightPlayer.score - leftPlayer.score);
    return (
      <Panel>
        <h2 className="text-2xl font-semibold">Итог</h2>
        <ol className="mt-3 grid gap-2">
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
      </Panel>
    );
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">
        {game.round === 1 ? "Раунд 1" : game.round === 2 ? "Раунд 2" : "Финал"}
        {chooser && game.phase === "board"
          ? ` · выбирает ${chooser.nickname}`
          : ""}
        {left !== null ? ` · ${left} с` : ""}
      </p>

      {game.phase === "board" ? (
        <Board
          cells={board}
          round={game.round}
          canPick={iChoose && !pending}
          onPick={(cell) =>
            void rpc("pick_cell", {
              p_code: code,
              p_player_token: session.token,
              p_question_id: cell.id,
            })
          }
        />
      ) : null}

      {game.phase === "cat_pick" && iChoose ? (
        <Panel>
          <h2 className="text-xl font-semibold">Кот в мешке</h2>
          <p className="mt-2 text-sm text-muted">
            Отдайте вопрос другому игроку. Самим себе нельзя.
          </p>
          <div className="mt-3 grid gap-2">
            {players
              .filter(
                (player) =>
                  player.role === "player" && player.id !== session.playerId,
              )
              .map((player) => (
                <button
                  key={player.id}
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    void rpc("assign_cat", {
                      p_code: code,
                      p_player_token: session.token,
                      p_target_id: player.id,
                    })
                  }
                  className="h-12 rounded-2xl border border-line text-left px-4"
                >
                  {player.nickname}
                </button>
              ))}
          </div>
        </Panel>
      ) : null}

      {game.phase === "cat_pick" && !iChoose ? (
        <Panel>
          <p>
            Кот в мешке. {chooser?.nickname ?? "Игрок"} выбирает, кому отдать
            вопрос.
          </p>
        </Panel>
      ) : null}

      {current?.prompt &&
      game.phase !== "board" &&
      game.phase !== "cat_pick" ? (
        <Panel>
          <p className="text-sm text-gold">
            {current.category}
            {current.special === "cat" ? " · кот в мешке" : ""}
          </p>
          <h2 className="prompt mt-2 text-2xl leading-snug sm:text-3xl">{current.prompt}</h2>
          {current.kind === "image" && current.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.image_url} alt="" className="mt-4 max-h-64 w-full object-contain" />
          ) : null}
          {current.kind === "video" || current.kind === "music" ? (
            <p className="mt-3 text-sm text-muted">Смотрите и слушайте экран ведущего.</p>
          ) : null}
        </Panel>
      ) : null}

      {game.phase === "buzzing" && session.role === "player" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            void rpc("buzz", { p_code: code, p_player_token: session.token })
          }
          className="flex min-h-40 items-center justify-center rounded-[2rem] bg-gold text-4xl font-black text-navy disabled:opacity-60"
        >
          Ответить
        </button>
      ) : null}

      {iAnswer ? (
        <Panel>
          <form onSubmit={(event) => void sendAnswer(event)}>
            <label htmlFor="answer" className="text-sm text-muted">
              Ваш ответ
            </label>
            <input
              id="answer"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={300}
              required
              className="mt-2 w-full rounded-2xl border border-line bg-navy px-4 py-3 text-lg outline-none focus:border-gold"
            />
            <button
              type="submit"
              disabled={pending}
              className="mt-3 h-12 w-full rounded-full bg-gold font-semibold text-navy disabled:opacity-60"
            >
              Отправить
            </button>
          </form>
        </Panel>
      ) : null}

      {game.phase === "judging" ? (
        <p className="text-muted">Ведущий проверяет ответ.</p>
      ) : null}

      {game.phase === "reveal" ? (
        <Panel>
          <p className="text-sm text-muted">Правильный ответ</p>
          <h2 className="mt-2 text-3xl font-semibold">
            {game.revealed_answer}
          </h2>
        </Panel>
      ) : null}

      {game.phase === "wager" &&
      session.role === "player" &&
      (me?.score ?? 0) > 0 ? (
        <Panel>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void rpc("place_wager", {
                p_code: code,
                p_player_token: session.token,
                p_wager: Number(wager),
              });
            }}
          >
            <h2 className="text-xl font-semibold">Тайная ставка</h2>
            <p className="mt-2 text-sm text-muted">
              От 0 до {me?.score}. Другие её не видят.
            </p>
            <input
              inputMode="numeric"
              value={wager}
              onChange={(event) =>
                setWager(event.target.value.replace(/[^\d]/g, ""))
              }
              required
              className="mt-3 w-full rounded-2xl border border-line bg-navy px-4 py-3 text-lg outline-none focus:border-gold"
            />
            <button
              type="submit"
              disabled={pending}
              className="mt-3 h-12 w-full rounded-full bg-gold font-semibold text-navy"
            >
              Поставить
            </button>
          </form>
        </Panel>
      ) : null}

      {game.phase === "wager" &&
      (me?.score ?? 0) <= 0 &&
      session.role === "player" ? (
        <p className="text-muted">
          В финал выходят только игроки с положительным счётом.
        </p>
      ) : null}
    </div>
  );
}

function RoleChoice({
  checked,
  label,
  onSelect,
}: {
  checked: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <label
      className={`flex h-12 cursor-pointer items-center justify-center rounded-2xl border ${checked ? "border-gold bg-navy" : "border-line"}`}
    >
      <input
        type="radio"
        name="role"
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      {label}
    </label>
  );
}
