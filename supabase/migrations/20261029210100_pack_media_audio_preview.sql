-- Медиа в пачках (одобрение копирует их в банк), аудио-превью для
-- музыкальных вопросов и метка пачки в банке — чтобы партию можно было
-- откатить: delete from question_bank where pack_id = '<id>'.

alter table public.question_bank add column if not exists audio_url text;
alter table public.question_bank add column if not exists pack_id uuid
  references public.question_packs (id) on delete set null;
create index if not exists question_bank_pack_idx on public.question_bank (pack_id);
alter table public.questions add column if not exists audio_url text;

alter table public.question_bank drop constraint if exists question_bank_audio_check;
alter table public.question_bank add constraint question_bank_audio_check
  check (audio_url is null or audio_url ~ '^https://audio-ssl\.itunes\.apple\.com/');

alter table public.pack_items add column if not exists youtube_id text;
alter table public.pack_items add column if not exists image_url text;
alter table public.pack_items add column if not exists audio_url text;
alter table public.pack_items add column if not exists start_seconds integer;
alter table public.pack_items add column if not exists end_seconds integer;
alter table public.pack_items add column if not exists media_note text;

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
      rutube_url = b.rutube_url,
      image_url = b.image_url,
      audio_url = b.audio_url,
      start_seconds = b.start_seconds,
      end_seconds = b.end_seconds,
      curtain = b.curtain
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
            WHEN (q.status = 'hidden'::text) THEN NULL::text
            ELSE q.prompt
        END AS prompt,
        CASE
            WHEN (q.status = 'hidden'::text) THEN NULL::text
            ELSE q.special
        END AS special,
        CASE
            WHEN (q.status = 'hidden'::text) THEN NULL::uuid
            ELSE q.assigned_player_id
        END AS assigned_player_id,
        CASE
            WHEN (q.status = 'answered'::text) THEN s.answer
            ELSE NULL::text
        END AS revealed_answer,
        CASE
            WHEN (q.status = 'hidden'::text) THEN 'text'::text
            ELSE q.kind
        END AS kind,
        CASE
            WHEN (q.status = 'hidden'::text) THEN NULL::text
            ELSE q.youtube_id
        END AS youtube_id,
        CASE
            WHEN (q.status = 'hidden'::text) THEN NULL::text
            ELSE q.vk_url
        END AS vk_url,
        CASE
            WHEN (q.status = 'hidden'::text) THEN NULL::text
            ELSE q.rutube_url
        END AS rutube_url,
        CASE
            WHEN ((q.status = 'hidden'::text) OR (q.image_url IS NULL)) THEN NULL::text
            ELSE ('/api/media/image/'::text || (q.id)::text)
        END AS image_url,
        CASE
            WHEN (q.status = 'hidden'::text) THEN NULL::integer
            ELSE q.start_seconds
        END AS start_seconds,
        CASE
            WHEN (q.status = 'hidden'::text) THEN NULL::integer
            ELSE q.end_seconds
        END AS end_seconds,
        CASE
            WHEN (q.status = 'hidden'::text) THEN false
            ELSE q.curtain
        END AS curtain,
        CASE
            WHEN (q.status = 'hidden'::text) THEN NULL::text
            ELSE q.audio_url
        END AS audio_url
   FROM (questions q
     LEFT JOIN question_secrets s ON ((s.question_id = q.id)));
