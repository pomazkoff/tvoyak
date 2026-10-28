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
