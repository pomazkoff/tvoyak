import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  summarizeThemes,
  type BankQuestionRow,
  type CategoryMetaRow,
  type ThemeCandidate,
} from "@/lib/game/themes";

const PAGE = 1000;
const MAX_PAGES = 40;

type PageResult<T> = {
  data: T[] | null;
  error: { code?: string } | null;
};

/**
 * Темы из банка. Отдельной «премиум-темы» в схеме нет: доступность — это
 * одобренные вопросы (картинки с enabled) и число вопросов на тему.
 * Пейвол по-прежнему решает, можно ли создать комнату, а не какие темы видны.
 */
export async function loadThemeCatalog(
  supabase: SupabaseClient,
  companyId: string | null,
): Promise<ThemeCandidate[]> {
  const [rows, meta, seenIds] = await Promise.all([
    fetchBank(supabase),
    fetchMeta(supabase),
    companyId
      ? fetchSeen(supabase, companyId)
      : Promise.resolve(new Set<string>()),
  ]);
  return summarizeThemes(rows, meta, seenIds);
}

async function fetchBank(supabase: SupabaseClient): Promise<BankQuestionRow[]> {
  return fetchPages(async (from, to) => {
    const { data, error } = await supabase
      .from("question_bank")
      .select("id, category, picture, enabled")
      .order("id", { ascending: true })
      .range(from, to);
    return {
      data: (data ?? null) as BankQuestionRow[] | null,
      error,
    };
  });
}

async function fetchMeta(supabase: SupabaseClient): Promise<CategoryMetaRow[]> {
  return fetchPages(async (from, to) => {
    const { data, error } = await supabase
      .from("category_meta")
      .select("category, kind, family")
      .order("category", { ascending: true })
      .range(from, to);
    return {
      data: (data ?? null) as CategoryMetaRow[] | null,
      error,
    };
  });
}

async function fetchSeen(
  supabase: SupabaseClient,
  companyId: string,
): Promise<Set<string>> {
  const rows = await fetchPages(async (from, to) => {
    const { data, error } = await supabase
      .from("company_seen")
      .select("bank_id")
      .eq("company_id", companyId)
      .order("bank_id", { ascending: true })
      .range(from, to);
    return {
      data: (data ?? null) as { bank_id: string }[] | null,
      error,
    };
  });
  return new Set(rows.map((row) => row.bank_id));
}

async function fetchPages<T>(
  load: (from: number, to: number) => Promise<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE;
    const { data, error } = await load(from, from + PAGE - 1);
    if (error) {
      console.error("theme_catalog", error.code ?? "query");
      throw new Error("theme_catalog");
    }
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE) return rows;
  }
  console.error("theme_catalog", "too_many_rows");
  throw new Error("theme_catalog");
}
