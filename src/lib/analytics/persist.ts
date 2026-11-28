import type { SupabaseClient } from "@supabase/supabase-js";
import type { UtmRecord } from "./utm";

const MISSING_COLUMN = new Set(["42703", "PGRST204"]);

function missingColumn(error: { code?: string; message?: string }): boolean {
  if (error.code && MISSING_COLUMN.has(error.code)) return true;
  const message = error.message ?? "";
  return (
    message.includes("utm") &&
    (message.includes("column") || message.includes("schema cache"))
  );
}

/**
 * Записать канал в rooms.utm или host_payments.utm.
 * Пока миграция не применена, колонки нет — это не ошибка запроса.
 */
export async function saveUtm(
  supabase: SupabaseClient,
  table: "rooms" | "host_payments",
  id: string,
  utm: UtmRecord | null | undefined,
): Promise<void> {
  if (!utm || !id) return;
  try {
    const { error } = await supabase.from(table).update({ utm }).eq("id", id);
    if (!error || missingColumn(error)) return;
    console.error("utm_save", table, error.code ?? "unknown");
  } catch {
    // Колонки может не быть, а сеть — моргнуть. Комната и платёж важнее метки.
    console.error("utm_save", table, "threw");
  }
}
