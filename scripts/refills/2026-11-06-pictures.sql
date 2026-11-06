-- Пополнение картиночных заданий 06.11.2026: правки черновиков и выкладка в банк ВЫКЛЮЧЕННЫМИ (enabled=false).
-- Включает Илья вручную на /admin/pictures. Выполнялось через Supabase Management API.
begin;

-- отбраковка: логотипы с буквами названия (как 30.10: Adidas/BMW/Pepsi)
update pack_items set status='rejected' where id in (
  'efdfc890-fce9-4efe-b1db-39376ee46d7b', -- Intel: словесный логотип
  'e0224d0f-f05e-434c-b369-d74984eefc44', -- Pepsi: надпись
  '23dd9fb9-fded-40c6-8be4-b71269e809fe', -- BMW: буквы на эмблеме
  '0996931e-1857-47e3-99a0-41037e09bf7c'  -- Pinterest: буква P / wordmark
);

-- ребусы: поправить число букв в промпте
update pack_items set prompt='Ребус № 146. Слово из 7 букв.', value=200 where id='222c730b-a575-4191-8e4e-3af087ed3aa4'; -- Корабль
update pack_items set prompt='Ребус № 147. Слово из 7 букв.', value=300 where id='5129c93f-c782-400d-bc57-e2522600a33f'; -- Зубатка
update pack_items set prompt='Ребус № 148. Слово из 7 букв.', value=300 where id='19119475-12cb-4060-9a46-9096fb0eeb29'; -- Лимонка

-- эмодзи-шифр
update pack_items set prompt='Эмодзи-шифр № 75: песня.', value=300 where id='7b1b7ae7-7793-4b51-a166-5dba7c493104';
update pack_items set prompt='Эмодзи-шифр № 76: пословица.', value=200 where id='d57d69a3-28a0-42b3-9f81-e056d28368c9';
update pack_items set prompt='Эмодзи-шифр № 77: сказка.', value=100 where id='c5c5501a-cdab-42e4-a298-2c6b4da375b3';
update pack_items set prompt='Эмодзи-шифр № 78: мультфильм.', value=400 where id='41641f41-f668-4d48-b7d2-c6ef083f7ca5';
update pack_items set prompt='Эмодзи-шифр № 79: фильм.', value=500 where id='9285705a-e393-4719-a267-14741be34031';

-- найди лишнее (у Каштана убрать ошибочный вариант «Гриб» — это база, не ответ)
update pack_items set prompt='Найди лишнее № 112: что здесь лишнее?', value=300, variants='{}' where id='46f38c41-dda1-4708-8e95-a5120989303a';
update pack_items set prompt='Найди лишнее № 113: что здесь лишнее?', value=200 where id='2b0b657b-fe48-40ef-9511-baddcf1febf8';

-- по фрагменту
update pack_items set prompt='По фрагменту № 28: достопримечательность.', value=300, variants='{"Тадж Махал","Taj Mahal"}' where id='223bdb5f-2a4d-4755-9e4b-8773a4fff33d';
update pack_items set prompt='По фрагменту № 29: сооружение.', value=200, variants='{"Stonehenge"}' where id='79a0b71b-d5c4-4d1f-a3ac-ee10bf908b8e';
update pack_items set prompt='По фрагменту № 30: статуя.', value=400 where id='f22b1a0e-554e-4181-af6a-5db7e7eadbf9';

-- размытое фото
update pack_items set prompt='Размытое фото № 29: животное.', value=100 where id='04eb3406-3d08-4838-b0d9-d5620d6d5ca4';
update pack_items set prompt='Размытое фото № 30: блюдо.', value=300, variants='{"Суси"}' where id='08adbd7f-2176-441f-a61d-63883476865f';
update pack_items set prompt='Размытое фото № 31: животное.', value=400 where id='dab3dffb-8ac4-44a6-a6fb-41c2250d5f98';
update pack_items set prompt='Размытое фото № 32: предмет.', value=200 where id='9e751759-2de4-45b3-a491-9983080cfd8c';

-- выкладка в банк выключенными (логотипы не входят — все rejected)
insert into question_bank (category, prompt, answer, variants, kind, youtube_id, vk_url, image_url, start_seconds, end_seconds, curtain, audio_url, pack_id, value, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page, enabled)
select category, prompt, answer, variants, kind, youtube_id, vk_url, image_url, start_seconds, end_seconds, coalesce(curtain,false), audio_url, pack_id, value, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page, false
from pack_items where status='draft' and pack_id in (
  '297cd6af-00b9-4faf-b7d2-2131c5dfa240',
  '072f828a-a2de-48da-8d90-4afbcd95b6c8',
  'c39cfcf2-8b9f-4d36-a1d5-09f3e47dd2ff',
  '4a6b5bef-21d5-4e70-bd3d-6008a17d8359',
  '3977cc94-331f-4872-846a-5519137ea78e'
)
on conflict (category, prompt) do nothing;

update pack_items set status='approved' where status='draft' and pack_id in (
  '297cd6af-00b9-4faf-b7d2-2131c5dfa240',
  '072f828a-a2de-48da-8d90-4afbcd95b6c8',
  'c39cfcf2-8b9f-4d36-a1d5-09f3e47dd2ff',
  '4a6b5bef-21d5-4e70-bd3d-6008a17d8359',
  '3977cc94-331f-4872-846a-5519137ea78e'
);

update question_packs set status='approved' where id in (
  '297cd6af-00b9-4faf-b7d2-2131c5dfa240',
  '072f828a-a2de-48da-8d90-4afbcd95b6c8',
  'c39cfcf2-8b9f-4d36-a1d5-09f3e47dd2ff',
  '4a6b5bef-21d5-4e70-bd3d-6008a17d8359',
  '3977cc94-331f-4872-846a-5519137ea78e'
);

-- пачка логотипов: все items rejected → failed
update question_packs set status='failed', error='all_logos_had_letters_rejected' where id='38ad7e4d-523d-4903-9961-6f91c20374e1';

commit;
