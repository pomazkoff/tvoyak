-- Правки по регрессу новых категорий (30.10.2026). Только update по id,
-- число вопросов в категориях не меняется.
--  1. Вариант «Унесенные приведениями».
--  2. Звук наоборот: 14 замедленных → задом наперёд.
--  3. Дубли: 4 фильма в «Голосе из прошлого» и 11 межкатегорийных дублей
--     заменены новыми вопросами (факты и ролики проверены, ролики встраиваются).
--  4. Гагарин: вопрос больше не называет дату полёта.
--  5. Окна YouTube 10–25 с, конец не дальше длины ролика.
--  6. Убрана служебная нумерация «… № N:» в новых категориях.
--  7. Супер-зум «Муха»: картинка высокого разрешения.
-- 1. Нейросеть пересказала: вариант с опечаткой из регресса.
update public.question_bank set variants = array['Spirited Away', 'Сэн и Тихиро', 'Унесенные приведениями']::text[]
  where id = '71f0a067-fa45-468c-b664-7159e636f497' and category = 'Нейросеть пересказала';

-- 2. Звук наоборот: всё задом наперёд (как в названии), подсказка — жанр и эпоха.
update public.question_bank set prompt = 'Задом наперёд: поп-хит 1980-х. Кто исполняет?', audio_fx = 'reverse', start_seconds = 0, end_seconds = 30
  where id = 'a622acd0-8b68-4cbe-b240-0c77ba3c7be1' and category = 'Звук наоборот';
update public.question_bank set prompt = 'Задом наперёд: русский рок 1980-х. Кто исполняет?', audio_fx = 'reverse', start_seconds = 0, end_seconds = 30
  where id = '5cb76920-7559-4287-bcbe-d9ced59dc5a6' and category = 'Звук наоборот';
update public.question_bank set prompt = 'Задом наперёд: латиноамериканский хит 2010-х. Кто исполняет?', audio_fx = 'reverse', start_seconds = 0, end_seconds = 30
  where id = '31e7fdac-54a6-4c49-9ebe-925907b02f0d' and category = 'Звук наоборот';
update public.question_bank set prompt = 'Задом наперёд: советская эстрада 1980-х. Кто исполняет?', audio_fx = 'reverse', start_seconds = 0, end_seconds = 30
  where id = 'c0920e11-16a9-4e0a-a0d0-f6f4dbafc748' and category = 'Звук наоборот';
update public.question_bank set prompt = 'Задом наперёд: диско 1970-х. Кто исполняет?', audio_fx = 'reverse', start_seconds = 0, end_seconds = 30
  where id = '62eb35ab-e53a-48f0-b723-23b593a7ad99' and category = 'Звук наоборот';
update public.question_bank set prompt = 'Задом наперёд: русская поп-музыка 1990-х. Кто исполняет?', audio_fx = 'reverse', start_seconds = 0, end_seconds = 30
  where id = 'f5ee1dcd-bb80-481b-b5bf-14bba160d23b' and category = 'Звук наоборот';
update public.question_bank set prompt = 'Задом наперёд: британский поп 2010-х. Кто исполняет?', audio_fx = 'reverse', start_seconds = 0, end_seconds = 30
  where id = 'f275b4cb-725b-4d6d-8b99-4f9261ad748e' and category = 'Звук наоборот';
update public.question_bank set prompt = 'Задом наперёд: электронный хит 2010-х. Кто исполняет?', audio_fx = 'reverse', start_seconds = 0, end_seconds = 30
  where id = '439d547e-8a9d-4093-bef1-0dc34b4a5927' and category = 'Звук наоборот';
update public.question_bank set prompt = 'Задом наперёд: русский рок, поёт женщина. Кто исполняет?', audio_fx = 'reverse', start_seconds = 0, end_seconds = 30
  where id = '470700c5-52a5-4be9-b629-1d8d782704ef' and category = 'Звук наоборот';
update public.question_bank set prompt = 'Задом наперёд: вирусный хит 2010-х. Кто исполняет?', audio_fx = 'reverse', start_seconds = 0, end_seconds = 30
  where id = 'ea78ff3f-f250-4911-954b-7c8a2620964e' and category = 'Звук наоборот';
update public.question_bank set prompt = 'Задом наперёд: британский рок 1960-х. Кто исполняет?', audio_fx = 'reverse', start_seconds = 0, end_seconds = 30
  where id = 'c2492bbf-f296-43f4-ae50-c1bab73919ef' and category = 'Звук наоборот';
