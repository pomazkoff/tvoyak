-- VK Видео как основной источник видеовопросов, YouTube — запасной.
-- Аддитивно: vk_url уже есть (каноническая video_ext.php-ссылка с hash),
-- добавляем отдельный фрагмент для VK-копии и отметку проверки встраивания.

alter table public.question_bank
  add column if not exists vk_start_seconds integer,
  add column if not exists vk_end_seconds integer,
  add column if not exists vk_checked_at timestamptz;

alter table public.questions
  add column if not exists vk_start_seconds integer,
  add column if not exists vk_end_seconds integer;

alter table public.pack_items
  add column if not exists vk_url text,
  add column if not exists vk_start_seconds integer,
  add column if not exists vk_end_seconds integer;

create or replace function public.copy_question_media()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
begin
  update public.questions q
  set kind = b.kind,
      youtube_id = b.youtube_id,
      vk_url = b.vk_url,
      vk_start_seconds = b.vk_start_seconds,
      vk_end_seconds = b.vk_end_seconds,
      rutube_url = b.rutube_url,
      image_url = b.image_url,
      audio_url = b.audio_url,
      start_seconds = b.start_seconds,
      end_seconds = b.end_seconds,
      curtain = b.curtain,
      picture = b.picture,
      picture_spec = b.picture_spec,
      reveal_seconds = b.reveal_seconds,
      image_credit = b.image_credit,
      image_license = b.image_license,
      image_page = b.image_page
  from public.question_bank b
  where q.id = new.id
    and b.category = new.category
    and b.prompt = new.prompt;
  return new;
end;
$function$;

create or replace view public.question_board
with (security_barrier = true, security_invoker = false) as
 SELECT q.id,
    q.room_id,
    q.round,
    q.category,
    q.value,
    q.row_index,
    q.col_index,
    q.status,
        CASE
            WHEN q.status = 'hidden'::text THEN NULL::text
            ELSE q.prompt
        END AS prompt,
        CASE
            WHEN q.status = 'hidden'::text THEN NULL::text
            ELSE q.special
        END AS special,
        CASE
            WHEN q.status = 'hidden'::text THEN NULL::uuid
            ELSE q.assigned_player_id
        END AS assigned_player_id,
        CASE
            WHEN q.status = 'answered'::text THEN s.answer
            ELSE NULL::text
        END AS revealed_answer,
        CASE
            WHEN q.status = 'hidden'::text THEN 'text'::text
            ELSE q.kind
        END AS kind,
        CASE
            WHEN q.status = 'hidden'::text THEN NULL::text
            ELSE q.youtube_id
        END AS youtube_id,
        CASE
            WHEN q.status = 'hidden'::text THEN NULL::text
            ELSE q.vk_url
        END AS vk_url,
        CASE
            WHEN q.status = 'hidden'::text THEN NULL::text
            ELSE q.rutube_url
        END AS rutube_url,
        CASE
            WHEN q.status = 'hidden'::text OR q.image_url IS NULL AND q.picture_spec IS NULL THEN NULL::text
            ELSE '/api/media/image/'::text || q.id::text
        END AS image_url,
        CASE
            WHEN q.status = 'hidden'::text THEN NULL::integer
            ELSE q.start_seconds
        END AS start_seconds,
        CASE
            WHEN q.status = 'hidden'::text THEN NULL::integer
            ELSE q.end_seconds
        END AS end_seconds,
        CASE
            WHEN q.status = 'hidden'::text THEN false
            ELSE q.curtain
        END AS curtain,
        CASE
            WHEN q.status = 'hidden'::text THEN NULL::text
            ELSE q.audio_url
        END AS audio_url,
        CASE
            WHEN q.status = 'hidden'::text THEN NULL::text
            ELSE q.picture
        END AS picture,
        CASE
            WHEN q.status = 'hidden'::text THEN NULL::jsonb
            ELSE q.picture_spec - 'parts'::text - 'lines'::text - 'base'::text - 'odd'::text
        END AS picture_fx,
        CASE
            WHEN q.status = 'hidden'::text THEN NULL::integer
            ELSE q.reveal_seconds
        END AS reveal_seconds,
        CASE
            WHEN q.status = 'hidden'::text THEN NULL::timestamp with time zone
            ELSE q.opened_at
        END AS opened_at,
        CASE
            WHEN q.status = 'hidden'::text THEN NULL::text
            ELSE q.image_license
        END AS image_license,
        CASE
            WHEN q.status = 'answered'::text THEN q.image_credit
            ELSE NULL::text
        END AS image_credit,
        CASE
            WHEN q.status = 'answered'::text THEN q.image_page
            ELSE NULL::text
        END AS image_page,
        CASE
            WHEN q.status = 'hidden'::text THEN NULL::integer
            ELSE q.vk_start_seconds
        END AS vk_start_seconds,
        CASE
            WHEN q.status = 'hidden'::text THEN NULL::integer
            ELSE q.vk_end_seconds
        END AS vk_end_seconds
   FROM questions q
     LEFT JOIN question_secrets s ON s.question_id = q.id;

grant select on public.question_board to anon, authenticated, service_role;

-- Проход ревью «media»: доступность встраивания VK (и запасной YouTube).
alter table public.pack_reviews drop constraint if exists pack_reviews_pass_check;
alter table public.pack_reviews add constraint pack_reviews_pass_check
  check (pass = any (array['safety','fact','freshness','difficulty','duplicates','leak','picture','media']));
