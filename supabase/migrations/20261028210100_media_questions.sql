-- Медиа-вопросы M2. После 20261028210000_media.sql.
-- YouTube id проверены через oEmbed. Картинки — прямые ссылки Wikimedia Commons, без скачивания.
-- curtain = true: своя шторка, слышен только звук.

insert into public.question_bank (
  category, prompt, answer, variants, kind, youtube_id, vk_url, rutube_url, image_url, start_seconds, end_seconds, curtain
) values
('Чарты', 'Кто исполняет песню, которая звучит?', 'Рик Эстли', array['Rick Astley','Рик Астли']::text[], 'music', 'dQw4w9WgXcQ', null, null, null, 0, 18, true),
('Чарты', 'Чей это трек Gangnam Style?', 'PSY', array['Сай','Псай']::text[], 'music', '9bZkp7q19f0', null, null, null, 0, 16, true),
('Чарты', 'Кто поёт Despacito вместе с Дэдди Янки?', 'Луис Фонси', array['Luis Fonsi']::text[], 'music', 'kJQP7kiw5Fk', null, null, null, 0, 18, true),
('Чарты', 'Кто исполняет Blinding Lights?', 'The Weeknd', array['Уикенд','Зе Уикенд']::text[], 'music', '4NRXx6U8ABQ', null, null, null, 0, 18, true),
('Чарты', 'Чья это песня Blank Space?', 'Тейлор Свифт', array['Taylor Swift']::text[], 'music', 'e-ORhEE9VVg', null, null, null, 0, 16, true),
('Чарты', 'Кто записал Faded?', 'Алан Уокер', array['Alan Walker']::text[], 'music', '60ItHLz5WEA', null, null, null, 0, 16, true),
('Чарты', 'Кто поёт Shape of You?', 'Эд Ширан', array['Ed Sheeran']::text[], 'music', 'JGwWNGJdvx8', null, null, null, 0, 16, true),
('Чарты', 'Кто поёт вместе с Бруно Марсом в Uptown Funk?', 'Марк Ронсон', array['Mark Ronson']::text[], 'music', 'OPf0YbXqDm0', null, null, null, 0, 15, true),
('YouTube', 'Кто поёт в этом клипе Hello?', 'Адель', array['Adele']::text[], 'video', 'YQHsXMglC9A', null, null, null, 0, 16, false),
('YouTube', 'Чей клип Shake It Off на экране?', 'Тейлор Свифт', array['Taylor Swift']::text[], 'video', 'nfWlot6h_JM', null, null, null, 0, 16, false),
('YouTube', 'Какая группа сняла клип Thunder?', 'Imagine Dragons', array['Имеджин Драгонс']::text[], 'video', 'fKopy74weus', null, null, null, 0, 16, false),
('YouTube', 'Кто снимается в клипе Roar?', 'Кэти Перри', array['Katy Perry']::text[], 'video', 'CevxZvSJLk8', null, null, null, 0, 16, false),
('YouTube', 'Кто поёт в клипе Perfect?', 'Эд Ширан', array['Ed Sheeran']::text[], 'video', '2Vv-BfVoq4g', null, null, null, 0, 16, false),
('YouTube', 'Кто исполняет Can''t Stop the Feeling?', 'Джастин Тимберлейк', array['Justin Timberlake']::text[], 'video', 'ru0K8uYEZWw', null, null, null, 0, 16, false),
('Места', 'Кто на портрете?', 'Мона Лиза', array['Джоконда','Mona Lisa']::text[], 'image', null, null, null, 'https://commons.wikimedia.org/wiki/Special:FilePath/Mona%20Lisa%2C%20by%20Leonardo%20da%20Vinci%2C%20from%20C2RMF%20retouched.jpg?width=960', null, null, false),
('Места', 'Как называется эта башня?', 'Эйфелева башня', array['Эйфелева']::text[], 'image', null, null, null, 'https://commons.wikimedia.org/wiki/Special:FilePath/Tour%20Eiffel%20Wikimedia%20Commons%20%28cropped%29.jpg?width=960', null, null, false),
('Места', 'Как называется этот амфитеатр в Риме?', 'Колизей', array['Colosseum']::text[], 'image', null, null, null, 'https://commons.wikimedia.org/wiki/Special:FilePath/Colosseo%202020.jpg?width=960', null, null, false),
('Места', 'Как называется эта статуя?', 'Статуя Свободы', array['Статуя свободы']::text[], 'image', null, null, null, 'https://commons.wikimedia.org/wiki/Special:FilePath/Statue%20of%20Liberty%207.jpg?width=960', null, null, false),
('Места', 'Как называется этот мавзолей?', 'Тадж-Махал', array['Тадж Махал']::text[], 'image', null, null, null, 'https://commons.wikimedia.org/wiki/Special:FilePath/Taj%20Mahal%20%28Edited%29.jpeg?width=960', null, null, false),
('Места', 'Как называется это здание в Сиднее?', 'Сиднейский оперный театр', array['Оперный театр']::text[], 'image', null, null, null, 'https://commons.wikimedia.org/wiki/Special:FilePath/Sydney%20Opera%20House%2C%20Australia.jpg?width=960', null, null, false),
('Места', 'Как обычно называют эти часы в Лондоне?', 'Биг-Бен', array['Биг Бен','Big Ben']::text[], 'image', null, null, null, 'https://commons.wikimedia.org/wiki/Special:FilePath/Big%20Ben%20and%20the%20Palace%20of%20Westminster.jpg?width=960', null, null, false),
('Места', 'Как называется эта статуя в Рио?', 'Христос-Искупитель', array['Христос Искупитель']::text[], 'image', null, null, null, 'https://commons.wikimedia.org/wiki/Special:FilePath/Christ%20the%20Redeemer%20-%20Cristo%20Redentor.jpg?width=960', null, null, false),
('Места', 'Как называется самая известная пирамида Гизы на фото?', 'Пирамида Хеопса', array['Великая пирамида']::text[], 'image', null, null, null, 'https://commons.wikimedia.org/wiki/Special:FilePath/Kheops-Pyramid.jpg?width=960', null, null, false),
('Места', 'Как называется этот собор на Красной площади?', 'Храм Василия Блаженного', array['Собор Василия Блаженного']::text[], 'image', null, null, null, 'https://commons.wikimedia.org/wiki/Special:FilePath/Saint%20Basil%27s%20Cathedral.jpg?width=960', null, null, false);
