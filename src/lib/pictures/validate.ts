import { findAnswerLeaks } from "@/lib/game/bank-leaks";
import {
  commonsFileFromUrl,
  commonsImageUrl,
  commonsPageUrl,
  imageReachable,
  isFreeLicense,
  lookupCommons,
} from "./commons";
import { normalizeWord, rebusProblems, REBUS_EMOJI } from "./rebus";
import { emojisOf } from "./render";
import { looksLikeEmoji, twemojiUrl } from "./twemoji";
import {
  DEFAULT_REVEAL,
  GENERATED_FORMATS,
  isPictureFormat,
  type EmojiSpec,
  type FragmentSpec,
  type HiddenSpec,
  type PictureFormat,
  type RebusSpec,
} from "./types";
import { isAllowedImageSource } from "@/lib/media/image-proxy";

/** Картиночный черновик (поля как в question_bank). */
export type PictureDraft = {
  category: string;
  prompt: string;
  answer: string;
  variants: string[];
  kind: string;
  picture?: string | null;
  picture_spec?: unknown;
  reveal_seconds?: number | null;
  image_url?: string | null;
  image_credit?: string | null;
  image_license?: string | null;
  image_page?: string | null;
};

function emojiProblems(spec: EmojiSpec, answer: string): string[] {
  const lines = spec?.lines;
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 3) {
    return ["эмодзи: нужно 1–3 строки"];
  }
  const all = lines.flat();
  const problems: string[] = [];
  if (all.length < 2 || all.length > 9)
    problems.push("эмодзи: нужно 2–9 эмодзи");
  for (const item of all) {
    if (typeof item !== "string" || !looksLikeEmoji(item)) {
      problems.push(
        `эмодзи: «${String(item)}» — не эмодзи (буквы и слова нельзя)`,
      );
    }
  }
  if (lines.some((line) => !Array.isArray(line) || line.length > 6)) {
    problems.push("эмодзи: в строке не больше 6 эмодзи");
  }
  if (!normalizeWord(answer)) problems.push("эмодзи: пустой ответ");
  return problems;
}

function hiddenProblems(spec: HiddenSpec): string[] {
  const problems: string[] = [];
  if (!spec || !looksLikeEmoji(spec.base) || !looksLikeEmoji(spec.odd)) {
    return ["найди лишнее: base и odd должны быть эмодзи"];
  }
  if (spec.base === spec.odd)
    problems.push("найди лишнее: base и odd совпадают");
  const total = Number(spec.cols) * Number(spec.rows);
  if (
    !Number.isInteger(spec.cols) ||
    !Number.isInteger(spec.rows) ||
    total < 24 ||
    total > 96
  ) {
    problems.push("найди лишнее: сетка от 24 до 96 клеток");
  }
  if (!Number.isInteger(spec.seed)) problems.push("найди лишнее: нужен seed");
  return problems;
}

function photoProblems(draft: PictureDraft, format: PictureFormat): string[] {
  const problems: string[] = [];
  if (!isAllowedImageSource(draft.image_url)) {
    problems.push("картинка: только https с Wikimedia Commons");
  }
  if (!draft.image_license) problems.push("картинка: не указана лицензия");
  if (format === "fragment") {
    const spec = draft.picture_spec as FragmentSpec | null;
    if (!spec || (spec.mode !== "tiles" && spec.mode !== "zoom")) {
      problems.push("фрагмент: mode tiles или zoom");
    }
  }
  const reveal = draft.reveal_seconds ?? 0;
  if (format !== "logo" && (reveal < 8 || reveal > 30)) {
    problems.push("раскрытие: 8–30 секунд");
  }
  return problems;
}

/** Детерминированные правила формата (без сети). */
export function pictureProblems(draft: PictureDraft): string[] {
  if (!isPictureFormat(draft.picture)) return ["неизвестный формат картинки"];
  const format = draft.picture;
  const problems: string[] = [];
  if (draft.kind !== "image") problems.push("картинка: kind должен быть image");
  // Промпт не должен подсказывать: ни ответа, ни его частей.
  const leaks = findAnswerLeaks(draft.prompt, draft.answer, draft.variants);
  if (leaks.length)
    problems.push(`утечка ответа в вопросе: «${leaks[0].needle}»`);
  if (format === "rebus") {
    problems.push(...rebusProblems(draft.picture_spec, draft.answer));
    // Слова-картинки в тексте вопроса — это половина разгадки.
    for (const part of (draft.picture_spec as RebusSpec)?.parts ?? []) {
      if (
        part.t === "pic" &&
        normalizeWord(draft.prompt).includes(normalizeWord(part.word))
      ) {
        problems.push(`ребус: в вопросе названа картинка «${part.word}»`);
      }
    }
  } else if (format === "emoji") {
    problems.push(
      ...emojiProblems(draft.picture_spec as EmojiSpec, draft.answer),
    );
  } else if (format === "hidden") {
    problems.push(...hiddenProblems(draft.picture_spec as HiddenSpec));
  } else {
    problems.push(...photoProblems(draft, format));
  }
  if (GENERATED_FORMATS.includes(format) && draft.image_url) {
    problems.push("собранная картинка не должна ссылаться на файл");
  }
  return problems;
}

/**
 * Полная проверка с сетью: все эмодзи есть в Twemoji, файл Commons существует,
 * лицензия свободная, превью отдаёт 200. Возвращает черновик с подписью.
 */
export async function checkPictureDraft<T extends PictureDraft>(
  draft: T,
): Promise<{ problems: string[]; draft: T }> {
  // Лицензию и подпись для фото берём с Commons ниже.
  const problems = pictureProblems(draft).filter(
    (item) => !item.startsWith("картинка: не указана лицензия"),
  );
  if (!isPictureFormat(draft.picture)) return { problems, draft };
  const format = draft.picture;
  if (GENERATED_FORMATS.includes(format)) {
    const emojis = Array.from(new Set(emojisOf(format, draft.picture_spec)));
    const results = await Promise.all(
      emojis.map((emoji) => imageReachable(twemojiUrl(emoji))),
    );
    emojis.forEach((emoji, index) => {
      if (!results[index]) problems.push(`эмодзи ${emoji} нет в Twemoji`);
    });
    return {
      problems,
      draft: { ...draft, reveal_seconds: draft.reveal_seconds ?? 0 },
    };
  }
  const file = draft.image_url ? commonsFileFromUrl(draft.image_url) : null;
  if (!file)
    return { problems: [...problems, "картинка: не файл Commons"], draft };
  const info = await lookupCommons(file);
  if (!info)
    return { problems: [...problems, `файла ${file} нет на Commons`], draft };
  if (!isFreeLicense(info.license)) {
    problems.push(`лицензия «${info.license || "?"}» не свободная`);
  }
  const url = commonsImageUrl(info.file);
  if (!(await imageReachable(url)))
    problems.push("картинка не открывается (не 200)");
  const enriched = {
    ...draft,
    image_url: url,
    image_license: info.license,
    image_credit:
      draft.image_credit ??
      `${info.artist || "автор не указан"} · ${info.license} · Wikimedia Commons`,
    image_page: commonsPageUrl(info.file),
    reveal_seconds: draft.reveal_seconds ?? DEFAULT_REVEAL[format],
  };
  return { problems, draft: enriched };
}

export { REBUS_EMOJI };
