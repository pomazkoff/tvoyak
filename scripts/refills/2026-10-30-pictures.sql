-- Пополнение картиночных заданий 30.10.2026: правки черновиков и выкладка в банк ВЫКЛЮЧЕННЫМИ (enabled=false).
-- Включает Илья вручную на /admin/pictures. Выполнялось через Supabase Management API.
begin;
-- отбраковка
update pack_items set status='rejected' where id in (
 'c94d7ccb-c9bc-46ee-b107-26556e0518b3', -- ребус Пингвин: на картинке сам пингвин
 'b57e147a-29a7-4f1b-91b7-7ac9b525697d', -- дубль Батат (вариант «Картошка» неверный)
 '655fffae-7860-4c9c-bb66-cabc3e6cbae7', -- Заяц 🐰 среди 🐇 — оба кролики, ответ неоднозначен
 'a0a4137c-afea-42b7-8b84-2da839ac9037', -- Хомяк 🐹/🐭 уже есть в банке
 '7a4fc358-55c5-4c25-afe1-4ad5723d1927', -- Adidas: на файле надпись
 '03aae586-3922-42de-9d20-4270eb9f6182', -- BMW: буквы на эмблеме
 '15175b76-cbd3-4f90-8238-5ca229c0a218'  -- Pepsi: надпись
);
-- ребусы
update pack_items set prompt='Ребус № 28. Слово из 6 букв.', value=200 where id='33cd81ef-3cad-4035-80a4-39de7a6df900';
update pack_items set prompt='Ребус № 29. Слово из 10 букв.', value=300 where id='7675354b-3027-4a1e-aa68-ee2548630520';
update pack_items set prompt='Ребус № 30. Слово из 8 букв.', value=200 where id='fc05a09c-56ec-44ac-a90e-4792a8ab4c6a';
-- эмодзи-шифр
update pack_items set prompt='Эмодзи-шифр № 27: пословица.' where id='e8d1cb38-f514-4c1a-86d3-2693c26f6fc2';
update pack_items set prompt='Эмодзи-шифр № 28: песня.' where id='75f9ec8d-a306-42a2-b948-6d1072489be7';
update pack_items set prompt='Эмодзи-шифр № 29: фильм.' where id='d1a92fcf-0523-41c1-bcd5-b00a18e6333c';
update pack_items set prompt='Эмодзи-шифр № 30: сказка.' where id='3989fc7d-f035-441f-980d-592d3f10a48a';
update pack_items set prompt='Эмодзи-шифр № 31: мультфильм.', value=500 where id='b07ea517-c4e5-4de7-a74f-0012ccebd544';
-- найди лишнее
update pack_items set prompt='Найди лишнее № 23: что здесь лишнее?', value=300, variants='{"Сладкий картофель"}' where id='85415623-def0-49f1-b3fc-e0de2586d7de';
update pack_items set prompt='Найди лишнее № 24: что здесь лишнее?', value=200 where id='6618b15c-7a9c-4370-b960-38049073efa8';
update pack_items set prompt='Найди лишнее № 25: что здесь лишнее?', value=300 where id='dbb9af23-10c8-4760-884d-05ac8a5bff24';
update pack_items set prompt='Найди лишнее № 26: что здесь лишнее?', value=400 where id='84204d30-36a5-473f-9d8c-25d6d9846426';
-- по фрагменту
update pack_items set prompt='По фрагменту № 22: достопримечательность.' where id='07bc4053-1b18-4a7c-90d1-64cd9c9b27b2';
update pack_items set prompt='По фрагменту № 23: достопримечательность.' where id='008c9b14-cfa4-4ff0-b1ef-aad58daac315';
update pack_items set prompt='По фрагменту № 24: сооружение.' where id='39c77e78-1a7d-4061-b3a0-e815b0e466a3';
update pack_items set prompt='По фрагменту № 25: здание.' where id='0e003a03-935a-4e63-b6eb-d45549ab9593';
update pack_items set prompt='По фрагменту № 26: достопримечательность.' where id='8eee363e-0457-4e93-bec6-e38a81c60f66';
update pack_items set prompt='По фрагменту № 27: сооружение.' where id='2cde487d-8520-47a7-9a0d-8b86187681fc';
-- размытое фото
update pack_items set prompt='Размытое фото № 24: фрукт.', value=300 where id='4e08c1bd-7c54-4b71-a4e0-cad7de2d867d';
update pack_items set prompt='Размытое фото № 25: животное.', value=100 where id='84afa6a4-3f3e-43bb-bf6d-702874ab7735';
update pack_items set prompt='Размытое фото № 26: предмет.', value=300, variants='{"Часы"}' where id='84b2d3f0-cae5-4f7d-b3ac-847bdb1c6692';
update pack_items set prompt='Размытое фото № 27: цветок.', value=200 where id='2ff797ff-8f36-43d0-8d05-34aeb6b6f66a';
update pack_items set prompt='Размытое фото № 28: фрукт.', value=100 where id='adf2c31b-5980-4dbb-8697-399910187a96';
-- логотипы (только Commons public domain, без букв названия)
update pack_items set prompt='Логотип № 26: автомобили.', value=300, variants='{"Ауди"}', picture_spec='{"effect":"tiles"}' where id='ed26515d-358e-493e-85c5-e8210481dae1';
insert into pack_items (pack_id, category, prompt, answer, variants, value, kind, status, picture, picture_spec, reveal_seconds, image_url, image_credit, image_license, image_page) values
('5aeca1db-6e11-48d5-9ba4-a0e1ff4e5232','Логотипы','Логотип № 27: автомобили.','Chevrolet','{"Шевроле","Шевролет"}',500,'image','draft','logo','{"effect":"blur"}',12,'https://commons.wikimedia.org/wiki/Special:FilePath/Chevrolet_bowtie_2023.svg?width=960','Chevrolet · Public domain · Wikimedia Commons','Public domain','https://commons.wikimedia.org/wiki/File:Chevrolet_bowtie_2023.svg'),
('5aeca1db-6e11-48d5-9ba4-a0e1ff4e5232','Логотипы','Логотип № 28: приложение.','Google Maps','{"Гугл Карты","Google Карты","Карты Google","Гугл Мапс"}',300,'image','draft','logo','{"effect":"blur"}',12,'https://commons.wikimedia.org/wiki/Special:FilePath/Google_Maps_icon_(2020).svg?width=960','Google Inc. · Public domain · Wikimedia Commons','Public domain','https://commons.wikimedia.org/wiki/File:Google_Maps_icon_(2020).svg'),
('5aeca1db-6e11-48d5-9ba4-a0e1ff4e5232','Логотипы','Логотип № 29: автомобили.','Renault','{"Рено"}',400,'image','draft','logo','{"effect":"tiles"}',12,'https://commons.wikimedia.org/wiki/Special:FilePath/Renault_2021.svg?width=960','Renault · Public domain · Wikimedia Commons','Public domain','https://commons.wikimedia.org/wiki/File:Renault_2021.svg'),
('5aeca1db-6e11-48d5-9ba4-a0e1ff4e5232','Логотипы','Логотип № 30: стриминг.','Twitch','{"Твич"}',400,'image','draft','logo','{"effect":"blur"}',12,'https://commons.wikimedia.org/wiki/Special:FilePath/Twitch_Glitch_Logo_Purple.svg?width=960','Twitch Interactive, Inc. · Public domain · Wikimedia Commons','Public domain','https://commons.wikimedia.org/wiki/File:Twitch_Glitch_Logo_Purple.svg');
-- выкладка в банк выключенными
insert into question_bank (category, prompt, answer, variants, kind, youtube_id, vk_url, image_url, start_seconds, end_seconds, curtain, audio_url, pack_id, value, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page, enabled)
select category, prompt, answer, variants, kind, youtube_id, vk_url, image_url, start_seconds, end_seconds, coalesce(curtain,false), audio_url, pack_id, value, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page, false
from pack_items where status='draft' and pack_id in ('b4b13d6a-a7fe-49a9-ad6f-9505eae63e98','bc49a9f1-8dee-4839-b741-78f739b37f8f','d3aaf227-a22f-46d0-830c-a3b7dd0f3aa8','a38c5d69-5912-455b-bba2-54b6d63df51e','830feab6-c29c-43c4-99d1-a2f37db5097d','5aeca1db-6e11-48d5-9ba4-a0e1ff4e5232')
on conflict (category, prompt) do nothing;
update pack_items set status='approved' where status='draft' and pack_id in ('b4b13d6a-a7fe-49a9-ad6f-9505eae63e98','bc49a9f1-8dee-4839-b741-78f739b37f8f','d3aaf227-a22f-46d0-830c-a3b7dd0f3aa8','a38c5d69-5912-455b-bba2-54b6d63df51e','830feab6-c29c-43c4-99d1-a2f37db5097d','5aeca1db-6e11-48d5-9ba4-a0e1ff4e5232');
update question_packs set status='approved' where id in ('b4b13d6a-a7fe-49a9-ad6f-9505eae63e98','bc49a9f1-8dee-4839-b741-78f739b37f8f','d3aaf227-a22f-46d0-830c-a3b7dd0f3aa8','a38c5d69-5912-455b-bba2-54b6d63df51e','830feab6-c29c-43c4-99d1-a2f37db5097d','5aeca1db-6e11-48d5-9ba4-a0e1ff4e5232');
commit;
