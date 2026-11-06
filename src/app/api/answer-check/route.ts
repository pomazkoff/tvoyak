import { checkAnswerLocally, needsLlm } from "@/lib/answers/check";
import { isLlmCheckEnabled, judgeWithOpenRouter } from "@/lib/answers/llm";

const MAX_LENGTH = 300;

function roundSimilarity(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const given = (body as { given?: unknown }).given;
  const expected = (body as { expected?: unknown }).expected;
  if (typeof given !== "string" || typeof expected !== "string") {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  if (given.length > MAX_LENGTH || expected.length > MAX_LENGTH) {
    return Response.json({ error: "too_long" }, { status: 400 });
  }

  const local = checkAnswerLocally(given, expected);
  if (needsLlm(local) && isLlmCheckEnabled()) {
    try {
      const correct = await judgeWithOpenRouter({ given, expected });
      return Response.json({
        correct,
        method: "llm",
        similarity: roundSimilarity(local.similarity),
        llmUsed: true,
        scoreEffect: correct ? "add" : "subtract",
      });
    } catch (error) {
      console.error(
        "answer_check_llm",
        error instanceof Error ? error.name : "error",
      );
      return Response.json({
        correct: false,
        method: "fuzzy",
        similarity: roundSimilarity(local.similarity),
        llmUsed: false,
        llmError: "unavailable",
        scoreEffect: "subtract",
      });
    }
  }

  return Response.json({
    correct: local.correct,
    method: local.method,
    similarity: roundSimilarity(local.similarity),
    llmUsed: false,
    scoreEffect: local.scoreEffect,
  });
}
