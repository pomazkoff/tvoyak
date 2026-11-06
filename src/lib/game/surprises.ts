// «Сюрпризы»: справочник эффектов и чистая логика, общая для экранов и
// тестов. Правда — на сервере (finish_surprise / apply_outcome в Postgres);
// здесь — подписи, озвучка, проверка формата ответа на телефоне и
// эталонные расчёты, которыми тесты сверяют серверное поведение.

export const SURPRISE_EFFECTS = [
  "double",
  "shield",
  "letter_a",
  "hint",
  "pick_next",
  "steal",
  "swap_left",
  "caps",
  "one_word",
  "shortest_nick",
  "freeze",
  "half_timer",
  "rotate",
  "robin_hood",
  "triple",
  "scramble",
] as const;

export type SurpriseEffect = (typeof SURPRISE_EFFECTS)[number];
export type SurpriseKind = "buff" | "debuff" | "chaos";

export type SurpriseMeta = {
  kind: SurpriseKind;
  icon: string;
  /** Название на рулетке и в бейдже. */
  title: string;
  /** Короткая подпись бейджа. */
  badge: string;
  /** Что происходит — на экране после рулетки. */
  text: string;
  /** Что говорит бот-ведущий (без имён: фраза кэшируется на всех). */
  speech: string;
};

export const SURPRISE_META: Record<SurpriseEffect, SurpriseMeta> = {
  double: {
    kind: "buff",
    icon: "×2",
    title: "Двойные очки",
    badge: "×2",
    text: "Следующий верный ответ открывшего стоит вдвое.",
    speech: "Сюрприз! Двойные очки: следующий верный ответ стоит вдвое.",
  },
  shield: {
    kind: "buff",
    icon: "🛡",
    title: "Щит",
    badge: "щит",
    text: "Следующий неверный ответ открывшего — без минуса.",
    speech: "Сюрприз! Щит: следующая ошибка без минуса.",
  },
  letter_a: {
    kind: "buff",
    icon: "А",
    title: "Буква «А»",
    badge: "+1000",
    text: "Плюс 1000, если в имени есть буква «а». Иначе — ничего.",
    speech: "Сюрприз! Плюс тысяча, если в имени есть буква А.",
  },
  hint: {
    kind: "buff",
    icon: "💡",
    title: "Подсказка",
    badge: "подсказка",
    text: "Открывшему на телефоне — первая буква ответа на этот вопрос.",
    speech: "Сюрприз! Подсказка: первая буква ответа — на телефоне.",
  },
  pick_next: {
    kind: "buff",
    icon: "👉",
    title: "Выбор хода",
    badge: "выбирает клетку",
    text: "Открывший назначает, кто выберет следующую клетку.",
    speech: "Сюрприз! Выбор хода: назначьте, кто выберет следующую клетку.",
  },
  steal: {
    kind: "buff",
    icon: "💰",
    title: "Кража",
    badge: "+500",
    text: "Минус 500 у лидера, плюс 500 открывшему. Сам лидер — крадёт у второго.",
    speech: "Сюрприз! Кража: пятьсот очков у лидера.",
  },
  swap_left: {
    kind: "debuff",
    icon: "⇄",
    title: "Обмен",
    badge: "обмен",
    text: "Открывший меняется счётом с соседом слева.",
    speech: "Сюрприз! Обмен: меняемся счётом с соседом слева.",
  },
  caps: {
    kind: "debuff",
    icon: "АА",
    title: "Только КАПСОМ",
    badge: "КАПС",
    text: "Следующий ответ открывшего — только заглавными. Иначе — неверно.",
    speech: "Сюрприз! Следующий ответ — только заглавными буквами.",
  },
  one_word: {
    kind: "debuff",
    icon: "1",
    title: "Одно слово",
    badge: "1 слово",
    text: "Следующий ответ открывшего — одним словом. Иначе — неверно.",
    speech: "Сюрприз! Следующий ответ — только одним словом.",
  },
  shortest_nick: {
    kind: "debuff",
    icon: "✂",
    title: "Короткое имя",
    badge: "−500",
    text: "Минус 500 игроку с самым коротким именем (при ничьей — всем).",
    speech: "Сюрприз! Минус пятьсот самому короткому имени.",
  },
  freeze: {
    kind: "debuff",
    icon: "❄",
    title: "Заморозка",
    badge: "заморожен",
    text: "Открывший пропускает этот вопрос: кнопка не нажимается.",
    speech: "Сюрприз! Заморозка: этот вопрос без вас.",
  },
  half_timer: {
    kind: "debuff",
    icon: "⏱",
    title: "Полтаймера",
    badge: "½ таймер",
    text: "На этом вопросе время на ответ вдвое меньше.",
    speech: "Сюрприз! Время на ответ — вдвое меньше.",
  },
  rotate: {
    kind: "chaos",
    icon: "↻",
    title: "Карусель",
    badge: "карусель",
    text: "Все счета сдвигаются по кругу: каждый получает счёт соседа слева.",
    speech: "Хаос! Карусель: все счета сдвигаются по кругу.",
  },
  robin_hood: {
    kind: "chaos",
    icon: "🏹",
    title: "Робин Гуд",
    badge: "+1500",
    text: "Последнему месту — плюс 1500.",
    speech: "Хаос! Робин Гуд: последнему месту плюс полторы тысячи.",
  },
  triple: {
    kind: "chaos",
    icon: "×3",
    title: "Тройная ставка",
    badge: "×3",
    text: "Этот вопрос стоит втрое — и минус тоже втрое.",
    speech: "Хаос! Этот вопрос стоит втрое. И минус тоже.",
  },
  scramble: {
    kind: "chaos",
    icon: "🔀",
    title: "Перемешка",
    badge: "перемешка",
    text: "На телефонах слова вопроса перемешаны. На экране — как обычно.",
    speech: "Хаос! На телефонах слова вопроса перемешаны.",
  },
};