update public.question_bank set prompt = 'Задом наперёд: рэп 2000-х. Кто исполняет?', audio_fx = 'reverse', start_seconds = 0, end_seconds = 30
  where id = '9d9e6d30-7bea-49a4-b276-3ed9845d4450' and category = 'Звук наоборот';
update public.question_bank set prompt = 'Задом наперёд: соул-баллада 2010-х. Кто исполняет?', audio_fx = 'reverse', start_seconds = 0, end_seconds = 30
  where id = 'cec9018c-9a64-4019-9fee-3e53fb096299' and category = 'Звук наоборот';
update public.question_bank set prompt = 'Задом наперёд: американский рок 2010-х. Кто исполняет?', audio_fx = 'reverse', start_seconds = 0, end_seconds = 30
  where id = 'e07ec2fb-246a-40ad-b53d-e52b9a8e3c17' and category = 'Звук наоборот';
update public.question_bank set prompt = 'Задом наперёд: американский рок 1990-х. Кто исполняет?', audio_fx = 'reverse', start_seconds = 0, end_seconds = 30
  where id = '4761da64-0d55-45fd-bca3-4fe82f9af8e2' and category = 'Звук наоборот';
update public.question_bank set prompt = 'Задом наперёд: русский поп-дуэт 2000-х. Кто исполняет?', audio_fx = 'reverse', start_seconds = 0, end_seconds = 30
  where id = 'f995082d-9963-4b69-a491-1d04b21f5e56' and category = 'Звук наоборот';
update public.question_bank set prompt = 'Задом наперёд: британский рок 2000-х. Кто исполняет?', audio_fx = 'reverse', start_seconds = 0, end_seconds = 30
  where id = '3ad2dac0-0740-4b02-bdfa-c0d0c4d8be48' and category = 'Звук наоборот';
update public.question_bank set prompt = 'Задом наперёд: русский рок конца 1990-х. Кто исполняет?', audio_fx = 'reverse', start_seconds = 0, end_seconds = 30
  where id = '6fc644ab-4afd-4d8b-b0cc-f0c601d9be74' and category = 'Звук наоборот';
update public.question_bank set prompt = 'Задом наперёд: русский рок 1990-х. Кто исполняет?', audio_fx = 'reverse', start_seconds = 0, end_seconds = 30
  where id = '90f657fc-6aea-4237-bac2-d3459d109740' and category = 'Звук наоборот';
update public.question_bank set prompt = 'Задом наперёд: русский панк-рок 1990-х. Кто исполняет?', audio_fx = 'reverse', start_seconds = 0, end_seconds = 30
  where id = 'c7f4f447-2064-42f0-9f5b-36f5e561913c' and category = 'Звук наоборот';
update public.question_bank set prompt = 'Задом наперёд: альтернативный рок 2000-х. Кто исполняет?', audio_fx = 'reverse', start_seconds = 0, end_seconds = 30
  where id = '5b672a5a-ab91-4c38-9dba-6df8174969bd' and category = 'Звук наоборот';

-- 3–6. Голос из прошлого: дубли заменены новыми фильмами, окна 10–25 с в пределах длины ролика, без «№ N», Гагарин без даты.
update public.question_bank set prompt = 'Позывной «Кедр» на связи с Землёй — чей это голос?', start_seconds = 38, end_seconds = 60
  where id = '9a79afde-1660-4b55-97c6-8cfbccc20768' and category = 'Голос из прошлого';
update public.question_bank set prompt = 'Запись с Луны, 21 июля 1969 года — чей это голос?', start_seconds = 0, end_seconds = 13
  where id = 'c5f00a88-09f7-4c97-be97-a688baeea138' and category = 'Голос из прошлого';
update public.question_bank set prompt = 'Презентация 9 января 2007 года — чей это голос?', start_seconds = 12, end_seconds = 29
  where id = 'df3595a0-98ba-4d23-b2f1-42ab848688d7' and category = 'Голос из прошлого';
update public.question_bank set prompt = 'Кто из актёров озвучил главного героя этого мультфильма?', start_seconds = 164, end_seconds = 187
  where id = 'f4010304-a256-4fa6-8196-23e96cd92083' and category = 'Голос из прошлого';
update public.question_bank set prompt = 'Кто из актёров озвучил этого мультгероя?', start_seconds = 0, end_seconds = 14
  where id = '24ff12ce-7ab7-48ed-b815-db737566d0ee' and category = 'Голос из прошлого';
