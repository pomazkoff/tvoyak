/**
 * Подбор тем до создания комнаты. Правила совпадают с start_game
 * (supabase/migrations/20261031120000_fixed_board.sql): в пуле темы,
 * где хотя бы 10 доступных вопросов; в каждом раунде музыка, картинка,
 * мозголомка и текст, в одном из раундов вместо одной текстовой — видео;
 * «Детский рисунок» занимает картиночный слот одного раунда; за игру не
 * больше двух музыкальных и двух картиночных; в раунде нет двух тем одного
 * семейства, пока это возможно; сначала невиденные. Нет нужного типа —
 * другое медиа, потом текст, потом любая тема.
 *
 * Выбранные 12 тем пишутся в room_secrets.board_categories и start_game
 * берёт их как есть (порядок колонок внутри раунда всё равно случайный).
 */

export type ThemeKind = "text" | "music" | "video" | "picture" | "brain";

export const THEME_KINDS: ThemeKind[] = [
  "text",
  "music",
  "video",
  "picture",
  "brain",
];

/** Подписи на кнопках выбора — как их называет ведущий. */
export const THEME_KIND_LABEL: Record<ThemeKind, string> = {
  text: "текстовая",
  music: "музыкальная",
  video: "видео",
  picture: "картиночная",
  brain: "мозголомка",
};

/** Колонка раунда — пять клеток. Меньше вопросов start_game набор отбросит. */
export const MIN_THEME_QUESTIONS = 5;

/** Автоподбор, как having count(*) >= 10 в start_game. */
export const MIN_AUTO_QUESTIONS = 10;

/** Невиденных вопросов, чтобы тема считалась свежей для компании. */
export const MIN_FRESH_QUESTIONS = 5;

export const KIDS_THEME = "Детский рисунок";

const KIND_SET = new Set<string>(THEME_KINDS);

export type ThemeCandidate = {
  name: string;
  kind: ThemeKind;
  family: string | null;
  /** Вопросы, которые можно раздать: картинки — только одобренные. */
  available: number;
  /** Из available ещё не открывались этой компанией. */
  unseen: number;
};

export type BankQuestionRow = {
  id: string;
  category: string | null;
  picture: string | null;
  enabled: boolean | null;
};

export type CategoryMetaRow = {
  category: string;
  kind: string | null;
  family: string | null;
};

export type ThemeCard = {
  name: string;
  kind: ThemeKind;
  label: string;
  questions: number;
  /** Меньше десяти: колонка соберётся, но запас маленький. */
  thin: boolean;
};

export type ThemeWarning = {
  name: string;
  questions: number;
};

export type ThemeBoardProblem = {
  error: "unknown_theme" | "theme_short";
  themes: string[];
};

export function themeKind(value: string | null | undefined): ThemeKind {
  return value && KIND_SET.has(value) ? (value as ThemeKind) : "text";
}

/** «3 вопроса», «2 вопроса», «5 вопросов». */
export function questionsLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? "вопрос"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "вопроса"
        : "вопросов";
  return `${count} ${word}`;
}

/**
 * Сводка банка. Картинка без enabled не считается (как
 * `picture is null or enabled` в start_game). Текстовый вопрос считается
 * даже если enabled выключен: в SQL условие про картинку.
 */
export function summarizeThemes(
  rows: BankQuestionRow[],
  meta: CategoryMetaRow[],
  seenIds: ReadonlySet<string>,
): ThemeCandidate[] {
  const metaByName = new Map(meta.map((row) => [row.category, row]));
  const buckets = new Map<string, { available: number; unseen: number }>();
  for (const row of rows) {
    const name = row.category?.trim();
    if (!name) continue;
    const bucket = buckets.get(name) ?? { available: 0, unseen: 0 };
    const available = row.picture == null || row.enabled === true;
    if (available) {
      bucket.available += 1;
      if (!seenIds.has(row.id)) bucket.unseen += 1;
    }
    buckets.set(name, bucket);
  }
  return [...buckets].map(([name, bucket]) => {
    const info = metaByName.get(name);
    return {
      name,
      kind: themeKind(info?.kind),
      family: info?.family ?? null,
      available: bucket.available,
      unseen: bucket.unseen,
    };
  });
}

