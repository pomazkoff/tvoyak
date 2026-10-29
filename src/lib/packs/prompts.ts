import { NO_LEAK_RULE } from "@/lib/packs/review";

export type ReviewPass =
  "safety" | "fact" | "freshness" | "difficulty" | "duplicates" | "leak";

export const GENERATION_SYSTEM = `Ты составитель «Своей игры» для компании в России. Пиши по-русски. Без политики, войны, выборов и тем 18+. Если человек — иноагент, добавь в формулировку пометку «(иноагент)». ${NO_LEAK_RULE} Перед ответом перечитай каждый вопрос и перепиши тот, что нарушает правило. Верни только JSON-массив.`;

export function generationUser(topics: string[]): string {
  return `Темы: ${topics.join("; ")}. Составь 8 коротких вопросов. Поля: category, prompt, answer, variants (массив строк — другие написания того же правильного ответа: латиница/кириллица, сокращение, полное имя; НЕ варианты для выбора и НЕ неправильные ответы), value (100–1000), kind ("text").`;
}

export function reviewSystem(
  pass: "fact" | "freshness" | "difficulty",
): string {
  // Каждый агент дополнительно проверяет утечку ответа: дешевле отсеять
  // вопрос на любом проходе, чем показать игрокам ответ в тексте.
  const leak = `Также проверь: ${NO_LEAK_RULE} Если правило нарушено — ok: false и в notes напиши «утечка: …». Если variants содержат неправильные ответы, а не написания правильного — ok: false.`;
  if (pass === "fact") {
    return `Проверь факт. ${leak} Верни JSON {"ok": true|false, "notes": "", "answer": "эталон если надо поправить"}.`;
  }
  if (pass === "freshness") {
    return `Вопрос должен быть понятен сейчас, не про вчерашнюю новость-однодневку и не про политику. ${leak} Верни JSON {"ok": true|false, "notes": ""}.`;
  }
  return `Оцени сложность для компании. value только 100, 200, 300, 400, 500, 600, 800 или 1000. Утечка ответа делает вопрос бесплатным — тогда ok: false. ${leak} Верни JSON {"ok": true|false, "value": 300, "notes": ""}. Если человек иноагент, добавь agent_mark.`;
}