update public.question_bank set prompt = 'Реклама 1994 года — какую компанию рекламирует этот герой?', start_seconds = 0, end_seconds = 18
  where id = '55b6741e-d3f9-4ee9-b758-cf25e254e4b5' and category = 'Голос из прошлого';
update public.question_bank set prompt = 'Комедия 1965 года: из какого фильма эта фраза?', start_seconds = 0, end_seconds = 22
  where id = '69738280-cdb5-4477-a44a-0abeef749c23' and category = 'Голос из прошлого';
update public.question_bank set prompt = 'Комедия 1966 года: из какого фильма эта фраза?', start_seconds = 29, end_seconds = 50
  where id = '0683ec26-3fa3-4af0-bb1a-d915151211ca' and category = 'Голос из прошлого';
update public.question_bank set prompt = 'Комедия 1968 года: из какого фильма эта фраза?', start_seconds = 7, end_seconds = 25
  where id = '9b79e28a-ce88-4fb5-b930-e1fc0690a5eb' and category = 'Голос из прошлого';
update public.question_bank set prompt = 'Фильм 1969 года: из какого фильма эта фраза?', start_seconds = 0, end_seconds = 20
  where id = 'da986395-c1a1-40e6-91da-221b2b9072cb' and category = 'Голос из прошлого';
update public.question_bank set prompt = 'Комедия 1973 года: из какого фильма эта фраза?', start_seconds = 0, end_seconds = 21
  where id = '8f2801bb-fd69-424e-ba2d-1851d4726c64' and category = 'Голос из прошлого';
update public.question_bank set prompt = 'Фильм 1975 года: из какого фильма эта фраза?', start_seconds = 0, end_seconds = 10
  where id = '86e4483a-21ae-42cc-9024-ff3ad9530de1' and category = 'Голос из прошлого';
update public.question_bank set prompt = 'Мультфильм 1981 года: из какого мультфильма эта фраза?', start_seconds = 0, end_seconds = 22
  where id = 'cd06b07d-46ef-4d5a-87c2-55c8a61a1bbb' and category = 'Голос из прошлого';
update public.question_bank set prompt = 'Лирическая комедия 1977 года: из какого фильма эта фраза?', answer = 'Служебный роман', variants = '{}'::text[], youtube_id = 'u10AiRA5rDc', start_seconds = 7, end_seconds = 28, curtain = true
  where id = 'c37c4290-b269-457b-8540-01d241a7c3f1' and category = 'Голос из прошлого';
update public.question_bank set prompt = 'Комедия 1984 года: из какого фильма эта фраза?', answer = 'Любовь и голуби', variants = '{}'::text[], youtube_id = 'KV8NUn4S6UQ', start_seconds = 44, end_seconds = 64, curtain = true
  where id = 'ca299474-bae8-47c3-a1b2-8204f47db23e' and category = 'Голос из прошлого';
update public.question_bank set prompt = 'Комедия 1977 года: из какого фильма эта фраза?', answer = 'Мимино', variants = '{}'::text[], youtube_id = '3omJPklVDHs', start_seconds = 38, end_seconds = 48, curtain = true
  where id = '00902e5a-dfd7-48dc-b5bf-2da67a0e7820' and category = 'Голос из прошлого';
update public.question_bank set prompt = 'Трагикомедия 1966 года: из какого фильма эта фраза?', answer = 'Берегись автомобиля', variants = '{}'::text[], youtube_id = 'u_-LDuDpvB0', start_seconds = 0, end_seconds = 17, curtain = true
  where id = 'd87bece1-c519-40c6-9c9a-30f6734d7f02' and category = 'Голос из прошлого';

-- 3. Межкатегорийные дубли ответов: заменены свежими вопросами той же категории и номинала.
update public.question_bank set prompt = 'Самовлюблённому парню за грубость достаётся медвежья голова, а добрую падчерицу мачеха отправляет в зимний лес, где её за кротость награждает дед в шубе с посохом.', answer = 'Морозко', variants = '{}'::text[]
  where id = '5cf61f74-2e02-4f42-84be-3ed6469b6b94' and category = 'Нейросеть пересказала';
update public.question_bank set prompt = 'Мальчик из придорожного трактира находит у старого моряка карту и уходит на шхуне за кладом. Добродушный одноногий кок с попугаем оказывается главарём пиратов.', answer = 'Остров сокровищ', variants = array['Treasure Island']::text[]
  where id = 'c4d2cdbc-cff9-45c6-92b2-4059c0fea347' and category = 'Нейросеть пересказала';
