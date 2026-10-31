import "server-only";
import {
  judgeMessages,
  parseJudgeReply,
  type JudgeInput,
} from "@/lib/answers/judge-prompt";

export function isLlmCheckEnabled(): boolean {
  const flag = process.env.ANSWER_CHECK_USE_LLM;
  return flag === "true" || flag === "1";
}

const DEFAULT_MODEL = "google/gemini-2.5-flash";

/**
 * Ключи по порядку: основной и запасной. Если основной отозван (401/403),
 * пробуем запасной, чтобы судейство не падало в строгое сравнение.
 */
function apiKeys(): string[] {
  return [
    process.env.OPENROUTER_API_KEY,
    process.env.OPENROUTER_API_KEY_FALLBACK,
  ].filter((key, index, all): key is string =>
    Boolean(key && all.indexOf(key) === index),
  );
}

class JudgeHttpError extends Error {
  constructor(readonly status: number) {
    super(`OpenRouter ${status}`);
  }
}

async function callOnce(
  apiKey: string,
  model: string,
  input: JudgeInput,
  timeoutMs: number,
): Promise<boolean> {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Tvoyak answer judge",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 200,
        // Gemini 2.5 Flash по умолчанию «думает» — для да/нет это лишние
        // секунды; просим ответить сразу.
        reasoning: { effort: "low", exclude: true },
        messages: judgeMessages(input),
      }),
    },
  );
  if (!response.ok) throw new JudgeHttpError(response.status);
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return parseJudgeReply(payload.choices?.[0]?.message?.content ?? "");
}

/**
 * Судья по смыслу: переводы, транслит, другие названия засчитывает, другой
 * объект и слишком общий ответ — нет. Две попытки на ключ (сбой сети, 429,
 * 5xx), затем запасной ключ. Если ничего не вышло — бросает ошибку, и
 * вызывающий оставляет локальный вердикт.
 */
export async function judgeWithOpenRouter(input: JudgeInput): Promise<boolean> {
  const keys = apiKeys();
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  if (!keys.length) throw new Error("OpenRouter не настроен");

  let lastError: unknown = null;
  for (const key of keys) {
    for (const timeoutMs of [8_000, 6_000]) {
      try {
        return await callOnce(key, model, input, timeoutMs);
      } catch (error) {
        lastError = error;
        if (error instanceof JudgeHttpError) {
          // Ключ не принят — повторять с ним бессмысленно, берём следующий.
          if (
            error.status === 401 ||
            error.status === 402 ||
            error.status === 403
          ) {
            console.error("answer_judge_key_rejected", error.status);
            break;
          }
          if (error.status < 500 && error.status !== 429) break;
        }
      }
    }
  }
  console.error(
    "answer_judge_failed",
    lastError instanceof Error ? lastError.message : "error",
  );
  throw lastError instanceof Error ? lastError : new Error("judge_failed");
}