export const SURPRISE_KIND_LABEL: Record<SurpriseKind, string> = {
  buff: "бафф",
  debuff: "дебафф",
  chaos: "хаос",
};

export function isSurpriseEffect(value: unknown): value is SurpriseEffect {
  return (
    typeof value === "string" &&
    (SURPRISE_EFFECTS as readonly string[]).includes(value)
  );
}

/** Все фразы бота про сюрпризы — для /api/tts и прогрева. */
export const SURPRISE_SPEECH: readonly string[] = SURPRISE_EFFECTS.map(
  (effect) => SURPRISE_META[effect].speech,
);

/** Сколько длится рулетка (сервер даёт 11 с на фазу surprise). */
export const ROULETTE_SPIN_MS = 4200;

// ---------------------------------------------------------------------------
// Формат ответа
// ---------------------------------------------------------------------------

export type AnswerFormat = "caps" | "one_word";

export function isAnswerFormat(value: unknown): value is AnswerFormat {
  return value === "caps" || value === "one_word";
}

/** Совпадает с public.answer_format_ok на сервере. */
export function answerFormatOk(format: AnswerFormat, text: string): boolean {
  if (format === "caps") return text === text.toUpperCase();
  const trimmed = text.trim();
  return trimmed !== "" && !/\s/.test(trimmed);
}

export function formatRule(format: AnswerFormat): string {
  return format === "caps"
    ? "Только ЗАГЛАВНЫМИ буквами — иначе ответ неверный."
    : "Только одним словом — иначе ответ неверный.";
}

// ---------------------------------------------------------------------------
// Перемешка
// ---------------------------------------------------------------------------

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Перемешанный порядок слов (одинаковый на всех телефонах: зерно — id
 * вопроса). Если слов больше одного, результат всегда отличается от
 * исходного порядка.
 */
export function scrambleWords(text: string, seed: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return words.join(" ");
  const random = mulberry32(hashSeed(seed));
  const order = words.slice();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [order[index], order[swap]] = [order[swap], order[index]];
    }
    if (order.some((word, index) => word !== words[index])) break;
  }
  if (order.every((word, index) => word === words[index])) {
    order.push(order.shift() as string);
  }
  return order.join(" ");
}

// ---------------------------------------------------------------------------
// Эталонные расчёты (сервер делает то же самое в SQL)
// ---------------------------------------------------------------------------

export type ScorePlayer = {
  id: string;
  nickname: string;
  score: number;
};

/** Есть ли в имени «а» (кириллица или латиница, любой регистр). */
export function hasLetterA(nickname: string): boolean {
  return /[аa]/i.test(nickname.toLowerCase());
}

/** Сосед слева в порядке табло (по кругу). */
export function leftNeighbour<T extends { id: string }>(
  players: readonly T[],
  id: string,
): T | null {
  const index = players.findIndex((player) => player.id === id);
  if (index < 0 || players.length < 2) return null;
  return players[(index - 1 + players.length) % players.length];
}

/** У кого крадут: лидер, а если лидер — сам открывший, то второй. */
export function stealVictim<T extends ScorePlayer>(
  players: readonly T[],
  openerId: string,
): T | null {
  const others = players.filter((player) => player.id !== openerId);
  if (!others.length) return null;
  // Порядок players — как на табло; при равенстве — кто раньше вошёл.
  return others.reduce((best, player) =>
    player.score > best.score ? player : best,
  );
}

export function shortestNicks<T extends ScorePlayer>(
  players: readonly T[],
): T[] {
  if (!players.length) return [];
  const min = Math.min(
    ...players.map((player) => player.nickname.trim().length),
  );
  return players.filter((player) => player.nickname.trim().length === min);
}

export function lastPlace<T extends ScorePlayer>(players: readonly T[]): T[] {
  if (!players.length) return [];
  const min = Math.min(...players.map((player) => player.score));
  return players.filter((player) => player.score === min);
}

