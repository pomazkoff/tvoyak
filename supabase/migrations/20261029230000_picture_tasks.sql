-- Картиночные задания: ребус, эмодзи-шифр, фрагмент, «найди лишнее»,
-- размытие/пиксели, логотип. Только добавляет колонки и расширяет функции:
-- старый клиент (main) получает картинки kind = 'image' как обычно, а
-- start_game даёт их только комнатам, где сервер поставил
-- room_secrets.picture_tasks = true (новый /api/rooms).
--
-- picture        — формат: rebus | emoji | fragment | hidden | blur | logo
-- picture_spec   — как собрать картинку (ребус, эмодзи, сетка) или эффект
--                  поверх фото (tiles/zoom, blur/pixel, маски).
-- reveal_seconds — сколько секунд картинка раскрывается на экране ведущего,
--                  отсчёт от questions.opened_at (серверное время).
-- image_license  — короткая лицензия, видна во время вопроса;
-- image_credit / image_page — автор и страница файла: только после ответа,
--                  в имени файла Commons часто написан ответ.

alter table public.question_bank add column if not exists picture text;
alter table public.question_bank add column if not exists picture_spec jsonb;
alter table public.question_bank add column if not exists reveal_seconds integer;
alter table public.question_bank add column if not exists image_credit text;
alter table public.question_bank add column if not exists image_license text;
alter table public.question_bank add column if not exists image_page text;
alter table public.question_bank drop constraint if exists question_bank_picture_check;
alter table public.question_bank add constraint question_bank_picture_check check (
  picture is null or picture in ('rebus', 'emoji', 'fragment', 'hidden', 'blur', 'logo')
);
alter table public.question_bank drop constraint if exists question_bank_reveal_check;
alter table public.question_bank add constraint question_bank_reveal_check check (
  reveal_seconds is null or reveal_seconds between 3 and 40
);
alter table public.question_bank drop constraint if exists question_bank_picture_source_check;
alter table public.question_bank add constraint question_bank_picture_source_check check (
  picture is null or (kind = 'image' and (image_url is not null or picture_spec is not null))
);

alter table public.questions add column if not exists picture text;
alter table public.questions add column if not exists picture_spec jsonb;
alter table public.questions add column if not exists reveal_seconds integer;
alter table public.questions add column if not exists image_credit text;
alter table public.questions add column if not exists image_license text;
alter table public.questions add column if not exists image_page text;
alter table public.questions add column if not exists opened_at timestamptz;

alter table public.pack_items add column if not exists picture text;
alter table public.pack_items add column if not exists picture_spec jsonb;
alter table public.pack_items add column if not exists reveal_seconds integer;
alter table public.pack_items add column if not exists image_credit text;
alter table public.pack_items add column if not exists image_license text;
alter table public.pack_items add column if not exists image_page text;

alter table public.room_secrets add column if not exists picture_tasks boolean not null default false;

-- Когда ячейку открыли (hidden → open): от этого момента идёт раскрытие.
create or replace function public.mark_question_opened()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if old.status = 'hidden' and new.status <> 'hidden' and new.opened_at is null then
    new.opened_at := clock_timestamp();
  end if;
  return new;
end;
$function$;
revoke all on function public.mark_question_opened() from public, anon, authenticated;

drop trigger if exists questions_mark_opened on public.questions;
create trigger questions_mark_opened
before update of status on public.questions
for each row execute function public.mark_question_opened();

CREATE OR REPLACE FUNCTION public.copy_question_media()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
            WHEN ((q.status = 'hidden'::text) OR ((q.image_url IS NULL) AND (q.picture_spec IS NULL))) THEN NULL::text
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
        END AS audio_url,
        CASE
            WHEN (q.status = 'hidden'::text) THEN NULL::text
            ELSE q.picture
        END AS picture,
        CASE
            WHEN (q.status = 'hidden'::text) THEN NULL::jsonb
            ELSE (q.picture_spec - 'parts'::text - 'lines'::text - 'base'::text - 'odd'::text)
        END AS picture_fx,
        CASE
            WHEN (q.status = 'hidden'::text) THEN NULL::integer
            ELSE q.reveal_seconds
        END AS reveal_seconds,
        CASE
            WHEN (q.status = 'hidden'::text) THEN NULL::timestamp with time zone
            ELSE q.opened_at
        END AS opened_at,
        CASE
            WHEN (q.status = 'hidden'::text) THEN NULL::text
            ELSE q.image_license
        END AS image_license,
        CASE
            WHEN (q.status = 'answered'::text) THEN q.image_credit
            ELSE NULL::text
        END AS image_credit,
        CASE
            WHEN (q.status = 'answered'::text) THEN q.image_page
            ELSE NULL::text
        END AS image_page
   FROM (questions q
     LEFT JOIN question_secrets s ON ((s.question_id = q.id)));

