"use client";

import { displayPrompt } from "@/lib/game/prompt";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Board } from "@/components/game/board";
import {
  HostMoves,
  HostToggles,
  PendingAnswers,
  answererId,
  callHostAction,
  decisionsFrom,
  type HostSheet,
} from "@/components/game/host-controls";
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
import {
  PAIR_LENGTH,
  normalizePairCode,
  pairFromHash,
} from "@/lib/rooms/host-phone";
import { messageFor } from "@/lib/rooms/messages";
import {
  clearPhoneToken,
  savePhoneToken,
  usePhoneToken,
} from "@/lib/rooms/storage";

async function phoneRequest(body: Record<string, unknown>) {
  const response = await fetch("/api/host/phone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as {
    ok?: boolean;
    error?: string;
    phoneToken?: string;
  };
}

/**
 * Пульт ведущего на телефоне: вопрос, эталон с вариантами и все ходы
 * ведущего. Доступ — по ключу телефона, который выдаётся в обмен на
 * одноразовый код с большого экрана.
 */
export function HostPhoneScreen({ code }: { code: string }) {
  const normalized = normalizeRoomCode(code);
  const token = usePhoneToken(normalized);
  const [claiming, setClaiming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function claim(pair: string) {
    if (!normalized) return;
    setClaiming(true);
    setNotice(null);
    try {
      const result = await phoneRequest({
        action: "claim",
        code: normalized,
        pair,
      });
      if (!result.ok || !result.phoneToken) {
        setNotice(messageFor(result.error));
        return;
      }
      if (!savePhoneToken(normalized, result.phoneToken)) {
        setNotice(
          "Браузер не сохранил ключ ведущего. Откройте обычную вкладку.",
        );
      }
    } catch {
      setNotice(messageFor("network"));
    } finally {
      setClaiming(false);
    }
  }

  // QR с экрана: код во фрагменте (#p=…). Сразу стираем его из адреса и
  // истории и меняем на ключ телефона — второй раз код не сработает.
  useEffect(() => {
    if (!normalized) return;
    const pair = pairFromHash(window.location.hash);
    if (!pair) return;
    const { pathname, search } = window.location;
    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}${search}`,
    );
    // Не в теле эффекта: claim меняет состояние. Без cleanup — адрес уже
    // очищен, повторный запуск эффекта кода не найдёт.
    window.setTimeout(() => void claim(pair), 0);
    // claim не зависит от рендера — только от кода комнаты.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized]);

  if (!normalized) {
    return (
      <Shell width="max-w-md">
        <Panel>
          <p>Код комнаты — четыре латинские буквы.</p>
        </Panel>
      </Shell>
    );
  }

  if (!token) {
    return (
      <PairForm
        code={normalized}
        pending={claiming}
        notice={notice}
        onSubmit={(pair) => void claim(pair)}
      />
    );
  }

  return (
    <HostRemote
      key={token}
      code={normalized}
      token={token}
      onRevoked={(text) => {
        clearPhoneToken(normalized);
        setNotice(text);
      }}
    />
  );
}

function PairForm({
  code,
  pending,
  notice,
  onSubmit,
}: {
  code: string;
  pending: boolean;
  notice: string | null;
  onSubmit: (pair: string) => void;
}) {
  const [value, setValue] = useState("");
  const pair = normalizePairCode(value);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pair) onSubmit(pair);
  }
  return (
    <div className="phone">
      <header className="phone-bar">
        <Logo compact />
        <p className="hand phone-who">ведущий</p>
        <p className="mono text-xs">{code}</p>
      </header>
      <div className="phone-body px-3 py-4">
        <form className="sheet panel grid gap-3" onSubmit={submit}>
          <span className="tape tape-red hand justify-self-start">
            пульт ведущего
          </span>
          <p>
            На большом экране нажмите «Вести с телефона» и наведите камеру на QR
            — или введите код с экрана.
          </p>
          <label className="grid gap-1">
            <span className="text-sm text-muted">Код ведущего</span>
            <input
              className="field mono uppercase"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="ABCD-EFGH"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="one-time-code"
              spellCheck={false}
              maxLength={PAIR_LENGTH + 2}
            />
          </label>
          {notice ? (
            <p className="text-danger" role="alert">
              {notice}
            </p>
          ) : null}
          <button
            type="submit"
            className="action w-full"
            disabled={!pair || pending}
          >
            {pending ? "Подключаем…" : "Стать ведущим"}
          </button>
          <Link href={`/play/${code}`} className="text-sm text-pen underline">
            Я игрок — войти в комнату
          </Link>
        </form>
      </div>
    </div>
  );
}

function HostRemote({
  code,
  token,
  onRevoked,
}: {
  code: string;
  token: string;
  onRevoked: (text: string) => void;
}) {
  const match = useMatch(code);
  const now = useNow();
  const [sheet, setSheet] = useState<HostSheet | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finalPicks, setFinalPicks] = useState<Record<string, boolean>>({});
  const [bye, setBye] = useState(false);
  const game = match.status === "ready" ? match.game : null;
  const credentials = { phoneToken: token };

  function revoked(result: { error?: string }) {
    if (result.error === "phone_revoked" || result.error === "not_host") {
      onRevoked(messageFor("phone_revoked"));
      return true;
    }
    return false;
  }

  // Эталон и ответы — только через сервер с ключом телефона.
  useEffect(() => {
    if (!game) return;
    let cancelled = false;
    const quiet =
      game.phase === "lobby" ||
      game.phase === "board" ||
      game.phase === "finished";
    if (quiet) {
      // Ключ мог быть отозван — проверим на спокойной фазе.
      void phoneRequest({ action: "check", code, phoneToken: token })
        .then((result) => {
          if (!cancelled && !result.ok) revoked(result);
        })
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }
    void callHostAction(code, "clue", { phoneToken: token })
      .then((payload) => {
        if (cancelled) return;
        if (payload.ok === false && revoked(payload)) return;
        setSheet(payload as HostSheet);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // revoked меняется каждый рендер; реагируем на партию.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, code, token]);

  async function run(action: string, extra?: Record<string, unknown>) {
    setPending(true);
    setError(null);
    try {
      const result = await callHostAction(code, action, credentials, extra);
      requestMatchReload();
      if (revoked(result)) return;
      const raced =
        (action === "continue" || action === "pass") &&
        result.error === "bad_phase";
      if (result.ok !== true && !raced) {
        setError(messageFor(String(result.error ?? "")));
      }
    } catch {
      setError(messageFor("network"));
    } finally {
      setPending(false);
    }
  }

  async function leave() {
    try {
      await phoneRequest({ action: "disconnect", code, phoneToken: token });
    } catch {
      // Ключ всё равно сотрём с телефона.
    }
    onRevoked("Телефон отключён. Пульт снова на большом экране.");
  }

  if (match.status !== "ready") {
    const text =
      match.status === "missing"
        ? "Такой комнаты нет."
        : match.status === "error"
          ? match.message
          : "Собираем комнату…";
    return (
      <Shell width="max-w-md">
        <p className="hand text-3xl">{text}</p>
      </Shell>
    );
  }

  const { room, players, board } = match;
  const current = board.find(
    (cell) => cell.id === match.game.current_question_id,
  );
  const seated = scoreboardPlayers(players);
  const phase = match.game.phase;
  const left = secondsLeft(match.game.deadline, now);
  const answering =
    current?.special === "cat"
      ? players.find((player) => player.id === current.assigned_player_id)
      : players.find(
          (player) => player.id === match.game.buzz_winner_player_id,
        );
  const chooser = players.find(
    (player) => player.id === match.game.chooser_player_id,
  );
  const voiceOn = room.host_voice ?? room.host_mode === "bot";
  const inQuestion = !["lobby", "board", "cat_pick", "finished"].includes(
    phase,
  );
  const prompt = displayPrompt(sheet?.prompt ?? current?.prompt ?? null);
  const variants = (sheet?.variants ?? []).filter(
    (variant) => variant && variant !== sheet?.expected,
  );
  const sheetFresh = sheet?.phase !== undefined;

  return (
    <div className="phone host-remote">
      <header className="phone-bar">
        <Logo compact />
        <p className="hand phone-who">ведущий</p>
        <p className="mono text-xs">{code}</p>
        {bye ? (
          <button
            type="button"
            className="action h-11 px-3"
            onClick={() => void leave()}
          >
            отключить
          </button>
        ) : (
          <button
            type="button"
            className="h-11 w-11 border border-ink text-sm"
            onClick={() => setBye(true)}
            aria-label="Отключить телефон ведущего"
          >
            ×
          </button>
        )}
      </header>
      <div className="phone-body grid content-start gap-3 px-3 py-3">
        <ul className="host-remote-scores">
          {seated.map((player) => (
            <li
              key={player.id}
              className={player.id === answering?.id ? "is-active" : undefined}
            >
              <span className="hand">{player.nickname}</span>
              <span className={`mono ${player.score < 0 ? "text-danger" : ""}`}>
                {player.score}
              </span>
            </li>
          ))}
        </ul>

        {error ? (
          <p className="text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {phase === "lobby" ? (
          <section className="sheet panel grid gap-3">
            <p className="hand text-3xl">
              {seated.length < 2
                ? "Ждём игроков: нужно хотя бы двое"
                : `За столом ${seated.length}`}
            </p>
            <button
              type="button"
              className="action w-full"
              disabled={seated.length < 2 || pending}
              onClick={() => void run("start")}
            >
              {pending ? "Раздаём поле…" : "Начать игру"}
            </button>
          </section>
        ) : null}

        {phase === "board" ? (
          <>
            <p className="hand text-2xl">
              Выбирает {chooser?.nickname ?? "игрок"} — или нажмите клетку за
              него
            </p>
            <Board
              cells={board}
              round={match.game.round}
              canPick={!pending}
              activeId={match.game.current_question_id}
              onPick={(cell) => void run("pick", { questionId: cell.id })}
            />
          </>
        ) : null}

        {phase === "cat_pick" ? (
          <p className="hand text-2xl text-danger">
            Кот в мешке. {chooser?.nickname ?? "Игрок"} выбирает, кому отдать.
          </p>
        ) : null}

        {inQuestion ? (
          <section className="sheet panel grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="tape tape-red poster">
                {current?.category ?? sheet?.category ?? "Вопрос"} ·{" "}
                {current?.value || sheet?.value || "финал"}
                {current?.special === "cat" ? " · кот" : ""}
              </p>
              {left !== null && phase !== "reveal" ? (
                <span
                  className={`poster host-remote-clock ${left <= 5 ? "is-hot" : ""}`}
                >
                  {left}
                </span>
              ) : null}
            </div>
            {prompt ? <p className="host-remote-prompt">{prompt}</p> : null}
            {current && current.kind !== "text" ? (
              <p className="text-sm text-muted">
                {current.picture
                  ? "Картинка на большом экране"
                  : current.kind === "image"
                    ? "Картинка на большом экране"
                    : current.kind === "music"
                      ? "Трек играет на большом экране"
                      : "Видео на большом экране"}
              </p>
            ) : null}
            {answering && (phase === "answering" || phase === "judging") ? (
              <p className="hand text-2xl">Отвечает {answering.nickname}</p>
            ) : null}
          </section>
        ) : null}

        {inQuestion && phase !== "reveal" ? (
          <section className="host-remote-answer" aria-label="Эталон">
            <p className="text-sm">Эталон — видите только вы</p>
            <p className="host-remote-expected">
              {sheet?.expected ?? (sheetFresh ? "—" : "…")}
            </p>
            {variants.length > 0 ? (
              <p className="text-sm">Ещё засчитать: {variants.join(", ")}</p>
            ) : null}
          </section>
        ) : null}

        {phase === "reveal" ? (
          <section className="sheet panel">
            <p className="text-sm text-muted">Ответ на экране</p>
            <p className="host-remote-prompt">
              {match.game.revealed_answer ?? sheet?.expected ?? ""}
            </p>
          </section>
        ) : null}

        {inQuestion ? (
          <div className="grid gap-2">
            <PendingAnswers sheet={sheet} />
            <HostMoves
              className="host-remote-moves"
              game={match.game}
              sheet={sheet}
              pending={pending}
              finalPicks={finalPicks}
              onOpenBuzz={() => void run("open_buzz")}
              onPass={() => void run("pass")}
              onContinue={() => void run("continue")}
              onJudge={(correct) =>
                void run("judge", { correct, playerId: answererId(match) })
              }
              onFinalPick={(playerId, correct) =>
                setFinalPicks((picks) => ({ ...picks, [playerId]: correct }))
              }
              onFinalize={() =>
                void run("finalize", {
                  decisions: decisionsFrom(sheet, finalPicks),
                })
              }
            />
          </div>
        ) : null}

        {phase === "finished" ? (
          <p className="hand text-3xl">Игра окончена — итог на экране.</p>
        ) : null}

        {phase !== "finished" ? (
          <section className="grid gap-2 border-t border-ink/20 pt-3">
            <HostToggles
              voiceOn={voiceOn}
              hostStartsMedia={room.host_starts_media}
              hostMode={room.host_mode}
              onVoice={(value) => void run("voice", { correct: value })}
              onHostStarts={(value) =>
                void run("media_cue", { correct: value })
              }
            />
          </section>
        ) : null}
      </div>
    </div>
  );
}