export function themeCards(catalog: ThemeCandidate[]): ThemeCard[] {
  return catalog
    .filter((theme) => theme.available >= MIN_THEME_QUESTIONS)
    .map((theme) => ({
      name: theme.name,
      kind: theme.kind,
      label: THEME_KIND_LABEL[theme.kind],
      questions: theme.available,
      thin: theme.available < MIN_AUTO_QUESTIONS,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

/** 12 разных непустых названий. null — тело запроса не набор тем. */
export function parseThemeBoard(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length !== 12) return null;
  const names: string[] = [];
  for (const item of input) {
    if (typeof item !== "string") return null;
    const name = item.trim();
    if (!name || name.length > 100) return null;
    names.push(name);
  }
  if (new Set(names).size !== 12) return null;
  return names;
}

export function inspectBoard(
  names: string[],
  catalog: ThemeCandidate[],
): { problem: ThemeBoardProblem | null; warnings: ThemeWarning[] } {
  const byName = new Map(catalog.map((theme) => [theme.name, theme]));
  const unknown: string[] = [];
  const short: string[] = [];
  const warnings: ThemeWarning[] = [];
  for (const name of names) {
    const theme = byName.get(name);
    if (!theme) {
      unknown.push(name);
      continue;
    }
    if (theme.available < MIN_THEME_QUESTIONS) {
      short.push(name);
      continue;
    }
    if (theme.available < MIN_AUTO_QUESTIONS) {
      warnings.push({ name, questions: theme.available });
    }
  }
  const problem = unknown.length
    ? { error: "unknown_theme" as const, themes: unknown }
    : short.length
      ? { error: "theme_short" as const, themes: short }
      : null;
  return { problem, warnings };
}

/** Мягкая пометка, если ведущий сам вышел за обычные лимиты раунда. */
export function balanceNotes(
  names: string[],
  catalog: ThemeCandidate[],
): string[] {
  const byName = new Map(catalog.map((theme) => [theme.name, theme]));
  let music = 0;
  let picture = 0;
  for (const name of names) {
    const kind = byName.get(name)?.kind;
    if (kind === "music") music += 1;
    if (kind === "picture") picture += 1;
  }
  const notes: string[] = [];
  if (music > 2) {
    notes.push(
      `Музыкальных тем ${music} — обычно не больше двух. Партия пройдёт и так.`,
    );
  }
  if (picture > 2) {
    notes.push(
      `Картиночных тем ${picture} — обычно не больше двух. Партия пройдёт и так.`,
    );
  }
  return notes;
}

export function themeWarningText(warning: ThemeWarning): string {
  return `В теме «${warning.name}» ${questionsLabel(warning.questions)}. На колонку из пяти хватит, но запас маленький — лучше заменить.`;
}

export type PickedBoard = {
  rounds: [string[], string[]];
};

export type PickBoardResult =
  { ok: true; board: PickedBoard } | { ok: false; error: "bank_too_small" };

type RoundState = {
  used: Set<string>;
  music: number;
  picture: number;
  kidsPending: boolean;
  picFams: Set<string>;
  roundFams: Set<string>;
};

const ANY_KIND: ThemeKind[] = [...THEME_KINDS];

function attemptKinds(slot: ThemeKind): ThemeKind[][] {
  if (slot === "video") return [["video"], ["picture"], ["text"], ANY_KIND];
  if (slot === "picture") return [["picture"], ["video"], ["text"], ANY_KIND];
  return [[slot], ["text"], ANY_KIND];
}

function rollRound(random: () => number): 1 | 2 {
  return random() < 0.5 ? 1 : 2;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.floor(random() * (index + 1)));
    const current = copy[index];
    const next = copy[swap];
    if (current === undefined || next === undefined) continue;
    copy[index] = next;
    copy[swap] = current;
  }
  return copy;
}

function fits(
  theme: ThemeCandidate,
  state: RoundState,
  strict: boolean,
): boolean {
  if (state.used.has(theme.name) || theme.name === KIDS_THEME) return false;
  if (!strict) return true;
  if (theme.family && state.roundFams.has(theme.family)) return false;
  if (theme.kind === "music" && state.music >= 2) return false;
  const pictureRoom = 2 - (state.kidsPending ? 1 : 0);
  if (theme.kind === "picture" && state.picture >= pictureRoom) return false;
  return true;
}

function chooseTheme(
  options: ThemeCandidate[],
  state: RoundState,
  random: () => number,
): ThemeCandidate | null {
  if (!options.length) return null;
  const ranked = options.map((theme) => ({
    theme,
    roll: random(),
    samePictureFamily:
      theme.kind === "picture" &&
      theme.family !== null &&
      state.picFams.has(theme.family),
  }));
  ranked.sort((left, right) => {
    const leftFresh = left.theme.unseen >= MIN_FRESH_QUESTIONS;
    const rightFresh = right.theme.unseen >= MIN_FRESH_QUESTIONS;
    if (leftFresh !== rightFresh) return leftFresh ? -1 : 1;
    if (left.samePictureFamily !== right.samePictureFamily) {
      return left.samePictureFamily ? 1 : -1;
    }
    return left.roll - right.roll;
  });
  return ranked[0]?.theme ?? null;
}

function takeTheme(theme: ThemeCandidate, state: RoundState, into: string[]) {
  state.used.add(theme.name);
  into.push(theme.name);
  if (theme.family) state.roundFams.add(theme.family);
  if (theme.kind === "music") state.music += 1;
  if (theme.kind === "picture") {
    state.picture += 1;
    if (theme.family) state.picFams.add(theme.family);
  }
}

/**
 * Автонабор: два раунда по шесть тем. Внутри раунда порядок колонок
 * перемешан — start_game перемешает его ещё раз.
 */
export function pickBoard(
  catalog: ThemeCandidate[],
  random: () => number = Math.random,
): PickBoardResult {
  const pool = catalog.filter((theme) => theme.available >= MIN_AUTO_QUESTIONS);
  if (pool.length < 12) return { ok: false, error: "bank_too_small" };

  const kids = pool.find((theme) => theme.name === KIDS_THEME) ?? null;
  const videoRound = rollRound(random);
  const kidsRound = kids ? rollRound(random) : null;
  const state: RoundState = {
    used: new Set<string>(),
    music: 0,
    picture: 0,
    kidsPending: kids !== null,
    picFams: new Set<string>(),
    roundFams: new Set<string>(),
  };
  const rounds: [string[], string[]] = [[], []];

  for (const round of [1, 2] as const) {
    const into: string[] = [];
    state.roundFams = new Set<string>();
    const slots: Array<"kids" | ThemeKind> = [
      round === kidsRound ? "kids" : "music",
      round === kidsRound ? "music" : "picture",
      "brain",
      round === videoRound ? "video" : "text",
      "text",
      "text",
    ];
    for (const slot of slots) {
      let picked: ThemeCandidate | null = null;
      if (slot === "kids" && kids) {
        // В SQL слот «Детский рисунок» всегда считается картинкой.
        picked = { ...kids, kind: "picture" };
        state.kidsPending = false;
      } else {
        const kinds = attemptKinds(slot === "kids" ? "picture" : slot);
        for (const strict of [true, false]) {
          for (const want of kinds) {
            const options = pool.filter(
              (theme) =>
                want.includes(theme.kind) && fits(theme, state, strict),
            );
            picked = chooseTheme(options, state, random);
            if (picked) break;
          }
          if (picked) break;
        }
      }
      if (!picked) return { ok: false, error: "bank_too_small" };
      takeTheme(picked, state, into);
    }
    rounds[round - 1] = shuffle(into, random);
  }

  return { ok: true, board: { rounds } };
}
