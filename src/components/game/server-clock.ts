"use client";

/**
 * Смещение серверных часов (мс): картинки раскрываются от opened_at, медиа
 * удалённого игрока стартует от media_started_at — оба по серверному времени.
 */
let offsetPromise: Promise<number> | null = null;
let offsetValue: number | null = null;

export function serverOffset(): Promise<number> {
  if (!offsetPromise) {
    const started = Date.now();
    offsetPromise = fetch("/api/time", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ now?: number }>)
      .then((body) => {
        const finished = Date.now();
        if (typeof body.now !== "number") return 0;
        return body.now - (started + finished) / 2;
      })
      .catch(() => 0)
      .then((offset) => {
        offsetValue = offset;
        return offset;
      });
  }
  return offsetPromise;
}

/** Уже известное смещение (0, пока не измерено). */
export function currentServerOffset(): number {
  return offsetValue ?? 0;
}

/** Сколько секунд прошло на сервере с момента iso (не меньше 0). */
export function secondsSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, (Date.now() + currentServerOffset() - at) / 1000);
}
