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
