-- Пополнение картиночных заданий 27.11.2026: выкладка в банк ВЫКЛЮЧЕННЫМИ (enabled=false).
-- Включает Илья вручную на /admin/pictures.
-- Задания собраны вручную в scripts/refills/2026-11-27-manual-pictures.ts и прошли reviewDrafts
-- (28/30: ребусы 6, эмодзи 6, найди лишнее 4, фрагмент 3, размытое фото 4, логотипы 5;
--  отбракованы «Собор Парижской Богоматери» — имя файла выдаёт ответ, Netflix — «стриминговый сервис» в подсказке).
-- Применено эквивалентными запросами через PostgREST (service role): SUPABASE_ACCESS_TOKEN на боксе нет.
begin;

insert into question_bank (category, prompt, answer, variants, kind, youtube_id, vk_url, image_url, start_seconds, end_seconds, curtain, audio_url, pack_id, value, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page, enabled)
select category, prompt, answer, variants, kind, youtube_id, vk_url, image_url, start_seconds, end_seconds, coalesce(curtain,false), audio_url, pack_id, value, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page, false
from pack_items where status='draft' and pack_id in (
  'ad6eeea0-b04e-4218-8c08-a53e3ed7eee6','4af6faa3-81ba-45a0-ad33-f4124dd1e528','790ef8fe-27ed-4cb3-82ec-2abce072dbe3',
  '645f9fad-7fd0-4490-b34e-66bfc0f75d65','27abdf90-d89b-4786-8aa2-85f89a88ba6a','56dc490a-085c-4a06-855d-bfa47cde4f65'
)
on conflict (category, prompt) do nothing;

update pack_items set status='approved' where status='draft' and pack_id in (
  'ad6eeea0-b04e-4218-8c08-a53e3ed7eee6','4af6faa3-81ba-45a0-ad33-f4124dd1e528','790ef8fe-27ed-4cb3-82ec-2abce072dbe3',
  '645f9fad-7fd0-4490-b34e-66bfc0f75d65','27abdf90-d89b-4786-8aa2-85f89a88ba6a','56dc490a-085c-4a06-855d-bfa47cde4f65'
);
update question_packs set status='approved' where id in (
  'ad6eeea0-b04e-4218-8c08-a53e3ed7eee6','4af6faa3-81ba-45a0-ad33-f4124dd1e528','790ef8fe-27ed-4cb3-82ec-2abce072dbe3',
  '645f9fad-7fd0-4490-b34e-66bfc0f75d65','27abdf90-d89b-4786-8aa2-85f89a88ba6a','56dc490a-085c-4a06-855d-bfa47cde4f65'
);
commit;
