-- Пополнение картиночных заданий 23.11.2026: выкладка в банк ВЫКЛЮЧЕННЫМИ (enabled=false).
-- Включает Илья вручную на /admin/pictures.
-- Задания собраны вручную в scripts/refills/2026-11-23-manual-pictures.ts и прошли reviewDrafts
-- (26/26: ребусы 6, эмодзи 5, найди лишнее 4, фрагмент 4, размытое фото 3, логотипы 4).
-- Применено эквивалентными запросами через PostgREST (service role): SUPABASE_ACCESS_TOKEN на боксе нет.
begin;

insert into question_bank (category, prompt, answer, variants, kind, youtube_id, vk_url, image_url, start_seconds, end_seconds, curtain, audio_url, pack_id, value, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page, enabled)
select category, prompt, answer, variants, kind, youtube_id, vk_url, image_url, start_seconds, end_seconds, coalesce(curtain,false), audio_url, pack_id, value, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page, false
from pack_items where status='draft' and pack_id in (
  'e151bb18-e4e9-4faf-aee8-b47a5321e341','706a872e-c527-4815-9c07-22798ef2aeb2','dcc6cee3-5f4a-41dd-b481-135536841686',
  'a8e9f2a1-47d3-4f8f-8d69-f77fc3c15d28','98ec9de3-9139-4ab7-9553-4b9c19bcfaed','07bd89bb-3c00-45f7-955b-6f794a41dd5e'
)
on conflict (category, prompt) do nothing;

update pack_items set status='approved' where status='draft' and pack_id in (
  'e151bb18-e4e9-4faf-aee8-b47a5321e341','706a872e-c527-4815-9c07-22798ef2aeb2','dcc6cee3-5f4a-41dd-b481-135536841686',
  'a8e9f2a1-47d3-4f8f-8d69-f77fc3c15d28','98ec9de3-9139-4ab7-9553-4b9c19bcfaed','07bd89bb-3c00-45f7-955b-6f794a41dd5e'
);
update question_packs set status='approved' where id in (
  'e151bb18-e4e9-4faf-aee8-b47a5321e341','706a872e-c527-4815-9c07-22798ef2aeb2','dcc6cee3-5f4a-41dd-b481-135536841686',
  'a8e9f2a1-47d3-4f8f-8d69-f77fc3c15d28','98ec9de3-9139-4ab7-9553-4b9c19bcfaed','07bd89bb-3c00-45f7-955b-6f794a41dd5e'
);
commit;
