-- Пополнение картиночных заданий 16.11.2026: выкладка в банк ВЫКЛЮЧЕННЫМИ (enabled=false).
-- Включает Илья вручную на /admin/pictures.
-- Задания собраны вручную в scripts/refills/2026-11-16-manual-pictures.ts и прошли reviewDrafts
-- (отбраковано 1: «Петра» — имя файла Commons выдаёт ответ).
-- Применено эквивалентными запросами через PostgREST (service role): токена Supabase Management API на боксе нет.
begin;

-- нумерация фрагментов подряд после отбраковки «Петры» (№ 38)
update pack_items set prompt='По фрагменту № 38: достопримечательность.' where id='02e564fb-e1c5-426e-acd2-72660052b5c7'; -- Чичен-Ица
update pack_items set prompt='По фрагменту № 39: достопримечательность.' where id='3d2c64c3-783e-4fa1-8eea-30eccd1825a3'; -- Бурдж-Халифа

insert into question_bank (category, prompt, answer, variants, kind, youtube_id, vk_url, image_url, start_seconds, end_seconds, curtain, audio_url, pack_id, value, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page, enabled)
select category, prompt, answer, variants, kind, youtube_id, vk_url, image_url, start_seconds, end_seconds, coalesce(curtain,false), audio_url, pack_id, value, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page, false
from pack_items where status='draft' and pack_id in (
  '3f77aadb-b0e8-4fd0-8a7e-6cbdaf7bf5c6','4eec96e5-74c1-4860-8d34-005e47ee7a36','f4ecd612-3267-4093-bf9f-86212e35d2d6',
  '106835cf-f5d6-4291-b3ab-4c6423cee7b0','494d12a8-2c4f-42cf-b3c4-dbf30659b123','3ae23c55-a60a-4297-ad1b-74956e11112d'
)
on conflict (category, prompt) do nothing;

update pack_items set status='approved' where status='draft' and pack_id in (
  '3f77aadb-b0e8-4fd0-8a7e-6cbdaf7bf5c6','4eec96e5-74c1-4860-8d34-005e47ee7a36','f4ecd612-3267-4093-bf9f-86212e35d2d6',
  '106835cf-f5d6-4291-b3ab-4c6423cee7b0','494d12a8-2c4f-42cf-b3c4-dbf30659b123','3ae23c55-a60a-4297-ad1b-74956e11112d'
);
update question_packs set status='approved' where id in (
  '3f77aadb-b0e8-4fd0-8a7e-6cbdaf7bf5c6','4eec96e5-74c1-4860-8d34-005e47ee7a36','f4ecd612-3267-4093-bf9f-86212e35d2d6',
  '106835cf-f5d6-4291-b3ab-4c6423cee7b0','494d12a8-2c4f-42cf-b3c4-dbf30659b123','3ae23c55-a60a-4297-ad1b-74956e11112d'
);
commit;
