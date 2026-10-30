/**
 * Служебная нумерация из генераторов банка («Детский рисунок № 17: что
 * нарисовал ребёнок?») игрокам не нужна: показываем и озвучиваем вопрос без
 * неё. В банке номер держит уникальность (category, prompt), поэтому
 * старые вопросы чистим на выводе; новые генераторы номер не пишут.
 */
const NUMBERED_PREFIX = /^[^\n:№]{1,60}?\s*№\s*\d+\s*[:.]\s*/u;

export function displayPrompt(prompt: string): string;
export function displayPrompt(prompt: string | null | undefined): string | null;
export function displayPrompt(prompt: string | null | undefined) {
  if (!prompt) return prompt ?? null;
  const rest = prompt.replace(NUMBERED_PREFIX, "");
  if (rest === prompt || !rest.trim()) return prompt;
  return rest.charAt(0).toLocaleUpperCase("ru") + rest.slice(1);
}
