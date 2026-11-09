-- Пополнение картиночных заданий 09.11.2026: правки черновиков и выкладка в банк ВЫКЛЮЧЕННЫМИ (enabled=false).
-- Включает Илья вручную на /admin/pictures. Выполнялось через Supabase Management API.
begin;

-- отбраковка логотипов с буквами названия (как 30.10 и 06.11)
update pack_items set status='rejected' where id in (
  '0e8540cd-d6d3-4dfa-acad-22e7b1921026', -- Pepsi
  '1091fc3c-85c4-41ca-a837-c005510c49d1', -- NASA
  '95e836b8-962f-4276-8566-518ab70a4370', -- BMW
  '44ad8beb-bd8a-47d6-b2cf-bbd8adb50aee', -- Greenpeace
  '02ae9d28-8af3-47c1-933b-5628113e8f95'  -- Burger King
);

-- нумерация и подсказки в промптах
update pack_items set prompt='Ребус № 149. Слово из 9 букв.', value=300 where id='4edf27fe-5142-46fd-88be-681650bb20ba'; -- Коромысло
update pack_items set prompt='Эмодзи-шифр № 80: мультфильм.' where id='280f8040-2cf1-4677-b618-89e340883663';
update pack_items set prompt='Эмодзи-шифр № 81: фильм.' where id='43ea0950-f99a-4d33-8f5a-ad773bd36d5f';
update pack_items set prompt='Эмодзи-шифр № 82: песня.' where id='65bea462-0f90-46d2-917f-97e137a219d9';
update pack_items set prompt='Эмодзи-шифр № 83: сказка.' where id='d18ba9ea-9b10-42b9-aa81-d4eeebec8128';
update pack_items set prompt='Найди лишнее № 114: что здесь лишнее?' where id='a75d0900-03a3-499e-beac-7be747aef925';
update pack_items set prompt='По фрагменту № 31: достопримечательность.' where id='2223fc5a-65cd-4fc4-b9c8-9b4910255987';
update pack_items set prompt='По фрагменту № 32: достопримечательность.' where id='73fa822a-8beb-4842-a318-6fe22f1e5551';
update pack_items set prompt='По фрагменту № 33: достопримечательность.' where id='398f5777-6133-4c69-90ff-363eb3071928';
update pack_items set prompt='Размытое фото № 33: животное.' where id='8475b855-490e-4b3e-9bd0-d889ff7555e4';
update pack_items set prompt='Размытое фото № 34: блюдо.' where id='60f3889d-7c3b-424b-9c56-37c10123c2e4';
update pack_items set prompt='Размытое фото № 35: фрукт.' where id='b2d187df-35eb-465d-9f10-b2e4f0be3675';
update pack_items set prompt='Размытое фото № 36: животное.' where id='2e20eea3-f1c8-41a7-9e91-7c34fc85a58f';

insert into question_bank (category, prompt, answer, variants, kind, youtube_id, vk_url, image_url, start_seconds, end_seconds, curtain, audio_url, pack_id, value, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page, enabled)
select category, prompt, answer, variants, kind, youtube_id, vk_url, image_url, start_seconds, end_seconds, coalesce(curtain,false), audio_url, pack_id, value, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page, false
from pack_items where status='draft' and pack_id in (
  '8350df61-841d-4898-9490-1f060ed0bd9f','ad59abc1-2ac6-4e0b-8797-6056e0011acd','02533425-2fb4-4952-9f71-28775fad25ce',
  'eb64c503-0715-4e6d-89fc-9493b5dd5909','41b39bcf-4693-4daa-86c3-68ed99de00aa','73fe409a-3bb1-4440-a924-e251ebc983a5',
  '5fbbcb73-a71a-4568-8c36-60e1f39b0f35'
)
on conflict (category, prompt) do nothing;

update pack_items set status='approved' where status='draft' and pack_id in (
  '8350df61-841d-4898-9490-1f060ed0bd9f','ad59abc1-2ac6-4e0b-8797-6056e0011acd','02533425-2fb4-4952-9f71-28775fad25ce',
  'eb64c503-0715-4e6d-89fc-9493b5dd5909','41b39bcf-4693-4daa-86c3-68ed99de00aa','73fe409a-3bb1-4440-a924-e251ebc983a5',
  '5fbbcb73-a71a-4568-8c36-60e1f39b0f35'
);
update question_packs set status='approved' where id in (
  '8350df61-841d-4898-9490-1f060ed0bd9f','ad59abc1-2ac6-4e0b-8797-6056e0011acd','02533425-2fb4-4952-9f71-28775fad25ce',
  'eb64c503-0715-4e6d-89fc-9493b5dd5909','41b39bcf-4693-4daa-86c3-68ed99de00aa','73fe409a-3bb1-4440-a924-e251ebc983a5',
  '5fbbcb73-a71a-4568-8c36-60e1f39b0f35'
);
-- пачки без годных заданий (логотипы с буквами / пусто) → failed
update question_packs set status='failed', error='all_rejected_or_empty' where id in (
  'c10d2762-57e3-400f-8521-36b580a73c05','d03b4449-8904-4d11-aba1-b80e7fdc75b9','e7053522-7723-4607-af0d-c1c82934f586',
  '2cf15dd3-609a-4695-bc0a-e89d0dc9d914','d94ea0b2-771b-4d79-b23c-98a2b9ba9502','ec69074f-965e-44c9-998d-278d6f18dff6','9c25132e-6ebc-4711-98c3-11770ccc3414'
);
commit;
