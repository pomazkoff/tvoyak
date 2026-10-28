"use client";

import { useState, type FormEvent } from "react";
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
import type {
  BuzzResult,
  JoinRoomResult,
  PlayerRole,
} from "@/lib/supabase/types";

type BuzzView = {
  tone: "ok" | "muted" | "danger";
  text: string;
  time?: string;
};

export function PlayScreen({ code }: { code: string }) {
  const normalized = normalizeRoomCode(code);
  const storedPlayer = useStoredPlayer(normalized);
  const [memorySession, setMemorySession] = useState<StoredPlayer | null>(null);
  const session = memorySession ?? storedPlayer;
  const [nickname, setNickname] = useState("");
  const [role, setRole] = useState<PlayerRole>("player");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buzz, setBuzz] = useState<BuzzView | null>(null);

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
      setBuzz(null);
    } catch {
      setError(messageFor("network"));
    } finally {
      setPending(false);
    }
  }

  async function pressBuzz() {
    if (!session || !normalized) return;
    setPending(true);
    setBuzz(null);
    try {
      const supabase = getBrowserSupabase();
      const { data, error: rpcError } = await supabase.rpc("buzz", {
        p_code: normalized,
        p_player_token: session.token,
      });
      if (rpcError || !data) {
        setBuzz({ tone: "danger", text: messageFor("network") });
        return;
      }
      const result = data as BuzzResult;
      const time = result.server_time
        ? formatServerTime(result.server_time)
        : undefined;
      if (!result.ok) {
        if (result.error === "player_not_found") {
          clearPlayer(normalized);
          setMemorySession(null);
          setError(messageFor(result.error));
          return;
        }
        const text =
          result.error === "no_active_question"
            ? "Вопрос ещё не открыт. Кнопка уже ходит в базу: в игре победит первый по серверному времени."
            : messageFor(result.error);
        setBuzz({
          tone: result.error === "no_active_question" ? "muted" : "danger",
          text,
          time,
        });
        return;
      }
      setBuzz({
        tone: result.won ? "ok" : "danger",
        text: result.won
          ? "Вы первый. Можно отвечать."
          : "Кто-то нажал раньше.",
        time,
      });
    } catch {
      setBuzz({ tone: "danger", text: messageFor("network") });
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
      // Имя может остаться в списке, локальную сессию всё равно закрываем.
    } finally {
      clearPlayer(normalized);
      setMemorySession(null);
      setBuzz(null);
      setPending(false);
    }
  }

  return (
    <Shell width="max-w-md">
      <p className="text-sm text-muted">Комната</p>
      <h1 className="mt-1 font-mono text-4xl tracking-[0.28em] text-gold">
        {normalized}
      </h1>

      {session ? (
        <div className="mt-6">
          <p className="text-lg">
            {session.role === "spectator" ? "Вы зритель" : "Вы в игре"},{" "}
            <span className="font-semibold">{session.nickname}</span>
          </p>
          {session.role === "player" ? (
            <>
              <button
                type="button"
                onClick={() => void pressBuzz()}
                disabled={pending}
                className="mt-6 flex min-h-56 w-full items-center justify-center rounded-[2rem] bg-gold text-4xl font-black text-navy shadow-[0_16px_50px_rgba(240,199,94,0.28)] transition active:scale-[0.99] disabled:opacity-60"
              >
                Ответить
              </button>
              {buzz ? (
                <p
                  className={`mt-4 text-sm leading-6 ${buzz.tone === "ok" ? "text-ok" : buzz.tone === "danger" ? "text-danger" : "text-muted"}`}
                  role="status"
                >
                  {buzz.text}
                  {buzz.time ? ` Серверное время: ${buzz.time}.` : ""}
                </p>
              ) : (
                <p className="mt-4 text-sm leading-6 text-muted">
                  Нажмите, когда ведущий откроет вопрос. Сейчас это заглушка:
                  если вопроса нет, база так и ответит.
                </p>
              )}
            </>
          ) : (
            <p className="mt-6 text-sm leading-6 text-muted">
              Зрители не нажимают кнопку.
            </p>
          )}
          <button
            type="button"
            onClick={() => void leave()}
            disabled={pending}
            className="mt-8 text-sm text-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-60"
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
            {error ? (
              <p className="mt-4 text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
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

function formatServerTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hourCycle: "h23",
  }).format(date);
}