grant select on public.question_board to anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.open_buzz(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_room_id uuid;
  v_state public.game_states%rowtype;
  v_special text;
  v_version integer;
  v_reveal_end timestamptz;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  select * into v_state from public.game_states where room_id = v_room_id for update;
  if v_state.phase = 'buzzing' then
    return jsonb_build_object('ok', true, 'version', v_state.version);
  end if;
  if v_state.phase <> 'question' or v_state.current_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  select special, opened_at + make_interval(secs => reveal_seconds)
  into v_special, v_reveal_end
  from public.questions where id = v_state.current_question_id;
  if v_special = 'cat' then
    return jsonb_build_object('ok', false, 'error', 'cat_no_buzz');
  end if;

  update public.game_states
  set phase = 'buzzing',
      buzz_winner_player_id = null,
      -- Картинка с постепенным раскрытием: окно кнопки не закрывается
      -- раньше, чем через 6 секунд после полного раскрытия.
      deadline = greatest(
        clock_timestamp() + interval '15 seconds',
        coalesce(v_reveal_end + interval '6 seconds', clock_timestamp())
      ),
      version = version + 1,
      updated_at = clock_timestamp()
  where room_id = v_room_id
  returning version into v_version;

  return jsonb_build_object('ok', true, 'version', v_version);
end;
$function$;

CREATE OR REPLACE FUNCTION public.start_game(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_room public.rooms%rowtype;
  v_count integer;
  v_categories text[];
  v_round integer;
  v_col integer;
  v_row integer;
  v_category text;
  v_faces integer[];
  v_pick record;
  v_question_id uuid;
  v_cats integer;
  v_chooser uuid;
  v_version integer;
  v_company uuid;
  v_pictures boolean;
begin
  select * into v_room
  from public.rooms
  where code = upper(trim(coalesce(p_code, '')))
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;
  if v_room.status <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'already_started');
  end if;

  select count(*) into v_count
  from public.players
  where room_id = v_room.id and role = 'player';

  if v_count < 2 then
    return jsonb_build_object('ok', false, 'error', 'need_players');
  end if;
  if v_count > 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many_players');
  end if;

  select company_id, coalesce(picture_tasks, false) into v_company, v_pictures
  from public.room_secrets
  where room_id = v_room.id;

  -- Сначала темы, где у этой компании осталось хотя бы 5 невиденных
  -- вопросов, затем остальные; внутри — случайно.
  select coalesce(array_agg(category), '{}'::text[])
  into v_categories
  from (
    select b.category
    from public.question_bank b
    left join public.company_seen cs
      on cs.company_id = v_company and cs.bank_id = b.id
    -- Картиночные задания только для комнат нового клиента (флаг в room_secrets).
    where b.picture is null or v_pictures
    group by b.category
    having count(*) >= 10
    order by (count(*) filter (where cs.bank_id is null) >= 5) desc, random()
    limit 12
  ) picked;

  if coalesce(array_length(v_categories, 1), 0) < 12 then
    return jsonb_build_object('ok', false, 'error', 'bank_too_small');
  end if;

  for v_round in 1..2 loop
    v_faces := case
      when v_round = 1 then array[100, 200, 300, 400, 500]
      else array[200, 400, 600, 800, 1000]
    end;
    for v_col in 0..5 loop
      v_category := v_categories[(v_round - 1) * 6 + v_col + 1];
      v_row := 0;
      for v_pick in
        select picked.prompt, picked.answer, picked.variants
        from (
          select b.prompt, b.answer, b.variants, b.value
          from public.question_bank b
          left join public.company_seen cs
            on cs.company_id = v_company and cs.bank_id = b.id
          where b.category = v_category
            and (b.picture is null or v_pictures)
          -- невиденные, потом давно виденные
          order by cs.seen_at asc nulls first, random()
          limit 5
        ) picked
        -- лёгкие вопросы на дешёвые клетки, без оценки — в середину
        order by coalesce(picked.value, 400), random()
      loop
        insert into public.questions (
          room_id, round, category, value, prompt, row_index, col_index, status
        ) values (
          v_room.id, v_round, v_category, v_faces[v_row + 1], v_pick.prompt, v_row, v_col, 'hidden'
        )
        returning id into v_question_id;

        insert into public.question_secrets (question_id, answer, variants)
        values (v_question_id, v_pick.answer, coalesce(v_pick.variants, '{}'));

        v_row := v_row + 1;
      end loop;
    end loop;

    v_cats := 1 + floor(random() * 2)::integer;
    update public.questions
    set special = 'cat'
    where id in (
      select id
      from public.questions
      where room_id = v_room.id and round = v_round
      order by random()
      limit v_cats
    );
  end loop;

  select id into v_chooser
  from public.players
  where room_id = v_room.id and role = 'player'
  order by random()
  limit 1;

  update public.rooms set status = 'round1' where id = v_room.id;
  update public.game_states
  set phase = 'board',
      round = 1,
      chooser_player_id = v_chooser,
      current_question_id = null,
      buzz_winner_player_id = null,
      deadline = null,
      revealed_answer = null,
      version = version + 1,
      updated_at = clock_timestamp()
  where room_id = v_room.id
  returning version into v_version;

  return jsonb_build_object('ok', true, 'version', v_version, 'chooser_player_id', v_chooser);
end;
$function$;

CREATE OR REPLACE FUNCTION public.continue_game(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_room_id uuid;
  v_state public.game_states%rowtype;
  v_hidden integer;
  v_eligible integer;
  v_pick record;
  v_question_id uuid;
  v_chooser uuid;
  v_version integer;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  select * into v_state from public.game_states where room_id = v_room_id for update;
  if v_state.phase <> 'reveal' then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  select count(*) into v_hidden
  from public.questions
  where room_id = v_room_id and round = v_state.round and status = 'hidden';

  if v_hidden > 0 then
    update public.game_states
    set phase = 'board',
        current_question_id = null,
        revealed_answer = null,
        buzz_winner_player_id = null,
        deadline = null,
        version = version + 1,
        updated_at = clock_timestamp()
    where room_id = v_room_id
    returning version into v_version;
    return jsonb_build_object('ok', true, 'phase', 'board', 'version', v_version);
  end if;

  if v_state.round = 1 then
    update public.rooms set status = 'round2' where id = v_room_id;
    update public.game_states
    set phase = 'board',
        round = 2,
        current_question_id = null,
        revealed_answer = null,
        buzz_winner_player_id = null,
        deadline = null,
        version = version + 1,
        updated_at = clock_timestamp()
    where room_id = v_room_id
    returning version into v_version;
    return jsonb_build_object('ok', true, 'phase', 'board', 'version', v_version);
  end if;

  select count(*) into v_eligible
  from public.players
  where room_id = v_room_id and role = 'player' and score > 0;

  if v_eligible = 0 then
    update public.rooms set status = 'finished' where id = v_room_id;
    update public.game_states
    set phase = 'finished',
        current_question_id = null,
        revealed_answer = null,
        deadline = null,
        version = version + 1,
        updated_at = clock_timestamp()
    where room_id = v_room_id
    returning version into v_version;
    return jsonb_build_object('ok', true, 'phase', 'finished', 'version', v_version);
  end if;

  select id into v_chooser
  from public.players
  where room_id = v_room_id and role = 'player' and score > 0
  order by score desc, joined_at
  limit 1;

  select b.prompt, b.answer, b.variants, b.category
  into v_pick
  from public.question_bank b
  left join public.company_seen cs
    on cs.company_id = (
      select rs.company_id from public.room_secrets rs where rs.room_id = v_room_id
    )
    and cs.bank_id = b.id
  -- В финале картинок нет: ставки, 45 секунд и один вопрос на всех.
  where b.picture is null
    and not exists (
    select 1
    from public.questions q
    join public.question_secrets s on s.question_id = q.id
    where q.room_id = v_room_id and q.prompt = b.prompt and s.answer = b.answer
  )
  order by cs.seen_at asc nulls first, random()
  limit 1;

  if not found then
    select prompt, answer, variants, category
    into v_pick
    from public.question_bank
    where picture is null
    order by random()
    limit 1;
  end if;

  insert into public.questions (
    room_id, round, category, value, prompt, row_index, col_index, status
  ) values (
    v_room_id, 3, v_pick.category, 0, v_pick.prompt, 0, 0, 'hidden'
  )
  returning id into v_question_id;

  insert into public.question_secrets (question_id, answer, variants)
  values (v_question_id, v_pick.answer, coalesce(v_pick.variants, '{}'));

  update public.rooms set status = 'final' where id = v_room_id;
  update public.game_states
  set phase = 'wager',
      round = 3,
      current_question_id = v_question_id,
      chooser_player_id = v_chooser,
      revealed_answer = null,
      buzz_winner_player_id = null,
      deadline = clock_timestamp() + interval '60 seconds',
      version = version + 1,
      updated_at = clock_timestamp()
  where room_id = v_room_id
  returning version into v_version;

  return jsonb_build_object('ok', true, 'phase', 'wager', 'version', v_version);
end;
$function$;

notify pgrst, 'reload schema';

-- Проход «picture» в отчёте пачки: формат, однозначность ребуса, лицензия, 200.
alter table public.pack_reviews drop constraint if exists pack_reviews_pass_check;
alter table public.pack_reviews add constraint pack_reviews_pass_check check (
  pass in ('safety', 'fact', 'freshness', 'difficulty', 'duplicates', 'leak', 'picture')
);
