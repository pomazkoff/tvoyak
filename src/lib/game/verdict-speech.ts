/**
 * Что бот-ведущий говорит вслух после ответа: «Верно!» / «Неверно.» по
 * изменению очков и правильный ответ при вскрытии. null — молчим.
 */
export function verdictLine({
  from,
  to,
  before,
  after,
  answer,
}: {
  from: string;
  to: string;
  before: Record<string, number>;
  after: Record<string, number>;
  answer: string | null;
}): string | null {
  if (to !== "buzzing" && to !== "reveal") return null;
  let head = "";
  if (from === "answering" || from === "judging") {
    const ids = Object.keys(after);
    if (ids.some((id) => after[id] > (before[id] ?? after[id])))
      head = "Верно!";
    else if (ids.some((id) => after[id] < (before[id] ?? after[id])))
      head = "Неверно.";
  } else if (from !== "buzzing") return null;
  const tail = to === "reveal" && answer ? `Правильный ответ: ${answer}.` : "";
  const line = [head, tail].filter(Boolean).join(" ");
  return line || null;
}
