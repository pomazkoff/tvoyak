"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  KIDS_THEME,
  THEME_KIND_LABEL,
  THEME_KINDS,
  balanceNotes,
  inspectBoard,
  questionsLabel,
  themeWarningText,
  type ThemeCard,
  type ThemeCandidate,
  type ThemeKind,
} from "@/lib/game/themes";
import { companyId } from "@/lib/rooms/company";
import { messageFor } from "@/lib/rooms/messages";

type Rounds = [string[], string[]];

type Ready = {
  themes: ThemeCard[];
  rounds: Rounds;
};

const FILTERS: Array<{ id: "all" | ThemeKind; label: string }> = [
  { id: "all", label: "Все" },
  { id: "text", label: "Текстовые" },
  { id: "music", label: "Музыка" },
  { id: "video", label: "Видео" },
  { id: "picture", label: "Картинки" },
  { id: "brain", label: "Мозголомки" },
];

export function ThemePicker({
  pending,
  error,
  onClose,
  onCreate,
}: {
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (categories: string[]) => void;
}) {
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const closeRef = useRef(onClose);
  const slotRef = useRef<{ round: 0 | 1; index: number } | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [slot, setSlot] = useState<{ round: 0 | 1; index: number } | null>(
    null,
  );

  useEffect(() => {
    closeRef.current = onClose;
    slotRef.current = slot;
  }, [onClose, slot]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || pending) return;
      if (slotRef.current) setSlot(null);
      else closeRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [pending]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [slot]);

  useEffect(() => {
    let cancelled = false;
    void fetchProposal().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setReady(result);
        setLoadError(null);
      } else {
        setLoadError(result.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function regenerate() {
    setRefreshing(true);
    setSlot(null);
    const result = await fetchProposal();
    if (result.ok) {
      setReady(result);
      setLoadError(null);
    } else {
      setLoadError(result.message);
    }
    setRefreshing(false);
  }

  const byName = new Map(ready?.themes.map((theme) => [theme.name, theme]));
  const catalog = (ready?.themes ?? []).map(cardToCandidate);
  const names = ready ? ready.rounds.flat() : [];
  const inspected = ready ? inspectBoard(names, catalog) : null;
  const notes = ready ? balanceNotes(names, catalog) : [];
  const blocked = !ready || Boolean(inspected?.problem) || pending;

  return (
    <div className="theme-backdrop">
      <div
        className="sheet theme-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="theme-picker-head">
          <h2
            id={titleId}
            ref={headingRef}
            tabIndex={-1}
            className="hand theme-picker-title"
          >
            {slot ? "Заменить тему" : "Темы партии"}
          </h2>
          <button
            type="button"
            className="theme-close"
            onClick={onClose}
            disabled={pending}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        {loadError && !ready ? (
          <div className="theme-picker-body">
            <p className="theme-alert" role="alert">
              {loadError}
            </p>
          </div>
        ) : !ready ? (
          <div className="theme-picker-body">
            <p className="theme-lead">Собираем набор…</p>
          </div>
        ) : slot ? (
          <ReplaceList
            themes={ready.themes}
            rounds={ready.rounds}
            slot={slot}
            onPick={(name) => {
              setReady({
                ...ready,
                rounds: replaceAt(ready.rounds, slot.round, slot.index, name),
              });
              setSlot(null);
            }}
          />
        ) : (
          <div className="theme-picker-body">
            <p className="theme-lead">
              Два раунда по шесть тем. Это автоподбор: замените любую, соберите
              набор заново или оставьте как есть.
            </p>
            <div className="theme-rounds">
              {ready.rounds.map((round, roundIndex) => (
                <section
                  key={roundIndex}
                  aria-label={`Раунд ${roundIndex + 1}`}
                >
                  <h3 className="theme-round-title">
                    Раунд {roundIndex + 1}
                    <span>{roundIndex === 0 ? "100–500" : "200–1000"}</span>
                  </h3>
                  <div className="theme-round-grid">
                    {round.map((name, index) => {
                      const card = byName.get(name);
                      return (
                        <button
                          key={`${roundIndex}-${index}`}
                          type="button"
                          className={`theme-slot${card?.thin ? " is-thin" : ""}`}
                          data-theme={name}
                          disabled={pending || refreshing}
                          onClick={() =>
                            setSlot({ round: roundIndex as 0 | 1, index })
                          }
                        >
                          <span
                            className={`theme-kind theme-kind-${card?.kind ?? "text"}`}
                          >
                            {card?.label ?? THEME_KIND_LABEL.text}
                          </span>
                          <span className="theme-slot-name">{name}</span>
                          <span className="theme-slot-meta">
                            {card
                              ? questionsLabel(card.questions)
                              : "нет в списке"}
                            {card?.thin ? " · мало" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            <p className="theme-note">
              Состав раунда сохранится. Порядок колонок на поле будет случайным.
            </p>
            {inspected?.warnings.map((warning) => (
              <p key={warning.name} className="theme-alert" role="status">
                {themeWarningText(warning)}
              </p>
            ))}
            {notes.map((note) => (
              <p key={note} className="theme-note">
                {note}
              </p>
            ))}
            {refreshing ? (
              <p className="theme-lead">Собираем другой набор…</p>
            ) : null}
          </div>
        )}

        <div className="theme-picker-foot">
          {error ? (
            <p className="theme-alert" role="alert">
              {error}
            </p>
          ) : null}
          {loadError && ready ? (
            <p className="theme-alert" role="alert">
              {loadError}
            </p>
          ) : null}
          {slot ? (
            <button
              type="button"
              className="theme-ghost"
              onClick={() => setSlot(null)}
            >
              К набору
            </button>
          ) : (
            <>
              <button
                type="button"
                className="action"
                disabled={blocked || refreshing}
                onClick={() => ready && onCreate(ready.rounds.flat())}
              >
                {pending ? "Создаём…" : "Создать комнату с этими темами"}
              </button>
              <button
                type="button"
                className="theme-ghost"
                disabled={pending || refreshing}
                onClick={() => void regenerate()}
              >
                Другой набор
              </button>
              <button
                type="button"
                className="theme-ghost"
                disabled={pending}
                onClick={onClose}
              >
                Как обычно
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ReplaceList({
  themes,
  rounds,
  slot,
  onPick,
}: {
  themes: ThemeCard[];
  rounds: Rounds;
  slot: { round: 0 | 1; index: number };
  onPick: (name: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | ThemeKind>("all");
  const [search, setSearch] = useState("");
  const current = rounds[slot.round][slot.index] ?? "";
  const currentKind = themes.find((theme) => theme.name === current)?.kind;
  const used = new Set(rounds.flat());
  const query = search.trim().toLocaleLowerCase("ru");
  const items = themes
    .filter((theme) => filter === "all" || theme.kind === filter)
    .filter(
      (theme) => !query || theme.name.toLocaleLowerCase("ru").includes(query),
    )
    .sort((left, right) => {
      const leftSame = left.kind === currentKind ? 0 : 1;
      const rightSame = right.kind === currentKind ? 0 : 1;
      if (leftSame !== rightSame) return leftSame - rightSame;
      const leftKind = THEME_KINDS.indexOf(left.kind);
      const rightKind = THEME_KINDS.indexOf(right.kind);
      if (leftKind !== rightKind) return leftKind - rightKind;
      return left.name.localeCompare(right.name, "ru");
    });

  return (
    <div className="theme-picker-body">
      <p className="theme-lead">
        Сейчас в раунде {slot.round + 1}: «{current}». Выберите другую доступную
        тему.
      </p>
      <div className="theme-filters" role="radiogroup" aria-label="Тип темы">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={filter === item.id}
            className={`theme-filter${filter === item.id ? " is-on" : ""}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor="theme-search">
        Найти тему
      </label>
      <input
        id="theme-search"
        className="theme-search"
        value={search}
        placeholder="Найти тему"
        onChange={(event) => setSearch(event.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      {items.length === 0 ? (
        <p className="theme-note">Нет таких тем.</p>
      ) : (
        <ul className="theme-options">
          {items.map((theme) => {
            const taken = used.has(theme.name) && theme.name !== current;
            return (
              <li key={theme.name}>
                <button
                  type="button"
                  className="theme-option"
                  disabled={taken}
                  onClick={() => onPick(theme.name)}
                >
                  <span className={`theme-kind theme-kind-${theme.kind}`}>
                    {theme.label}
                  </span>
                  <span className="theme-option-copy">
                    <span className="theme-slot-name">{theme.name}</span>
                    <span className="theme-slot-meta">
                      {questionsLabel(theme.questions)}
                      {theme.thin ? " · мало вопросов" : ""}
                      {theme.name === KIDS_THEME
                        ? " · обычно в каждой игре"
                        : ""}
                      {taken ? " · уже в игре" : ""}
                      {theme.name === current ? " · эта тема" : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function replaceAt(
  rounds: Rounds,
  round: 0 | 1,
  index: number,
  name: string,
): Rounds {
  const next: Rounds = [[...rounds[0]], [...rounds[1]]];
  const row = next[round];
  if (row) row[index] = name;
  return next;
}

function cardToCandidate(card: ThemeCard): ThemeCandidate {
  return {
    name: card.name,
    kind: card.kind,
    family: null,
    available: card.questions,
    unseen: card.questions,
  };
}

async function fetchProposal(): Promise<
  ({ ok: true } & Ready) | { ok: false; message: string }
> {
  try {
    const company = companyId(safeStorage());
    const query = company ? `?companyId=${encodeURIComponent(company)}` : "";
    const response = await fetch(`/api/themes${query}`);
    const payload = (await response.json()) as {
      error?: string;
      themes?: ThemeCard[];
      rounds?: Rounds | null;
    };
    if (!response.ok || payload.error || !payload.rounds) {
      return {
        ok: false,
        message:
          payload.error === "bank_too_small"
            ? "В базе мало тем для своего набора. Создайте комнату как обычно — темы подберём в начале игры."
            : messageFor(payload.error ?? "themes_unavailable"),
      };
    }
    return { ok: true, themes: payload.themes ?? [], rounds: payload.rounds };
  } catch {
    return { ok: false, message: messageFor("network") };
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
