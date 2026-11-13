-- Пополнение картиночных заданий 13.11.2026: правки черновиков и выкладка в банк ВЫКЛЮЧЕННЫМИ (enabled=false).
-- Включает Илья вручную на /admin/pictures.
-- Автогенерация (GROW_PICTURES) почти всё отбраковала (повторы ответов, несуществующие файлы Commons),
-- поэтому задания собраны вручную в scripts/refills/2026-11-13-manual-pictures.ts и прошли тот же reviewDrafts.
-- Применено эквивалентными запросами через PostgREST (service role): токена Supabase Management API на боксе нет.
begin;

-- автоматический ребус «Подарок» тавтологичен (картинка подарка = ответ) — отбраковка
update pack_items set status='rejected' where id='7401da2b-5ce6-415a-9f9f-021644ce064a';

-- нумерация ребусов подряд
update pack_items set prompt='Ребус № 150. Слово из 5 букв.' where id='359df13f-171f-48be-b20c-c468dacace1f'; -- Сырок
update pack_items set prompt='Ребус № 151. Слово из 6 букв.' where id='a55c9429-63bf-4206-b8cf-6a1309fd04d2'; -- Лисица
update pack_items set prompt='Ребус № 152. Слово из 6 букв.' where id='04f583de-94a2-4b2e-b957-938f6d1d70cd'; -- Стопка

insert into question_bank (category, prompt, answer, variants, kind, youtube_id, vk_url, image_url, start_seconds, end_seconds, curtain, audio_url, pack_id, value, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page, enabled)
select category, prompt, answer, variants, kind, youtube_id, vk_url, image_url, start_seconds, end_seconds, coalesce(curtain,false), audio_url, pack_id, value, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page, false
from pack_items where status='draft' and pack_id in (
  '64d269d8-35ec-4b01-b866-fbe9c10e0f0f','b1168162-5340-4a6c-a7c0-fa1dbc803ebd','f0c4c43b-c968-4fe8-bad9-23c922bbedbb',
  'a08fba03-89f8-4720-b4f1-41c073952f86','18df8cf8-6b2c-41cf-8897-f21560d16245','292ee7d6-5e56-4cd2-bf53-dc2390a5d62d',
  '46fadc77-ed8e-485a-8941-45a9660158c7'
)
on conflict (category, prompt) do nothing;

update pack_items set status='approved' where status='draft' and pack_id in (
  '64d269d8-35ec-4b01-b866-fbe9c10e0f0f','b1168162-5340-4a6c-a7c0-fa1dbc803ebd','f0c4c43b-c968-4fe8-bad9-23c922bbedbb',
  'a08fba03-89f8-4720-b4f1-41c073952f86','18df8cf8-6b2c-41cf-8897-f21560d16245','292ee7d6-5e56-4cd2-bf53-dc2390a5d62d',
  '46fadc77-ed8e-485a-8941-45a9660158c7'
);
update question_packs set status='approved' where id in (
  '64d269d8-35ec-4b01-b866-fbe9c10e0f0f','b1168162-5340-4a6c-a7c0-fa1dbc803ebd','f0c4c43b-c968-4fe8-bad9-23c922bbedbb',
  'a08fba03-89f8-4720-b4f1-41c073952f86','18df8cf8-6b2c-41cf-8897-f21560d16245','292ee7d6-5e56-4cd2-bf53-dc2390a5d62d',
  '46fadc77-ed8e-485a-8941-45a9660158c7'
);
-- автоматические пачки без годных заданий (и hidden, оборванная сетевой ошибкой) → failed
update question_packs set status='failed', error='all_rejected_or_empty' where id in (
  '519d01f3-ef5e-432c-8e28-fc9055f1858f','6c9841d9-b207-4e65-8613-ccb35fba1b02','b1724771-34a6-472d-9811-347dd42dcf28',
  '928c6408-4079-4e36-a06e-b08daa27c4c1'
);
commit;
