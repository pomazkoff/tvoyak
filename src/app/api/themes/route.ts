import { connection } from "next/server";
import { isCompanyId } from "@/lib/rooms/company";
import { loadThemeCatalog } from "@/lib/game/theme-catalog";
import {
  inspectBoard,
  pickBoard,
  themeCards,
  type ThemeCandidate,
} from "@/lib/game/themes";
import { getServiceSupabase } from "@/lib/supabase/admin";

/** Предложение автоподбора и список тем, которыми его можно заменить. */
export async function GET(request: Request) {
  await connection();
  const companyRaw = new URL(request.url).searchParams.get("companyId");
  const companyId = isCompanyId(companyRaw) ? companyRaw : null;

  try {
    const catalog = await loadThemeCatalog(getServiceSupabase(), companyId);
    return Response.json(proposalPayload(catalog));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("SUPABASE_URL")) {
      return Response.json({ error: "not_configured" }, { status: 500 });
    }
    return Response.json({ error: "themes_unavailable" }, { status: 502 });
  }
}

export function proposalPayload(catalog: ThemeCandidate[]) {
  const themes = themeCards(catalog);
  const picked = pickBoard(catalog);
  if (!picked.ok) {
    return { error: picked.error, themes, rounds: null, warnings: [] };
  }
  const names = picked.board.rounds.flat();
  return {
    themes,
    rounds: picked.board.rounds,
    warnings: inspectBoard(names, catalog).warnings,
  };
}
