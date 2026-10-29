import { NO_LEAK_RULE } from "@/lib/packs/review";
import { REBUS_EMOJI, REBUS_NUMBERS } from "./rebus";
import { DEFAULT_REVEAL, PICTURE_CATEGORY, type PictureFormat } from "./types";

const AUDIENCE =
  "Аудитория — компания друзей в России, задания на русском, мейнстрим; без политики, войны, религии, алкоголя и 18+.";

const PROMPT_RULE = `Поле prompt — короткая подводка для ведущего (её читают вслух и видят все): формат и, если надо, широкий класс ответа («Ребус. Слово из 6 букв», «Эмодзи-шифр: советский мультфильм»). ${NO_LEAK_RULE} Никаких определений, синонимов или первых букв ответа в prompt. Каждый prompt в теме уникален.`;

const FORMAT_RULES: Record<PictureFormat, string> = {
  rebus: `Ребус собирается программой из частей picture_spec.parts. Части: {"t":"pic","emoji":"🐱","word":"кот","cutStart":0,"cutEnd":1,"swap":[["К","Р"]],"flip":false} — картинка (cutStart/cutEnd — запятые: сколько букв убрать в начале/конце; swap — замена буквы; flip — картинка вверх ногами, слово читается задом наперёд); {"t":"txt","text":"ЛЕТА","strike":[]} — буквы (strike — индексы зачёркнутых); {"t":"num","text":"100","word":"сто"} — число. Эмодзи — ТОЛЬКО из словаря и ТОЛЬКО с указанным прочтением: ${Object.entries(
    REBUS_EMOJI,
  )
    .map(([emoji, words]) => `${emoji}=${words[0]}`)
    .join(", ")}. Числа: ${Object.entries(REBUS_NUMBERS)
    .map(([digits, word]) => `${digits}=${word}`)
    .join(
      ", ",
    )}. Ответ — одно существительное в именительном падеже, известное всем; склейка частей слева направо должна дать ровно ответ. 2–4 части, хотя бы одна картинка. Не больше двух запятых с одной стороны.`,
  emoji: `picture_spec = {"lines": [["🚢","🧊","💔"]]} — 1–2 строки, всего 2–7 эмодзи, без букв и слов. Ответ — название очень известного фильма, мультфильма, сказки, песни или русская пословица. Эмодзи должны вести к ответу, но не буквально по слогам; каждый эмодзи стандартный (Unicode 15). В variants — другие принятые названия того же произведения.`,
  fragment: `Фото достопримечательности с Wikimedia Commons, свободная лицензия (CC BY, CC BY-SA, CC0, PD, FAL). image_url = "https://commons.wikimedia.org/wiki/Special:FilePath/<ИМЯ_ФАЙЛА>?width=960" — реально существующий файл. picture_spec = {"mode":"tiles","cols":4,"rows":3,"seed":<число>} или {"mode":"zoom","focus":[x,y],"scale":5} (focus — узнаваемая, но не главная деталь в долях 0..1). reveal_seconds ${DEFAULT_REVEAL.fragment}. Объект — знаменитый, его узнают по фото.`,
  hidden: `Картинка — сетка одинаковых эмодзи, среди которых один «лишний» похожий. picture_spec = {"base":"🍅","odd":"🍎","cols":8,"rows":5,"seed":<число>}. Пара должна быть похожей по форме или цвету, но однозначно различимой; ответ — как называется лишний предмет (одно-два слова). Стандартные эмодзи Unicode 15.`,
  blur: `Фото предмета, животного или блюда с Wikimedia Commons, свободная лицензия; один крупный объект на простом фоне. image_url = "https://commons.wikimedia.org/wiki/Special:FilePath/<ИМЯ_ФАЙЛА>?width=960". picture_spec = {"effect":"blur"} или {"effect":"pixel"}. reveal_seconds ${DEFAULT_REVEAL.blur}.`,
  logo: `Логотип без названия с Wikimedia Commons — только файлы со свободной лицензией или в общественном достоянии (простые геометрические знаки, PD-textlogo, CC BY). На картинке не должно быть букв названия. image_url = "https://commons.wikimedia.org/wiki/Special:FilePath/<ИМЯ_ФАЙЛА>?width=960". picture_spec = {"effect":"blur","background":"#ffffff"} или {"effect":"none"}. reveal_seconds ${DEFAULT_REVEAL.logo}. Без логотипов Meta (Instagram, Facebook), политических и военных символов. Постеры фильмов не используй: они несвободны.`,
  kids: `Детский рисунок по мотивам очень известного фильма или мультфильма (голливудский хит, советская классика, российский хит, мультфильм), нарисованный ИИ. Рисунки готовятся заранее и лежат в public/pictures/k/; LLM этот формат не генерирует.`,
};

export const PICTURE_GENERATION_SYSTEM = `Ты составитель картиночных заданий для «Своей игры». ${AUDIENCE} ${PROMPT_RULE} Перед ответом перепроверь каждое задание. Верни только JSON-массив.`;

export function pictureGenerationUser(
  format: PictureFormat,
  count: number,
  avoidAnswers: string[],
): string {
  const avoid = avoidAnswers.length
    ? ` Эти ответы уже есть, не повторяй: ${avoidAnswers.slice(0, 150).join("; ")}.`
    : "";
  return `Тема (поле category, ровно так): «${PICTURE_CATEGORY[format]}». Составь ${count} заданий, сложность value от 100 до 1000. ${FORMAT_RULES[format]}${avoid} Поля каждого: category, prompt, answer, variants (другие написания ТОГО ЖЕ ответа), value, picture ("${format}"), picture_spec${["fragment", "blur", "logo"].includes(format) ? ", image_url, reveal_seconds" : ""}.`;
}

/** Что дополнительно проверяют LLM-рецензенты в картиночных заданиях. */
export const PICTURE_REVIEW_RULE: Record<PictureFormat, string> = {
  rebus:
    "Это ребус (picture_spec.parts). Проверь: каждая картинка читается однозначно указанным словом, склейка частей даёт ровно answer, слово известное, prompt не подсказывает ответ и не называет картинки.",
  emoji:
    "Это эмодзи-шифр (picture_spec.lines). Проверь: произведение или пословица известны в России, эмодзи реально наводят на ответ (не случайный набор), ответ однозначен, prompt не подсказывает.",
  fragment:
    "Это «угадай по фрагменту»: фото достопримечательности по ссылке Commons. Проверь, что объект знаменит и по имени файла в image_url это действительно answer; prompt не подсказывает.",
  hidden:
    "Это «найди лишнее»: сетка эмодзи base с одним odd. Проверь, что odd отличим от base и answer — понятное название odd.",
  blur: "Это размытое фото по ссылке Commons. Проверь, что объект — один, узнаваемый, и answer называет его; prompt не подсказывает.",
  kids: "Это детский рисунок по мотивам фильма (файл в public/pictures/k/). Проверь: фильм или мультфильм известен в России, answer — его название, variants — оригинальное и русское названия без года; на рисунке нет текста; prompt не подсказывает.",
  logo: "Это логотип без названия по ссылке Commons. Проверь, что бренд известен в России, на логотипе нет букв названия, это не Meta, не политика; prompt не подсказывает.",
};
