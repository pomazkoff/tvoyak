import { findAnswerLeaks } from "@/lib/game/bank-leaks";

const VALUE_STEPS = [100, 200, 300, 400, 500, 600, 800, 1000] as const;

const BLOCKED = [
  "порно",
  "эротик",
  "секс",
  "18+",
  "голосован",
  "выбор",
  "президент",
  "госдум",
  "партий",
  "оппозиц",
  "митинг",
  "санкц",
];

export type DraftQuestion = {
  category: string;
  prompt: string;
  answer: string;
  variants: string[];
  value: number;
  kind: "text" | "image" | "video" | "music";
  curtain: boolean;
  /** Медиа: ролик YouTube (проверен oEmbed), картинка Commons, превью iTunes. */
  youtube_id?: string | null;
  image_url?: string | null;
  audio_url?: string | null;
  start_seconds?: number | null;
  end_seconds?: number | null;
  media_note?: string | null;
};

export function calibrateValue(raw: number): number {
  const target = Number.isFinite(raw) ? raw : 100;
  return VALUE_STEPS.reduce((best, step) =>
    Math.abs(step - target) < Math.abs(best - target) ? step : best,
  );
}

export function safetyFlags(text: string): string[] {
  const haystack = text.toLocaleLowerCase("ru-RU");
  return BLOCKED.filter((word) => haystack.includes(word));
}

export function duplicateIndexes(
  prompts: string[],
  existing: string[] = [],
): number[] {
  const seen = new Set(existing.map(normalize));
  const indexes: number[] = [];
  prompts.forEach((prompt, index) => {
    const key = normalize(prompt);
    if (!key || seen.has(key)) indexes.push(index);
    else seen.add(key);
  });
  return indexes;
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Общий текст правила — им пользуются и генерация, и все LLM-проверки. */
export const NO_LEAK_RULE =
  "Правило «без утечки ответа»: в тексте вопроса и в названии темы не должно быть ни ответа, ни его допустимых вариантов, ни их частей (имени или фамилии, слова из названия), ни транслита (Kuplinov ↔ Куплинов, Shazam ↔ Шазам), ни прозрачной подсказки вроде «созвучно слову clap», «назовите латиницей» или описания, которое и есть ответ («музыкальный сервис Apple» → Apple Music). В вопросах про звучащую песню или клип не называй сам трек — его узнают по звуку и картинке.";

export type LeakCheck = {
  /** Ответ целиком (в т. ч. транслитом/вариантом) — вопрос не пускаем. */
  blocking: boolean;
  /** Что именно совпало, для pack_reviews.notes. */
  notes: string;
};

/** Детерминированная проверка «без утечки ответа» для черновика пачки. */
export function leakCheck(
  draft: Pick<DraftQuestion, "category" | "prompt" | "answer" | "variants">,
): LeakCheck {
  const hits = [
    ...findAnswerLeaks(draft.prompt, draft.answer, draft.variants).map(
      (leak) => ({ ...leak, field: "вопрос" }),
    ),
    ...findAnswerLeaks(draft.category, draft.answer, draft.variants).map(
      (leak) => ({ ...leak, field: "тема" }),
    ),
  ];
  return {
    blocking: hits.some((hit) => hit.level === "full"),
    notes: hits
      .map(
        (hit) =>
          `${hit.field}: ${hit.level === "full" ? "ответ" : "часть ответа"} «${hit.needle}»${hit.via === "translit" ? " (транслит)" : ""}`,
      )
      .join("; "),
  };
}
