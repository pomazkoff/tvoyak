import "server-only";

export class OpenRouterMissingError extends Error {
  constructor() {
    super("openrouter_missing");
    this.name = "OpenRouterMissingError";
  }
}

export function hasOpenRouter(): boolean {
  return Boolean(
    process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_MODEL,
  );
}

export async function completeOpenRouter(
  system: string,
  user: string,
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  if (!apiKey || !model) throw new OpenRouterMissingError();

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      signal: AbortSignal.timeout(25_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    },
  );
  if (!response.ok) throw new Error(`openrouter_${response.status}`);
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return payload.choices?.[0]?.message?.content ?? "";
}

export function parseJson<T>(text: string): T {
  const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (!match) throw new Error("openrouter_json");
  return JSON.parse(match[0]) as T;
}