update public.question_bank set prompt = 'Прораб и студент со скрипкой случайно попадают на пустынную планету, где спички дороже всего, жители обходятся словом «ку», а перед начальством положено приседать.', answer = 'Кин-дза-дза!', variants = array['Кин-дза-дза', 'Кин дза дза']::text[]
  where id = '210368ea-08d5-495b-a888-d9a5a7f76736' and category = 'Нейросеть пересказала';
update public.question_bank set prompt = 'Профессор пересаживает бездомному псу человеческий гипофиз, и тот превращается в хамоватого гражданина, который требует прописку, пьёт и воюет с котами.', answer = 'Собачье сердце', variants = '{}'::text[]
  where id = 'bfe92de2-2750-40df-bef1-287ba5d6b886' and category = 'Нейросеть пересказала';
update public.question_bank set prompt = '★☆☆☆☆ Очередь на каждую карусель по два часа, сахарная вата по цене ужина, а ростовая мышь в шортах обнималась с кем угодно, только не с моим сыном. Сказка закончилась у кассы.', answer = 'Диснейленд', variants = array['Disneyland']::text[]
  where id = 'cad33024-f598-41dd-8f74-fcda96239466' and category = 'Угадай по отзыву';
update public.question_bank set prompt = '★☆☆☆☆ Жильцов набилось столько, что последний пришёл самый крупный — и всё развалил. Управляющей компании нет, правил заселения нет.', answer = 'Теремок', variants = '{}'::text[]
  where id = '40872329-d71e-4a6c-a5e3-42f40d2d7370' and category = 'Угадай по отзыву';
update public.question_bank set prompt = '★☆☆☆☆ Красные стены, внутрь пускают не везде. Пушка огромная, но не стреляет, колокол огромный, но не звонит.', answer = 'Московский Кремль', variants = array['Кремль']::text[]
  where id = '0fd429a9-de43-41a0-a891-b691b138fd97' and category = 'Угадай по отзыву';
update public.question_bank set prompt = '★☆☆☆☆ Лезли два месяца, на вершину стояли в очереди, как в метро. Дышать нечем, кислород за свои деньги, вид — облака.', answer = 'Эверест', variants = array['Джомолунгма', 'Everest']::text[]
  where id = '33634828-09b2-48f8-a3a7-ff4444c367e1' and category = 'Угадай по отзыву';
update public.question_bank set prompt = '★☆☆☆☆ Роман в стихах, а читается тяжело. Девушка первой написала письмо, он прочитал ей нотацию, застрелил друга на дуэли, а через годы сам пришёл с признанием — поздно. Финал оборван.', answer = 'Евгений Онегин', variants = array['Онегин']::text[]
  where id = '38d93683-e4f4-4f8c-a4d2-620e63d17f73' and category = 'Угадай по отзыву';
update public.question_bank set prompt = '«Пришёл, увидел, победил», — так коротко полководец доложил в Рим о быстрой победе в 47 году до н. э. Кто это сказал?', answer = 'Юлий Цезарь', variants = array['Цезарь', 'Гай Юлий Цезарь', 'Caesar']::text[]
  where id = '5bf6441f-2fd4-4ca7-9d13-6f475150836c' and category = 'Кто это сказал?';
update public.question_bank set prompt = '«Я мыслю, следовательно, существую» — главный тезис философа XVII века. Кто это сказал?', answer = 'Рене Декарт', variants = array['Декарт', 'Descartes']::text[]
  where id = '993ee103-26b1-4033-a819-31e8a50f4b3c' and category = 'Кто это сказал?';

-- 6. Один пиксель и Супер-зум: без служебной нумерации, у каждого вопроса своя подсказка.
update public.question_bank set prompt = 'Портрет эпохи Возрождения.'
  where id = '03f5cfbc-5f21-4d1d-b5a4-54ad9b6eaada' and category = 'Один пиксель';
update public.question_bank set prompt = 'Японская гравюра.'
  where id = 'dc9a7afa-c786-4863-bfaf-7ef79a2eb3a8' and category = 'Один пиксель';
update public.question_bank set prompt = 'Постройка XVII века.'
  where id = '9eac698a-da9f-42ae-a83f-b06dedb213cf' and category = 'Один пиксель';
update public.question_bank set prompt = 'Храм.'
  where id = '947b2fd6-ad9a-4b5a-9eb2-d3273aabbeb9' and category = 'Один пиксель';
update public.question_bank set prompt = 'Голландский портрет XVII века.'
  where id = 'e497a4f2-3c59-444b-b2dd-d36e09803b98' and category = 'Один пиксель';
