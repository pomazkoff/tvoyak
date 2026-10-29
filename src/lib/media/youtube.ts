// Параметры встраивания YouTube для экрана вопроса: без панели управления,
// подсказок, аннотаций и клавиатуры, чтобы ни название, ни рекомендации не
// выдали ответ. Плеер ставит youtube-nocookie.com, конец фрагмента
// дополнительно стережёт MediaPlayer.

export function youtubeEmbedVars({
  start,
  end,
  autoplay,
  origin,
}: {
  start: number | null | undefined;
  end: number | null | undefined;
  autoplay: boolean;
  origin?: string;
}): Record<string, number | string> {
  const vars: Record<string, number | string> = {
    autoplay: autoplay ? 1 : 0,
    controls: 0,
    rel: 0,
    modestbranding: 1,
    iv_load_policy: 3,
    disablekb: 1,
    playsinline: 1,
    fs: 0,
    cc_load_policy: 0,
    start: Math.max(0, Math.floor(start ?? 0)),
  };
  const from = vars.start as number;
  if (end && end > from) vars.end = Math.floor(end);
  if (origin) vars.origin = origin;
  return vars;
}

/**
 * Ссылка на плеер VK/Rutube: старт с нужной секунды и автозапуск (кликнуть
 * по ролику на ТВ нельзя — у iframe отключены указатели). Rutube умеет
 * останавливаться сам (stopTime), VK — нет, его гасит таймер в MediaPlayer.
 */
export function fallbackSrc(
  url: string,
  provider: "vk" | "rutube",
  start: number | null,
  end: number | null,
): string {
  const params: string[] = [];
  if (provider === "rutube") {
    if (start) params.push(`t=${start}`);
    if (end && end > (start ?? 0)) params.push(`stopTime=${end}`);
    params.push("autoplay=1");
  } else {
    if (start) params.push(`t=${start}s`);
    params.push("autoplay=1");
  }
  return `${url}${url.includes("?") ? "&" : "?"}${params.join("&")}`;
}
