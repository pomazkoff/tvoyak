import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ok = (correct: boolean) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ correct }) } }],
    }),
    { status: 200 },
  );

describe("judgeWithOpenRouter", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "old-key";
    process.env.OPENROUTER_API_KEY_FALLBACK = "new-key";
    process.env.OPENROUTER_MODEL = "google/gemini-2.5-flash";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  it("основной ключ отозван (401) — берёт запасной", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(ok(true));
    const { judgeWithOpenRouter } = await import("@/lib/answers/llm");
    await expect(
      judgeWithOpenRouter({
        given: "Stranger things",
        expected: "Очень странные дела",
      }),
    ).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const auth = (call: number) =>
      (fetchMock.mock.calls[call]?.[1]?.headers as Record<string, string>)
        .Authorization;
    expect(auth(0)).toBe("Bearer old-key");
    expect(auth(1)).toBe("Bearer new-key");
  });

  it("сбой 5xx — повторяет с тем же ключом", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 502 }))
      .mockResolvedValueOnce(ok(false));
    const { judgeWithOpenRouter } = await import("@/lib/answers/llm");
    await expect(
      judgeWithOpenRouter({ given: "Евро", expected: "Лига чемпионов" }),
    ).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("все ключи отказали — бросает ошибку (вызывающий оставит локальный вердикт)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 401 }),
    );
    const { judgeWithOpenRouter } = await import("@/lib/answers/llm");
    await expect(
      judgeWithOpenRouter({ given: "a", expected: "b" }),
    ).rejects.toThrow("401");
  });
});