/** Мгновенные эффекты: новые очки игроков (порядок — как на табло). */
export function applyInstantEffect(
  effect: SurpriseEffect,
  players: readonly ScorePlayer[],
  openerId: string,
): Record<string, number> {
  const next: Record<string, number> = Object.fromEntries(
    players.map((player) => [player.id, player.score]),
  );
  const opener = players.find((player) => player.id === openerId);
  switch (effect) {
    case "letter_a":
      if (opener && hasLetterA(opener.nickname)) next[opener.id] += 1000;
      break;
    case "steal": {
      const victim = opener ? stealVictim(players, opener.id) : null;
      if (opener && victim) {
        next[victim.id] -= 500;
        next[opener.id] += 500;
      }
      break;
    }
    case "swap_left": {
      const left = opener ? leftNeighbour(players, opener.id) : null;
      if (opener && left) {
        next[opener.id] = left.score;
        next[left.id] = opener.score;
      }
      break;
    }
    case "shortest_nick":
      for (const player of shortestNicks(players)) next[player.id] -= 500;
      break;
    case "rotate":
      if (players.length >= 2) {
        players.forEach((player, index) => {
          next[player.id] =
            players[(index - 1 + players.length) % players.length].score;
        });
      }
      break;
    case "robin_hood":
      for (const player of lastPlace(players)) next[player.id] += 1500;
      break;
    default:
      break;
  }
  return next;
}

/** Сколько очков даёт ответ с учётом ×3 (вопрос), ×2 и щита (игрок). */
export function answerDelta({
  value,
  correct,
  triple,
  double,
  shield,
}: {
  value: number;
  correct: boolean;
  triple?: boolean;
  double?: boolean;
  shield?: boolean;
}): { delta: number; usedDouble: boolean; usedShield: boolean } {
  let delta = (correct ? value : -value) * (triple ? 3 : 1);
  let usedDouble = false;
  let usedShield = false;
  if (correct && double) {
    delta *= 2;
    usedDouble = true;
  } else if (!correct && delta < 0 && shield) {
    delta = 0;
    usedShield = true;
  }
  return { delta, usedDouble, usedShield };
}

// ---------------------------------------------------------------------------
// Строки базы для экранов
// ---------------------------------------------------------------------------

export type SurpriseChange = {
  player_id: string;
  nickname: string;
  delta: number;
  score: number;
  note?: string | null;
};

export type SurpriseRow = {
  id: string;
  question_id: string;
  round: number;
  opener_player_id: string | null;
  effect: string;
  status: "rolling" | "choosing" | "done";
  outcome: {
    changes?: SurpriseChange[];
    target_id?: string | null;
    target_name?: string | null;
    nothing?: boolean;
    timeout?: boolean;
  } | null;
  created_at: string;
};

export type EffectRow = {
  id: string;
  player_id: string | null;
  effect: string;
  question_id: string | null;
  status: "active" | "used" | "expired";
};

/** Действующие бейджи: эффекты вопроса — только пока идёт этот вопрос. */
export function activeEffects(
  effects: readonly EffectRow[],
  currentQuestionId: string | null,
): EffectRow[] {
  return effects.filter((row) => {
    if (row.status !== "active" || !isSurpriseEffect(row.effect)) return false;
    if (row.effect === "pick_next") return true;
    if (QUESTION_SCOPED.has(row.effect)) {
      return row.question_id !== null && row.question_id === currentQuestionId;
    }
    return true;
  });
}

const QUESTION_SCOPED = new Set<string>([
  "hint",
  "freeze",
  "half_timer",
  "triple",
  "scramble",
]);

export function playerEffects(
  effects: readonly EffectRow[],
  playerId: string,
  currentQuestionId: string | null,
): SurpriseEffect[] {
  return activeEffects(effects, currentQuestionId)
    .filter((row) => row.player_id === playerId)
    .map((row) => row.effect as SurpriseEffect);
}

export function globalEffects(
  effects: readonly EffectRow[],
  currentQuestionId: string | null,
): SurpriseEffect[] {
  return activeEffects(effects, currentQuestionId)
    .filter((row) => row.player_id === null)
    .map((row) => row.effect as SurpriseEffect);
}

export function hasEffect(
  effects: readonly EffectRow[],
  effect: SurpriseEffect,
  playerId: string | null,
  currentQuestionId: string | null,
): boolean {
  return activeEffects(effects, currentQuestionId).some(
    (row) => row.effect === effect && row.player_id === playerId,
  );
}

/** Подпись итога под рулеткой: кто что получил. */
export function outcomeLines(
  row: Pick<SurpriseRow, "effect" | "outcome" | "status">,
  openerName: string | null,
): string[] {
  const outcome = row.outcome ?? {};
  const lines: string[] = [];
  for (const change of outcome.changes ?? []) {
    const sign = change.delta > 0 ? "+" : "";
    lines.push(`${change.nickname}: ${sign}${change.delta} → ${change.score}`);
  }
  if (row.effect === "pick_next" && outcome.target_name) {
    lines.push(`Следующую клетку выберет ${outcome.target_name}`);
  }
  if (row.effect === "letter_a" && outcome.nothing) {
    lines.push(`В имени ${openerName ?? "игрока"} нет «а» — ничего.`);
  }
  if (
    row.status === "done" &&
    !lines.length &&
    (row.effect === "swap_left" || row.effect === "rotate")
  ) {
    lines.push("Счета совпали — ничего не поменялось.");
  }
  return lines;
}