update public.question_bank set prompt = 'Фреска эпохи Возрождения.'
  where id = 'c0621d89-56ac-4783-ba5c-f25014fccb9e' and category = 'Один пиксель';
update public.question_bank set prompt = 'Роспись потолка эпохи Возрождения.'
  where id = '2720158d-7552-4d37-85e0-161d27a0fecd' and category = 'Один пиксель';
update public.question_bank set prompt = 'Русская живопись, сказочный сюжет.'
  where id = 'de0a5a70-4e44-4a95-9673-844afa6b38eb' and category = 'Один пиксель';
update public.question_bank set prompt = 'Башня.'
  where id = 'c517c02f-aad6-43b2-a833-c32f247fdb3c' and category = 'Один пиксель';
update public.question_bank set prompt = 'Итальянская живопись XV века.'
  where id = 'c7cc2dac-3e08-4632-9e73-92441dc00263' and category = 'Один пиксель';
update public.question_bank set prompt = 'Постимпрессионизм, натюрморт.'
  where id = '7104baa4-8f2b-4fc1-b313-516ec9d73f65' and category = 'Один пиксель';
update public.question_bank set prompt = 'Сооружение XIX века.'
  where id = 'b80b6195-9dca-44b6-b479-97f95ae6a865' and category = 'Один пиксель';
update public.question_bank set prompt = 'Русская живопись, жанровая сцена.'
  where id = '77d4bd71-9bd5-472f-af25-6917c4991ae1' and category = 'Один пиксель';
update public.question_bank set prompt = 'Русская живопись, портрет.'
  where id = 'cf6b317a-8c91-4049-91a5-7a76ad7a5892' and category = 'Один пиксель';
update public.question_bank set prompt = 'Русская живопись, весенний пейзаж.'
  where id = 'af2d63df-4033-4ea5-8edf-ab781aa07fb9' and category = 'Один пиксель';
update public.question_bank set prompt = 'Памятник.'
  where id = 'c1c0d138-aa7a-4a9c-80ff-0f90a602fe24' and category = 'Один пиксель';
update public.question_bank set prompt = 'Постимпрессионизм, ночной пейзаж.'
  where id = 'f69620ca-d318-4f44-8b3a-e8dce5be7d84' and category = 'Один пиксель';
update public.question_bank set prompt = 'Русская живопись, пейзаж с животными.'
  where id = 'e9f06830-2ad0-4184-8e36-faa40fcdd4e8' and category = 'Один пиксель';
update public.question_bank set prompt = 'Норвежская живопись.'
  where id = '45b219af-99b6-48bf-9f0c-93ace5a2fbe6' and category = 'Один пиксель';
update public.question_bank set prompt = 'Античная постройка.'
  where id = 'ac95888d-1bd5-4305-949d-c64aa43f424c' and category = 'Один пиксель';
update public.question_bank set prompt = 'Русская живопись, морской пейзаж.'
  where id = 'b18d21d0-2636-4c4b-b968-bf82870262ee' and category = 'Один пиксель';
update public.question_bank set prompt = 'Русская живопись, былинный сюжет.'
  where id = 'f5622a1a-ac32-4ec5-afd9-28e2eaa3add6' and category = 'Один пиксель';
update public.question_bank set prompt = 'На кухне, пахнет утром.'
  where id = 'bf477645-0ab1-437f-bbfd-e5fabbf34020' and category = 'Супер-зум';
update public.question_bank set prompt = 'Спорт.'
  where id = '2eb44cda-83c3-4ef3-94c9-18d62f83287f' and category = 'Супер-зум';
update public.question_bank set prompt = 'В ванной.'
  where id = '8a7813ac-8355-4fbb-a042-523af8a75985' and category = 'Супер-зум';
update public.question_bank set prompt = 'В природе, зимой.'
  where id = '5bc3521d-39b0-4ddc-9714-1c78be99c4f9' and category = 'Супер-зум';
-- 7. Муха: исходник 389×313 → макро 4106×2683
update public.question_bank set prompt = 'В природе, насекомое.', image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Macro_portrait_of_a_housefly_Musca_domestica.jpg?width=960', picture_spec = '{"mode": "zoom", "focus": [0.31, 0.3], "scale": 6}'::jsonb, image_credit = 'Irina Petrova · CC BY 4.0 · Wikimedia Commons', image_license = 'CC BY 4.0', image_page = 'https://commons.wikimedia.org/wiki/File:Macro_portrait_of_a_housefly_Musca_domestica.jpg'
  where id = 'b74f71f9-06f6-460c-afcd-b1a828500da3' and category = 'Супер-зум';
