import "server-only";

export function isLlmCheckEnabled(): boolean {
  const flag = process.env.ANSWER_CHECK_USE_LLM;
  return flag === "true" || flag === "1";
}

export async function judgeWithOpenRouter(
  given: string,
  expected: string,
  note?: string | null,
): Promise<boolean> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  if (!apiKey || !model) {
    throw new Error("OpenRouter не настроен");
  }

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              'Ты проверяешь ответ в викторине «Своя игра». Сравни ответ игрока с эталоном по смыслу. Опечатки и другой порядок слов допустимы. Лишние подробности не делают ответ неверным, если суть совпала. Ответь только JSON: {"correct": true} или {"correct": false}.' +
              (note ? `\n${note}` : ""),
          },
          {
            role: "user",
            content: `Эталон: ${expected}\nОтвет игрока: ${given}`,
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`OpenRouter ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = payload.choices?.[0]?.message?.content ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("OpenRouter вернул не JSON");
  }

  const parsed = JSON.parse(match[0]) as { correct?: unknown };
  if (typeof parsed.correct !== "boolean") {
    throw new Error("OpenRouter вернул неверный JSON");
  }

  return parsed.correct;
}
