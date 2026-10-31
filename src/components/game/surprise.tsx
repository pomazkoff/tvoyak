"use client";

import { useEffect, useState } from "react";
import type { MatchState } from "@/components/game/use-match";
import { scoreboardPlayers } from "@/lib/game/scoreboard";
import {
  ROULETTE_SPIN_MS,
  SURPRISE_EFFECTS,
  SURPRISE_KIND_LABEL,
  SURPRISE_META,
  applyInstantEffect,
  globalEffects,
  hasLetterA,
  isSurpriseEffect,
  outcomeLines,
  playerEffects,
  type EffectRow,
  type SurpriseEffect,
  type SurpriseRow,
} from "@/lib/game/surprises";
import type { PlayerRow } from "@/lib/supabase/types";

type ReadyMatch = Extract<MatchState, { status: "ready" }>;

export function isSurprisePhase(phase: string): boolean {
  return phase === "surprise" || phase === "surprise_pick";
}

/** Сюрприз текущей клетки (если он был). */
export function currentSurprise(match: ReadyMatch): SurpriseRow | null {
  const questionId = match.game.current_question_id;
  if (!questionId) return null;
  return match.surprises.find((row) => row.question_id === questionId) ?? null;
}

const INSTANT = new Set<SurpriseEffect>([
  "letter_a",
  "steal",
  "swap_left",
  "shortest_nick",
  "rotate",
  "robin_hood",
]);

/** Что произойдёт (пока рулетка крутится, сервер ещё не применил эффект). */
function previewLines(
  effect: SurpriseEffect,
  players: PlayerRow[],
  opener: PlayerRow | undefined,
): string[] {
  const seated = scoreboardPlayers(players);
  const openerId = opener?.id ?? "";
  if (INSTANT.has(effect)) {
    if (effect === "letter_a" && opener && !hasLetterA(opener.nickname)) {
      return [`В имени ${opener.nickname} нет «а» — ничего.`];
    }
    const next = applyInstantEffect(effect, seated, openerId);
    const lines = seated
      .filter((player) => next[player.id] !== player.score)
      .map((player) => {
        const delta = next[player.id] - player.score;
        return `${player.nickname}: ${delta > 0 ? "+" : ""}${delta} → ${next[player.id]}`;
      });
    if (!lines.length) return ["Счёт не меняется."];
    return lines;
  }
  if (!opener) return [];
  switch (effect) {
    case "double":
      return [`${opener.nickname}: следующий верный ответ ×2`];
    case "shield":
      return [`${opener.nickname}: следующая ошибка без минуса`];
    case "hint":
      return [`${opener.nickname} видит первую букву ответа`];
    case "caps":
      return [`${opener.nickname} отвечает только КАПСОМ`];
    case "one_word":
      return [`${opener.nickname} отвечает одним словом`];
    case "freeze":
      return [`${opener.nickname} пропускает этот вопрос`];
    case "pick_next":
      return [`${opener.nickname} назначит, кто выберет следующую клетку`];
    default:
      return [];
  }
}

/**
 * Рулетка сюрприза: прокрутка эффектов и остановка на выбранном сервером.
 * Сервер даёт фазе 11 с; барабан крутится ~4 с, дальше — карточка эффекта.
 */
