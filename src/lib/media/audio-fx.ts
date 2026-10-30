/**
 * «Звук наоборот»: как играть 30-секундное превью трека. Сам файл не
 * хранится и не перекодируется на сервере — всё делает браузер ведущего
 * (Web Audio) поверх ссылки iTunes, у которой открыт CORS.
 */
export const AUDIO_FX = ["reverse", "slow"] as const;

export type AudioFx = (typeof AUDIO_FX)[number];

export function isAudioFx(value: unknown): value is AudioFx {
  return (
    typeof value === "string" && (AUDIO_FX as readonly string[]).includes(value)
  );
}

/** Замедление: 0.6 — трек узнаваем с трудом, но ещё узнаваем. */
export const SLOW_RATE = 0.6;

export const AUDIO_FX_LABEL: Record<AudioFx, string> = {
  reverse: "задом наперёд",
  slow: "замедленно",
};

/** Границы фрагмента в сэмплах (end ≤ длины, хотя бы 1 сэмпл). */
export function segmentFrames(
  sampleRate: number,
  length: number,
  start: number,
  end: number | null | undefined,
): { from: number; to: number } {
  const from = Math.min(
    Math.max(0, Math.floor(start * sampleRate)),
    Math.max(0, length - 1),
  );
  const rawTo =
    end && end > start ? Math.floor(end * sampleRate) : Number.POSITIVE_INFINITY;
  const to = Math.max(from + 1, Math.min(length, rawTo));
  return { from, to };
}

/** Копия каналов [from, to), при reverse — задом наперёд. */
export function sliceChannel(
  data: Float32Array,
  from: number,
  to: number,
  reverse: boolean,
): Float32Array {
  const out = new Float32Array(to - from);
  if (reverse) {
    for (let i = 0; i < out.length; i += 1) out[i] = data[to - 1 - i]!;
  } else {
    out.set(data.subarray(from, to));
  }
  return out;
}

type BufferFactory = Pick<BaseAudioContext, "createBuffer">;

/** Фрагмент превью: перевёрнутый (или как есть для slow) и оригинал. */
export function reversedSegment(
  context: BufferFactory,
  decoded: AudioBuffer,
  start: number,
  end: number | null | undefined,
  fx: AudioFx,
): { twisted: AudioBuffer; plain: AudioBuffer } {
  const { from, to } = segmentFrames(
    decoded.sampleRate,
    decoded.length,
    start,
    end,
  );
  const make = (reverse: boolean) => {
    const buffer = context.createBuffer(
      decoded.numberOfChannels,
      to - from,
      decoded.sampleRate,
    );
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      buffer.copyToChannel(
        sliceChannel(decoded.getChannelData(channel), from, to, reverse) as Float32Array<ArrayBuffer>,
        channel,
      );
    }
    return buffer;
  };
  return { twisted: make(fx === "reverse"), plain: make(false) };
}
