"use client";

import { useState, type FormEvent } from "react";
import { Board } from "@/components/game/board";
import {
  requestMatchReload,
  secondsLeft,
  useMatch,
  useNow,
} from "@/components/game/use-match";
import { Logo } from "@/components/marks";
import { Panel, Shell } from "@/components/shell";
import { scoreboardPlayers } from "@/lib/game/scoreboard";
import { normalizeRoomCode } from "@/lib/rooms/codes";
import { lateAnswerMessage, messageFor } from "@/lib/rooms/messages";
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
  const [bye, setBye] = useState(false);
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

  if (session && match.status === "ready" && match.game.phase !== "lobby") {
    const meScore =
      match.players.find((player) => player.id === session.playerId)?.score ??
      0;
    return (
      <div className="phone">
        <header className="phone-bar">
          <Logo compact />
          <p className="hand phone-who">
            {session.nickname} · {meScore}
          </p>
          <p className="mono text-xs">{normalized}</p>
          {bye ? (
            <button
              type="button"
              className="action h-11 px-3"
              onClick={() => void leave()}
            >
              выйти
            </button>
          ) : (
            <button
              type="button"
              className="h-11 w-11 border border-ink text-sm"
              onClick={() => setBye(true)}
              aria-label="Выйти"
            >
              ×
            </button>
          )}
        </header>
        <div className="phone-body">
          {error ? (
            <p className="px-3 text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <PlayTurn
            code={normalized}
            session={session}
            match={match}
            now={now}
            pending={pending}
            setPending={setPending}
            setError={setError}
          />
        </div>
      </div>
    );
  }

  return (
    <Shell width="max-w-xl">
      {error ? (
        <p className="text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {session ? (
        <div className="grid gap-4">
          <p className="hand text-4xl">
            {session.role === "spectator" ? "Вы зритель" : "Вы в игре"},{" "}
            {session.nickname}
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
              className="field mt-2"
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
  const [late, setLate] = useState<{
    questionId: string;
    value: number;
  } | null>(null);
  // Принятая ставка и ответ финала: форма прячется, телефон пишет «принято».
  const [accepted, setAccepted] = useState<{
    questionId: string;
    wager?: number;
    answer?: string;
  } | null>(null);
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

  async function rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      const supabase = getBrowserSupabase();
      let { data, error } = await supabase.rpc(name, args);
      // Ход мог упереться в просроченный срок: сдвигаем серверные часы и
      // пробуем ещё раз — один раз.
      if (
        !error &&
        (data as { error?: string } | null)?.error === "bad_phase"
      ) {
        await supabase.rpc("advance_clock", { p_code: code });
        ({ data, error } = await supabase.rpc(name, args));
      }
      if (error || !data) {
        setError(messageFor("network"));
        return false;
      }
      const result = data as { ok?: boolean; error?: string; won?: boolean };
      if (result.ok !== true) setError(messageFor(result.error));
      else if (name === "buzz" && result.won === false)
        setError(messageFor("lost_race"));
      return result.ok === true;
    } catch {
      setError(messageFor("network"));
      return false;
    } finally {
      setPending(false);
      requestMatchReload();
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
        delta?: number;
      };
      if (result.ok === false) {
        if (
          (result.error === "answer_late" || result.error === "too_late") &&
          game.current_question_id
        ) {
          setLate({
            questionId: game.current_question_id,
            value: Math.abs(result.delta ?? current?.value ?? 0),
          });
          setError(messageFor("answer_late"));
        } else {
          setError(messageFor(result.error));
        }
      } else {
        if (game.phase === "final_answer" && game.current_question_id) {
          const questionId = game.current_question_id;
          const answer = text.trim();
          setAccepted((prev) => ({
            ...(prev?.questionId === questionId ? prev : {}),
            questionId,
            answer,
          }));
        }
        setText("");
      }
    } catch {
      setError(messageFor("network"));
    } finally {
      setPending(false);
      requestMatchReload();
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
    const table = scoreboardPlayers(players)
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

  const mine = game.phase === "answering" && iAnswer;
  // Срок ответа истёк у этого телефона: прячем поле и пишем штраф. Сервер
  // тем временем применит −цену (advance_clock из useMatch).
  if (
    mine &&
    left === 0 &&
    game.current_question_id &&
    late?.questionId !== game.current_question_id
  ) {
    setLate({
      questionId: game.current_question_id,
      value: current?.value ?? 0,
    });
  }
  const timedOut =
    late !== null && late.questionId === game.current_question_id;
  const acceptedHere =
    accepted !== null && accepted.questionId === game.current_question_id
      ? accepted
      : null;
  const finalSent = game.round === 3 && acceptedHere?.answer !== undefined;
  const otherName =
    game.phase === "answering" && !iAnswer
      ? players.find((player) =>
          current?.special === "cat"
            ? player.id === current.assigned_player_id
            : player.id === game.buzz_winner_player_id,
        )?.nickname
      : null;
  const waiting =
    game.phase === "question" ||
    (game.phase === "buzzing" && session.role !== "player");
  const alreadyBuzzed = match.buzzes.some(
    (buzz) =>
      buzz.question_id === game.current_question_id &&
      buzz.player_id === session.playerId,
  );

  return (
    <div
      className={`flex h-full min-h-0 flex-col px-3 ${mine ? "is-mine bg-[#d7261e] text-[#f7f6f2]" : ""} ${waiting ? "is-wait" : ""}`}
    >
      <div className="flex items-baseline justify-between">
        <p className="poster text-[40px]">
          {current?.category ?? (game.round === 3 ? "Финал" : "")}
        </p>
        {left !== null && game.phase !== "reveal" ? (
          <p
            className={`poster phone-clock ${left <= 5 ? "is-hot" : ""}`}
            aria-label={`Осталось ${left} с`}
          >
            {left}
          </p>
        ) : null}
      </div>
      {current?.prompt && game.phase !== "board" ? (
        <p className={`phone-q mt-1 ${otherName ? "struck" : ""}`}>
          {current.prompt}
        </p>
      ) : null}
      {otherName ? <p className="name-sticker hand">{otherName}</p> : null}
      {timedOut && game.phase !== "reveal" ? (
        <p className="time-up hand phone-time-up" role="status">
          {lateAnswerMessage(late?.value ?? 0)}
        </p>
      ) : null}
      {chooser && game.phase === "board" ? (
        <p className="pick-prompt hand">
          {iChoose ? "Ваш ход — выберите цену" : `Выбирает ${chooser.nickname}`}
        </p>
      ) : null}

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
          onRefuse={() =>
            setError(
              chooser
                ? `Выбирает ${chooser.nickname}.`
                : messageFor("not_chooser"),
            )
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

      {current &&
      (current.kind === "video" || current.kind === "music") &&
      game.phase !== "board" ? (
        <p className="mt-2 text-[17px]">Смотрите экран ведущего.</p>
      ) : null}
      {current?.kind === "image" &&
      current.image_url &&
      game.phase !== "board" ? (
        <div className="polaroid mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.image_url}
            alt=""
            className="max-h-40 w-full object-contain"
          />
        </div>
      ) : null}

      {game.phase === "buzzing" && session.role === "player" ? (
        <button
          type="button"
          disabled={pending || alreadyBuzzed}
          onClick={() => {
            navigator.vibrate?.(30);
            void rpc("buzz", { p_code: code, p_player_token: session.token });
          }}
          className={`buzz ${alreadyBuzzed ? "is-done" : ""}`}
        >
          {alreadyBuzzed ? "Вы уже нажимали" : "Ответить"}
        </button>
      ) : null}

      {iAnswer &&
      !(timedOut && game.phase === "answering") &&
      !(game.phase === "final_answer" && finalSent) ? (
        <Panel className="answer-panel">
          <form onSubmit={(event) => void sendAnswer(event)}>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="answer" className="text-sm text-muted">
                Ваш ответ
              </label>
              {left !== null && game.phase === "answering" ? (
                <span
                  className={`poster answer-clock ${left <= 5 ? "is-hot" : ""}`}
                >
                  {left} с
                </span>
              ) : null}
            </div>
            <input
              id="answer"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={300}
              required
              autoComplete="off"
              autoFocus
              placeholder="Напишите ответ"
              className="field mt-2"
            />
            <button
              type="submit"
              disabled={pending}
              className="action mt-3 w-full"
            >
              Отправить
            </button>
          </form>
        </Panel>
      ) : null}

      {game.round === 3 &&
      acceptedHere &&
      ["wager", "final_answer", "judging"].includes(game.phase) ? (
        <div role="status">
          <Panel className="accepted-panel">
            <p className="hand text-3xl">Принято ✓</p>
            {acceptedHere.wager !== undefined ? (
              <p className="mt-2">Ваша ставка: {acceptedHere.wager}</p>
            ) : null}
            {acceptedHere.answer !== undefined ? (
              <p className="mt-1">Ваш ответ: «{acceptedHere.answer || "—"}»</p>
            ) : null}
            <p className="mt-2 text-sm text-muted">
              {game.phase === "judging"
                ? "Проверяем ответы."
                : "Ждём остальных игроков."}
            </p>
          </Panel>
        </div>
      ) : null}

      {game.phase === "judging" ? (
        <p className="text-muted">
          {game.round === 3
            ? "Ведущий проверяет ответы."
            : "Ведущий проверяет ответ."}
        </p>
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
      (me?.score ?? 0) > 0 &&
      acceptedHere?.wager === undefined ? (
        <Panel>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const questionId = game.current_question_id;
              const value = Number(wager);
              void rpc("place_wager", {
                p_code: code,
                p_player_token: session.token,
                p_wager: value,
              }).then((ok) => {
                if (ok && questionId) setAccepted({ questionId, wager: value });
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
              placeholder={`0–${me?.score ?? 0}`}
              aria-label="Ставка"
              className="field mt-3"
            />
            <button
              type="submit"
              disabled={pending}
              className="action mt-3 w-full"
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