export function SurpriseRoulette({
  surprise,
  players,
  left,
  variant,
  children,
}: {
  surprise: SurpriseRow;
  players: PlayerRow[];
  left: number | null;
  variant: "tv" | "phone";
  children?: React.ReactNode;
}) {
  const effect = isSurpriseEffect(surprise.effect) ? surprise.effect : null;
  const landed = useLanded(left);
  if (!effect) return null;
  const meta = SURPRISE_META[effect];
  const opener = players.find(
    (player) => player.id === surprise.opener_player_id,
  );
  const lines =
    surprise.status === "done"
      ? outcomeLines(surprise, opener?.nickname ?? null)
      : previewLines(effect, players, opener);
  // Барабан: три круга эффектов и в конце — выпавший.
  const reel = [
    ...SURPRISE_EFFECTS,
    ...SURPRISE_EFFECTS,
    ...SURPRISE_EFFECTS.slice(0, SURPRISE_EFFECTS.indexOf(effect)),
    effect,
  ];
  return (
    <section
      className={`surprise surprise-${variant} is-${meta.kind}`}
      data-effect={effect}
      data-landed={landed ? "yes" : "no"}
      role="status"
      aria-live="polite"
    >
      <p className="tape tape-red poster surprise-head">
        Сюрприз!
        {opener ? (
          <span className="surprise-who"> · {opener.nickname}</span>
        ) : null}
      </p>
      {landed ? (
        <div className="surprise-card" key="card">
          <p className="surprise-kind hand">{SURPRISE_KIND_LABEL[meta.kind]}</p>
          <p className="surprise-icon poster" aria-hidden>
            {meta.icon}
          </p>
          <h2 className="surprise-title poster">{meta.title}</h2>
          <p className="surprise-text">{meta.text}</p>
          {lines.length ? (
            <ul className="surprise-lines hand">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {children}
        </div>
      ) : (
        <div className="surprise-window" aria-label="Крутим рулетку">
          <ul
            className="surprise-reel poster"
            style={
              {
                "--spin-to": `calc(-${reel.length - 1} * var(--reel-row))`,
                "--spin-ms": `${ROULETTE_SPIN_MS}ms`,
              } as React.CSSProperties
            }
          >
            {reel.map((item, index) => (
              <li
                key={`${item}-${index}`}
                className={`is-${SURPRISE_META[item].kind}`}
              >
                <span aria-hidden>{SURPRISE_META[item].icon}</span>{" "}
                {SURPRISE_META[item].title}
              </li>
            ))}
          </ul>
        </div>
      )}
      {left !== null ? (
        <p className="surprise-clock mono" aria-label={`Осталось ${left} с`}>
          {left}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Барабан докрутился? Если экран открыли посреди фазы — сразу итог.
 * Родитель ставит key={surprise.id}, поэтому состояние — на один сюрприз.
 */
function useLanded(left: number | null): boolean {
  const [landed, setLanded] = useState(
    () => left !== null && left * 1000 < 11000 - ROULETTE_SPIN_MS - 1500,
  );
  useEffect(() => {
    if (landed) return;
    const timer = window.setTimeout(
      () => setLanded(true),
      ROULETTE_SPIN_MS + 250,
    );
    return () => window.clearTimeout(timer);
  }, [landed]);
  return landed;
}

/** «Выбор хода»: список игроков, кого назначить выбирающим. */
export function SurpriseChooser({
  players,
  pending,
  onChoose,
  title = "Кто выберет следующую клетку?",
}: {
  players: PlayerRow[];
  pending: boolean;
  onChoose: (playerId: string) => void;
  title?: string;
}) {
  return (
    <div className="surprise-chooser">
      <p className="hand text-2xl">{title}</p>
      <div className="mt-2 grid gap-2">
        {scoreboardPlayers(players).map((player) => (
          <button
            key={player.id}
            type="button"
            disabled={pending}
            onClick={() => onChoose(player.id)}
            className="surprise-choice"
          >
            {player.nickname}
          </button>
        ))}
      </div>
    </div>
  );
}

export function EffectBadges({
  effects,
  className = "",
}: {
  effects: readonly SurpriseEffect[];
  className?: string;
}) {
  if (!effects.length) return null;
  return (
    <span className={`effect-badges ${className}`}>
      {effects.map((effect, index) => (
        <span
          key={`${effect}-${index}`}
          className={`effect-badge is-${SURPRISE_META[effect].kind}`}
          title={SURPRISE_META[effect].text}
          data-effect={effect}
        >
          <span aria-hidden>{SURPRISE_META[effect].icon}</span>{" "}
          {SURPRISE_META[effect].badge}
        </span>
      ))}
    </span>
  );
}

/** Бейджи каждого игрока (по id) для табло. */
export function badgesByPlayer(
  effects: readonly EffectRow[],
  currentQuestionId: string | null,
  players: readonly PlayerRow[],
): Record<string, SurpriseEffect[]> {
  return Object.fromEntries(
    players.map((player) => [
      player.id,
      playerEffects(effects, player.id, currentQuestionId),
    ]),
  );
}

/**
 * Полоска над вопросом: какой сюрприз выпал на этой клетке и что действует
 * для всех (×3, полтаймера, перемешка).
 */
export function SurpriseStrip({
  match,
  className = "",
}: {
  match: ReadyMatch;
  className?: string;
}) {
  const surprise = currentSurprise(match);
  const global = globalEffects(match.effects, match.game.current_question_id);
  if (isSurprisePhase(match.game.phase)) return null;
  const shown =
    surprise &&
    surprise.status === "done" &&
    isSurpriseEffect(surprise.effect) &&
    !["board", "finished"].includes(match.game.phase)
      ? surprise
      : null;
  if (!shown && !global.length) return null;
  const opener = match.players.find(
    (player) => player.id === shown?.opener_player_id,
  );
  const effect = shown && isSurpriseEffect(shown.effect) ? shown.effect : null;
  const lines = shown ? outcomeLines(shown, opener?.nickname ?? null) : [];
  return (
    <div className={`surprise-strip ${className}`} role="status">
      {effect ? (
        <span
          className={`surprise-strip-main is-${SURPRISE_META[effect].kind}`}
        >
          <span aria-hidden>{SURPRISE_META[effect].icon}</span>{" "}
          {SURPRISE_META[effect].title}
          {opener ? ` · ${opener.nickname}` : ""}
          {lines.length ? ` — ${lines.join("; ")}` : ""}
        </span>
      ) : null}
      <EffectBadges effects={global} />
    </div>
  );
}
