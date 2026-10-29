import { connection } from "next/server";

// Серверное время для экрана ведущего: картинка раскрывается от
// questions.opened_at, а часы телевизора могут спешить или отставать.
export async function GET() {
  await connection();
  return Response.json(
    { now: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
