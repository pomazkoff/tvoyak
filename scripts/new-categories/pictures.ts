/**
 * «Один пиксель» и «Супер-зум»: только файлы Wikimedia Commons со свободной
 * лицензией или PD (картины старых мастеров — общественное достояние;
 * кинопостеры и обложки несвободны, поэтому их здесь нет). Лицензию,
 * автора и доступность превью проверяет build.ts через checkPictureDraft.
 */
export type PixelItem = {
  answer: string;
  variants?: string[];
  value: number;
  hint: string;
  file: string;
  /** 8 — старт с сетки 8×8 (сложнее), 16 — с 16×16. */
  blocks: 8 | 16;
};

export const PIXELS: PixelItem[] = [
  { answer: "Мона Лиза", variants: ["Джоконда", "Mona Lisa"], value: 100, hint: "знаменитая картина", file: "Mona_Lisa.jpg", blocks: 8 },
  { answer: "Эйфелева башня", variants: ["Эйфелева"], value: 100, hint: "достопримечательность", file: "Tour_Eiffel_Wikimedia_Commons_(cropped).jpg", blocks: 8 },
  { answer: "Статуя Свободы", variants: ["Statue of Liberty"], value: 100, hint: "достопримечательность", file: "Front_view_of_Statue_of_Liberty_(cropped).jpg", blocks: 8 },
  { answer: "Звёздная ночь", variants: ["Звездная ночь"], value: 100, hint: "знаменитая картина", file: "Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg", blocks: 8 },
  { answer: "Утро в сосновом лесу", variants: ["Три медведя", "Мишки в сосновом лесу", "Мишки"], value: 100, hint: "знаменитая картина", file: "Utro_v_sosnovom_lesu.jpg", blocks: 16 },
  { answer: "Крик", variants: ["The Scream"], value: 200, hint: "знаменитая картина", file: "Edvard_Munch,_1893,_The_Scream,_oil,_tempera_and_pastel_on_cardboard,_91_x_73_cm,_National_Gallery_of_Norway.jpg", blocks: 8 },
  { answer: "Колизей", variants: ["Колизеум"], value: 200, hint: "достопримечательность", file: "Colosseo_2020.jpg", blocks: 8 },
  { answer: "Девятый вал", value: 200, hint: "знаменитая картина", file: "Hovhannes_Aivazovsky_-_The_Ninth_Wave_-_Google_Art_Project.jpg", blocks: 16 },
  { answer: "Богатыри", variants: ["Три богатыря"], value: 200, hint: "знаменитая картина", file: "Viktor_Vasnetsov_-_Богатыри_-_Google_Art_Project.jpg", blocks: 16 },
  { answer: "Большая волна в Канагаве", variants: ["Волна", "Большая волна"], value: 200, hint: "знаменитая гравюра", file: "Tsunami_by_hokusai_19th_century.jpg", blocks: 8 },
  { answer: "Тадж-Махал", variants: ["Тадж Махал"], value: 200, hint: "достопримечательность", file: "Taj_Mahal_(Edited).jpeg", blocks: 8 },
  { answer: "Собор Василия Блаженного", variants: ["Храм Василия Блаженного", "Покровский собор"], value: 200, hint: "достопримечательность", file: "Saint_Basil's_Cathedral_in_Moscow.jpg", blocks: 16 },
  { answer: "Девушка с жемчужной серёжкой", variants: ["Девушка с жемчужной сережкой"], value: 300, hint: "знаменитая картина", file: "1665_Girl_with_a_Pearl_Earring.jpg", blocks: 16 },
  { answer: "Тайная вечеря", value: 300, hint: "знаменитая фреска", file: "The_Last_Supper_-_Leonardo_Da_Vinci_-_High_Resolution_32x16.jpg", blocks: 16 },
  { answer: "Сотворение Адама", value: 300, hint: "знаменитая фреска", file: "Michelangelo_-_Creation_of_Adam_(cropped).jpg", blocks: 16 },
  { answer: "Алёнушка", variants: ["Аленушка"], value: 300, hint: "знаменитая картина", file: "Viktor_Vasnetsov_-_Аленушка_-_Google_Art_Project.jpg", blocks: 16 },
  { answer: "Биг-Бен", variants: ["Биг Бен", "Вестминстерский дворец"], value: 300, hint: "достопримечательность", file: "Elizabeth_Tower_and_the_north_front_of_the_Palace_of_Westminster,_London.jpg", blocks: 16 },
  { answer: "Рождение Венеры", value: 400, hint: "знаменитая картина", file: "Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg", blocks: 16 },
  { answer: "Подсолнухи", value: 400, hint: "знаменитая картина", file: "Vincent_Willem_van_Gogh_127.jpg", blocks: 16 },
  { answer: "Бурлаки на Волге", variants: ["Бурлаки"], value: 400, hint: "знаменитая картина", file: "Ilia_Efimovich_Repin_(1844-1930)_-_Volga_Boatmen_(1870-1873).jpg", blocks: 16 },
  { answer: "Девочка с персиками", value: 500, hint: "знаменитая картина", file: "Valentin_Serov_-_Девочка_с_персиками._Портрет_В.С.Мамонтовой_-_Google_Art_Project.jpg", blocks: 16 },
  { answer: "Грачи прилетели", value: 500, hint: "знаменитая картина", file: "RooksBackOfSavrasov.jpg", blocks: 16 },
];

