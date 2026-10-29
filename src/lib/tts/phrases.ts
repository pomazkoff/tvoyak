import { createHash } from "node:crypto";

/** Голос бота-ведущего: Yandex SpeechKit, Марина, дружелюбно. */
export const TTS_VOICE = "marina";
export const TTS_ROLE = "friendly";
/** Длиннее не синтезируем вовсе (вопросы в банке — до ~130 знаков). */
export const TTS_MAX_CHARS = 500;
/** До стольких знаков Yandex v3 синтезирует без unsafeMode. */
export const TTS_SAFE_CHARS = 240;

export function normalizeTtsText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Ключ кэша: одна и та же фраза тем же голосом оплачивается один раз. */
export function ttsCacheKey(
  text: string,
  voice = TTS_VOICE,
  role = TTS_ROLE,
): string {
  const hash = createHash("sha256")
    .update(`${voice}\u0000${role}\u0000${normalizeTtsText(text)}`, "utf8")
    .digest("hex");
  return `${voice}-${role}/${hash}.mp3`;
}

const VERDICT_RE =
  /^(?:(Верно!|Неверно\.)(?: |$))?(?:Правильный ответ: (.+)\.)?$/u;

/**
 * Разбирает реплику вердикта из verdictLine: «Верно!», «Неверно.»,
 * «Правильный ответ: X.» и их сочетания. null — это не вердикт.
 */
export function parseVerdictPhrase(
  text: string,
): { head: string | null; answer: string | null } | null {
  const match = VERDICT_RE.exec(normalizeTtsText(text));
  if (!match || (!match[1] && !match[2])) return null;
  return { head: match[1] ?? null, answer: match[2] ?? null };
}

/**
 * Можно ли озвучить фразу в этой комнате: только тексты вопросов комнаты
 * и вердикты с уже вскрытыми ответами — синтезатор не превращается в
 * бесплатную озвучку чего угодно и не служит оракулом для ответов.
 */
export function isAllowedPhrase(
  text: string,
  allowed: { prompts: Iterable<string>; answers: Iterable<string> },
): boolean {
  const clean = normalizeTtsText(text);
  if (!clean || clean.length > TTS_MAX_CHARS) return false;
  for (const prompt of allowed.prompts) {
    if (normalizeTtsText(prompt) === clean) return true;
  }
  const verdict = parseVerdictPhrase(clean);
  if (!verdict) return false;
  if (verdict.answer === null) return true;
  for (const answer of allowed.answers) {
    if (normalizeTtsText(answer) === verdict.answer) return true;
  }
  return false;
}

/** Ответ Yandex v3 — один или несколько JSON подряд с кусками base64. */
export function parseYandexAudio(body: string): Buffer {
  const chunks: Buffer[] = [];
  const parts = body
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const part of parts) {
    const parsed = JSON.parse(part) as {
      result?: { audioChunk?: { data?: string } };
      error?: unknown;
    };
    if (parsed.error) throw new Error("yandex_error");
    const data = parsed.result?.audioChunk?.data;
    if (data) chunks.push(Buffer.from(data, "base64"));
  }
  const audio = Buffer.concat(chunks);
  if (!audio.length) throw new Error("yandex_empty");
  return audio;
}

/** Простое скользящее окно в памяти инстанса: best effort против спама. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private limit: number,
    private windowMs: number,
  ) {}
  take(key: string, now = Date.now()): boolean {
    const since = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits)
        if (!v.some((t) => t > since)) this.hits.delete(k);
    }
    return true;
  }
}
