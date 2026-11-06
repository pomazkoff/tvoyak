-- «Я не у экрана»: удалённый игрок видит вопрос, картинку и медиа на телефоне.
-- Только добавления: колонка игрока, отметка старта медиа и её выдача в question_board.

alter table public.players
  add column if not exists remote boolean not null default false;

comment on column public.players.remote is
  'Игрок не видит общий экран: телефон показывает поле, вопрос, картинки и медиа.';

create or replace function public.set_player_remote(
  p_code text,
  p_player_token text,
  p_on boolean
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_player_id uuid;
begin
  if p_player_token is null or char_length(p_player_token) < 8 then
    return jsonb_build_object('ok', false, 'error', 'bad_token');
  end if;
  select p.id into v_player_id
  from public.players p
  join public.rooms r on r.id = p.room_id
  join public.player_secrets s on s.player_id = p.id
  where r.code = upper(trim(p_code))
    and s.token_hash = public.hash_secret(p_player_token);
  if v_player_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_in_room');
  end if;
  update public.players set remote = coalesce(p_on, false) where id = v_player_id;
  return jsonb_build_object('ok', true, 'remote', coalesce(p_on, false));
end;
$$;

revoke all on function public.set_player_remote(text, text, boolean) from public;
grant execute on function public.set_player_remote(text, text, boolean)
  to anon, authenticated, service_role;

-- Когда на общем экране запустилось видео или трек вопроса (серверное время).
-- Удалённые телефоны стартуют с той же секунды фрагмента.
alter table public.questions
  add column if not exists media_started_at timestamptz;

comment on column public.questions.media_started_at is
  'Старт медиа вопроса на общем экране: автозапуск при открытии листа или кнопка ведущего.';

-- Автозапуск: экран ведущего включает медиа, как только вопрос показан
-- (любая фаза, кроме поля и «кота в мешке»). Если трек включает живой ведущий
-- (host_starts_media), отметку ставит его кнопка — mark_media_started.
create or replace function public.game_states_mark_media()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.current_question_id is null
     or new.phase in ('lobby', 'board', 'cat_pick', 'finished') then
    return new;
  end if;
  update public.questions q
  set media_started_at = clock_timestamp()
  from public.rooms r
  where q.id = new.current_question_id
    and r.id = q.room_id
    and q.media_started_at is null
    and q.kind in ('video', 'music')
    and not (r.host_mode = 'human' and r.host_starts_media);
  return new;
end;
$$;

revoke all on function public.game_states_mark_media() from public, anon, authenticated;

drop trigger if exists game_states_mark_media on public.game_states;
create trigger game_states_mark_media
  after insert or update of phase, current_question_id on public.game_states
  for each row execute function public.game_states_mark_media();

-- Кнопка «Включить трек/видео» на экране ведущего: старт сейчас.
create or replace function public.mark_media_started(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_room_id uuid;
  v_question_id uuid;
begin
  select r.id, g.current_question_id into v_room_id, v_question_id
  from public.rooms r
  join public.game_states g on g.room_id = r.id
  where r.code = upper(trim(p_code));
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;
  if v_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;
  update public.questions
  set media_started_at = clock_timestamp()
  where id = v_question_id and room_id = v_room_id and status <> 'hidden';
  -- Будим realtime телефонов (они подписаны на game_states).
  update public.game_states set updated_at = now() where room_id = v_room_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.mark_media_started(text) from public, anon, authenticated;
grant execute on function public.mark_media_started(text) to service_role;

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
        END AS vk_end_seconds,
        CASE
            WHEN q.status = 'hidden'::text THEN NULL::text
            ELSE q.audio_fx
        END AS audio_fx,
        CASE
            WHEN q.status = 'hidden'::text THEN NULL::timestamp with time zone
            ELSE q.media_started_at
        END AS media_started_at
   FROM questions q
     LEFT JOIN question_secrets s ON s.question_id = q.id;

grant select on public.question_board to anon, authenticated, service_role;