export type MacroItem = {
  answer: string;
  variants?: string[];
  value: number;
  hint: string;
  file: string;
  /** Куда смотрит камера в начале (доли ширины и высоты) и во сколько раз увеличено. */
  focus: [number, number];
  scale: number;
};

export const MACROS: MacroItem[] = [
  { answer: "Кофейные зёрна", variants: ["Кофе", "Зёрна кофе", "Кофейные зерна"], value: 100, hint: "на кухне", file: "Coffee Beans macro 1.jpg", focus: [0.5, 0.5], scale: 6 },
  { answer: "Клубника", variants: ["Земляника"], value: 100, hint: "еда", file: "Strawberry surface close up macro.jpg", focus: [0.5, 0.5], scale: 5 },
  { answer: "Киви", value: 100, hint: "еда", file: "Kiwi (Actinidia chinensis) 1 Luc Viatour.jpg", focus: [0.22, 0.36], scale: 8 },
  { answer: "Спичка", variants: ["Спички"], value: 200, hint: "на кухне", file: "Match Macro.jpg", focus: [0.15, 0.62], scale: 7 },
  { answer: "Карандаш", value: 200, hint: "в пенале", file: "Pencil Tip Macro.jpg", focus: [0.8, 0.5], scale: 8 },
  { answer: "Брокколи", value: 200, hint: "еда", file: "Broccoli close up (49200262862).jpg", focus: [0.47, 0.35], scale: 8 },
  { answer: "Ананас", value: 200, hint: "еда", file: "Pineapple close-up (81928).jpg", focus: [0.5, 0.5], scale: 5 },
  { answer: "Джинсы", variants: ["Джинсовая ткань", "Деним"], value: 200, hint: "одежда", file: "Jeansfabric.jpg", focus: [0.5, 0.5], scale: 5 },
  { answer: "Мяч для гольфа", variants: ["Гольф", "Мячик для гольфа"], value: 200, hint: "спорт", file: "Golf ball 4.jpg", focus: [0.5, 0.5], scale: 6 },
  { answer: "Теннисный мяч", variants: ["Мяч для тенниса", "Теннисный мячик"], value: 200, hint: "спорт", file: "Tennis ball at Highgate Cricket Club, Crouch End, London.jpg", focus: [0.33, 0.55], scale: 8 },
  { answer: "Зубная щётка", variants: ["Зубная щетка", "Щётка"], value: 200, hint: "в ванной", file: "Toothbrush 20050716 004.jpg", focus: [0.4, 0.3], scale: 8 },
  { answer: "Снежинка", variants: ["Снег"], value: 200, hint: "в природе", file: "Real snowflake macro photo - Flickr - Alexey Kljatov.jpg", focus: [0.55, 0.45], scale: 6 },
  { answer: "Муха", variants: ["Комнатная муха", "Глаз мухи"], value: 200, hint: "в природе", file: "Red eye housefly.jpg", focus: [0.58, 0.26], scale: 8 },
  { answer: "Шариковая ручка", variants: ["Ручка"], value: 300, hint: "в пенале", file: "Ballpoint pen macro.jpg", focus: [0.62, 0.4], scale: 6 },
  { answer: "Перо", variants: ["Птичье перо", "Перья"], value: 300, hint: "в природе", file: "Feathers macro close up.jpg", focus: [0.5, 0.5], scale: 6 },
  { answer: "Крыло бабочки", variants: ["Бабочка", "Павлиний глаз"], value: 300, hint: "в природе", file: "2021-08-16 - Peacock butterfly (Aglais io) - eyespot on forewing - colourful scales - DSG3404-1 (magnif. ratio 2.2x, HiRes focus stack).jpg", focus: [0.45, 0.5], scale: 6 },
  { answer: "Кошачий язык", variants: ["Язык кошки", "Язык кота"], value: 300, hint: "дома", file: "Cat tongue macro.jpg", focus: [0.6, 0.66], scale: 6 },
  { answer: "Сахар", variants: ["Сахарный песок"], value: 300, hint: "на кухне, под микроскопом", file: "Sugar Crystals.jpg", focus: [0.5, 0.5], scale: 4 },
  { answer: "Соль", variants: ["Поваренная соль"], value: 400, hint: "на кухне, под микроскопом", file: "Refined kitchen salt under microscope.jpg", focus: [0.5, 0.5], scale: 4 },
  { answer: "Подсолнух", variants: ["Семечки"], value: 400, hint: "в природе", file: "Sunflower macro wide.jpg", focus: [0.5, 0.5], scale: 4 },
  { answer: "Липучка", variants: ["Велкро", "Застёжка-липучка"], value: 400, hint: "на одежде, под микроскопом", file: "Velcro hooks.jpg", focus: [0.5, 0.4], scale: 4 },
  { answer: "Волос", variants: ["Волосы", "Волосок"], value: 500, hint: "под электронным микроскопом", file: "SEM image of a hair by Lola Sõukand.jpg", focus: [0.5, 0.45], scale: 3 },
];
