import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TTS_ROLE,
  TTS_SAFE_CHARS,
  TTS_VOICE,
  normalizeTtsText,
  parseYandexAudio,
  ttsCacheKey,
} from "@/lib/tts/phrases";

const YANDEX_URL = "https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis";
export const TTS_BUCKET = "tts";

export function isTtsConfigured(): boolean {
  return Boolean(process.env.YANDEX_SPEECHKIT_API_KEY);
}

export async function synthesizeYandex(text: string): Promise<Buffer> {
  const key = process.env.YANDEX_SPEECHKIT_API_KEY;
  if (!key) throw new Error("tts_not_configured");
  const clean = normalizeTtsText(text);
  const response = await fetch(YANDEX_URL, {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: clean,
      hints: [{ voice: TTS_VOICE }, { role: TTS_ROLE }],
      outputAudioSpec: { containerAudio: { containerAudioType: "MP3" } },
      // Без него v3 режет фразы длиннее ~250 знаков.
      ...(clean.length > TTS_SAFE_CHARS ? { unsafeMode: true } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    console.error("tts_yandex", response.status);
    throw new Error("tts_upstream");
  }
  return parseYandexAudio(await response.text());
}

async function readCached(
  supabase: SupabaseClient,
  key: string,
): Promise<Buffer | null> {
  const { data, error } = await supabase.storage.from(TTS_BUCKET).download(key);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

async function writeCache(
  supabase: SupabaseClient,
  key: string,
  audio: Buffer,
): Promise<void> {
  const upload = () =>
    supabase.storage.from(TTS_BUCKET).upload(key, audio, {
      contentType: "audio/mpeg",
      cacheControl: "31536000",
      upsert: true,
    });
  let { error } = await upload();
  if (error && /bucket not found/i.test(error.message)) {
    await supabase.storage.createBucket(TTS_BUCKET, {
      public: false,
      fileSizeLimit: 2 * 1024 * 1024,
      allowedMimeTypes: ["audio/mpeg"],
    });
    ({ error } = await upload());
  }
  if (error) console.error("tts_cache_write", error.message);
}

// Один синтез на фразу внутри инстанса, даже если TV и прогрев
// попросили её одновременно.
const inflight = new Map<string, Promise<Buffer>>();

/** Кэшированный mp3 фразы или null — можно запускать параллельно с проверками. */
export function readCachedSpeech(
  supabase: SupabaseClient,
  text: string,
): Promise<Buffer | null> {
  return readCached(supabase, ttsCacheKey(text)).catch(() => null);
}

export async function getSpeech(
  supabase: SupabaseClient,
  text: string,
  cachedAlready?: Buffer | null,
): Promise<{ audio: Buffer; cache: "hit" | "miss" }> {
  const key = ttsCacheKey(text);
  const cached =
    cachedAlready === undefined
      ? await readCached(supabase, key)
      : cachedAlready;
  if (cached) return { audio: cached, cache: "hit" };
  let job = inflight.get(key);
  if (!job) {
    job = (async () => {
      const audio = await synthesizeYandex(text);
      await writeCache(supabase, key, audio);
      return audio;
    })().finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return { audio: await job, cache: "miss" };
}

/** Прогрев: синтезирует то, чего ещё нет в кэше. Возвращает число синтезов. */
export async function prewarmSpeech(
  supabase: SupabaseClient,
  texts: string[],
  concurrency = 3,
): Promise<number> {
  const unique = [...new Set(texts.map(normalizeTtsText).filter(Boolean))];
  if (!unique.length) return 0;
  const keys = unique.map((text) => ttsCacheKey(text));
  // Список уже лежащих файлов одним запросом на папку.
  const folder = keys[0].split("/")[0];
  const { data: listed } = await supabase.storage
    .from(TTS_BUCKET)
    .list(folder, { limit: 10000 });
  const have = new Set((listed ?? []).map((item) => `${folder}/${item.name}`));
  const todo = unique.filter((_, i) => !have.has(keys[i]));
  let made = 0;
  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const text = todo[next++];
      try {
        const result = await getSpeech(supabase, text);
        if (result.cache === "miss") made += 1;
      } catch {
        // Прогрев — не критичен: TV всё равно спросит фразу сам.
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return made;
}