update public.question_bank set prompt = 'В пенале, пластиковое.'
  where id = '058e5d95-c94d-40e1-b095-af999bb5c822' and category = 'Супер-зум';
update public.question_bank set prompt = 'В природе, лёгкое.'
  where id = '44509523-32ec-4725-b47b-c938c26eb071' and category = 'Супер-зум';
update public.question_bank set prompt = 'В природе, часть насекомого.'
  where id = 'fc3f0dfa-1957-483f-bce2-43c3eb3662d4' and category = 'Супер-зум';
update public.question_bank set prompt = 'Дома, у питомца.'
  where id = '08e67a29-2a72-47d3-9b46-0257bf74ceb6' and category = 'Супер-зум';
update public.question_bank set prompt = 'На кухне, под микроскопом.'
  where id = '9340610f-7d85-4da9-8c7e-ce0dcaf0af2c' and category = 'Супер-зум';
update public.question_bank set prompt = 'На кухне, под микроскопом, кристаллы-кубики.'
  where id = '20a0408f-c2f0-4278-a1d1-95d5b1765567' and category = 'Супер-зум';
update public.question_bank set prompt = 'Еда, ягода.'
  where id = 'd8f0782e-9db6-474e-9c6f-4410cd2077d0' and category = 'Супер-зум';
update public.question_bank set prompt = 'В природе, летом в поле.'
  where id = 'ff698237-52da-4e83-9cdb-44ea5dc8add2' and category = 'Супер-зум';
update public.question_bank set prompt = 'На одежде, под микроскопом.'
  where id = '03d56ae0-5dbe-4b04-8b7e-254f3a0c5e2c' and category = 'Супер-зум';
update public.question_bank set prompt = 'Под электронным микроскопом.'
  where id = 'fe4c5d65-b833-4c66-a7c9-945d15e9474c' and category = 'Супер-зум';
update public.question_bank set prompt = 'Еда, фрукт.'
  where id = 'dcc709e5-a032-4189-99ed-ca3fb10d208e' and category = 'Супер-зум';
update public.question_bank set prompt = 'На кухне, рядом с плитой.'
  where id = 'b5e9f092-9fe9-4562-ba94-59c182ad1c0a' and category = 'Супер-зум';
update public.question_bank set prompt = 'В пенале, деревянное.'
  where id = '4d152486-54d9-4e5b-b366-d4854b728a04' and category = 'Супер-зум';
update public.question_bank set prompt = 'Еда, овощ.'
  where id = 'cc36c3e1-8614-4958-a98f-4abdb9251411' and category = 'Супер-зум';
update public.question_bank set prompt = 'Еда, тропический фрукт.'
  where id = '80f0263e-8b33-45a4-9313-2bc49fd37969' and category = 'Супер-зум';
update public.question_bank set prompt = 'Одежда.'
  where id = '604ce27b-9abe-46af-ae3c-a06fb7c81ba9' and category = 'Супер-зум';
update public.question_bank set prompt = 'Спортивный инвентарь.'
  where id = 'b1954331-a283-4956-ac2f-f7d17c6e3012' and category = 'Супер-зум';

-- Заменённые вопросы — новое содержание: снимаем отметку «уже видели», чтобы компании их получили.
delete from public.company_seen where bank_id in (
  'c37c4290-b269-457b-8540-01d241a7c3f1',
  'ca299474-bae8-47c3-a1b2-8204f47db23e',
  '00902e5a-dfd7-48dc-b5bf-2da67a0e7820',
  'd87bece1-c519-40c6-9c9a-30f6734d7f02',
  '5cf61f74-2e02-4f42-84be-3ed6469b6b94',
  'c4d2cdbc-cff9-45c6-92b2-4059c0fea347',
  '210368ea-08d5-495b-a888-d9a5a7f76736',
  'bfe92de2-2750-40df-bef1-287ba5d6b886',
  'cad33024-f598-41dd-8f74-fcda96239466',
  '40872329-d71e-4a6c-a5e3-42f40d2d7370',
  '0fd429a9-de43-41a0-a891-b691b138fd97',
  '33634828-09b2-48f8-a3a7-ff4444c367e1',
  '38d93683-e4f4-4f8c-a4d2-620e63d17f73',
  '5bf6441f-2fd4-4ca7-9d13-6f475150836c',
  '993ee103-26b1-4033-a819-31e8a50f4b3c'
);
