-- Режим «Вместе»: общий счёт команды. Колонки с дефолтом, старые комнаты
-- остаются «против друг друга» (play_mode = versus). Функции соревнования
-- не переписываются, кроме двух точечных развилок:
--   * start_game пускает одного игрока только во «Вместе»;
--   * continue_game после второго раунда заканчивает «Вместе» без финала
--     со ставками (финал завязан на личные очки);
--   * pass_question в «Вместе» считает промах команды (серия с нуля, без штрафа).
--
-- Очки: вопрос закрывается один раз. Верно ответил хотя бы один — команда
-- получает номинал × серия (×1, ×2, ×3 и дальше потолок). Промах серии не
-- наказывает вычитанием. Личный score — вклад того, кто закрыл вопрос.

alter table public.rooms
  add column if not exists play_mode text not null default 'versus';

alter table public.rooms drop constraint if exists rooms_play_mode_check;
alter table public.rooms
  add constraint rooms_play_mode_check
  check (play_mode in ('versus', 'together'));

alter table public.rooms
  add column if not exists team_score integer not null default 0;

alter table public.rooms
  add column if not exists team_streak integer not null default 0;

alter table public.rooms
  add column if not exists team_best_streak integer not null default 0;

alter table public.rooms
  add column if not exists team_correct integer not null default 0;

alter table public.rooms
  add column if not exists team_played integer not null default 0;

-- Рекорд компании до этой партии. null — сравнивать не с чем.
alter table public.rooms
  add column if not exists team_record integer;

comment on column public.rooms.play_mode is
  'versus — игроки соревнуются (по умолчанию). together — общий счёт команды.';

comment on column public.rooms.team_score is
  'Общий счёт режима «Вместе». В соревновании остаётся 0.';

comment on column public.rooms.team_streak is
  'Текущая серия верных вопросов команды. Множитель least(серия, 3).';

comment on column public.rooms.team_record is
  'Лучший общий счёт этой компании до текущей партии «Вместе».';

grant select (
  play_mode,
  team_score,
  team_streak,
  team_best_streak,
  team_correct,
  team_played,
  team_record
) on table public.rooms to anon, authenticated;

create table if not exists public.together_records (
  company_id uuid primary key,
  best_score integer not null,
  best_correct integer not null,
  updated_at timestamptz not null default now()
);

comment on table public.together_records is
  'Лучший общий счёт компании в режиме «Вместе». Не рейтинг игроков.';

alter table public.together_records enable row level security;

revoke all on table public.together_records from public, anon, authenticated;
grant all on table public.together_records to service_role;

-- Промах команды: серия с нуля, вопрос засчитан сыгранным, очки не снимаются.
create or replace function public.together_note_miss(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  update public.rooms
  set team_streak = 0,
      team_played = team_played + 1
  where id = p_room_id
    and play_mode = 'together';
end;
$$;

-- Запоминает прошлый рекорд на комнате и обновляет рекорд компании.
create or replace function public.together_save_record(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_company uuid;
  v_score integer;
  v_correct integer;
  v_prev integer;
begin
  select team_score, team_correct into v_score, v_correct
  from public.rooms
  where id = p_room_id;

  select company_id into v_company
  from public.room_secrets
  where room_id = p_room_id;

  if v_company is null then
    update public.rooms set team_record = null where id = p_room_id;
    return;
  end if;

  select best_score into v_prev
  from public.together_records
  where company_id = v_company;

  update public.rooms set team_record = v_prev where id = p_room_id;

  insert into public.together_records (company_id, best_score, best_correct)
  values (v_company, v_score, v_correct)
  on conflict (company_id) do update
    set best_score = greatest(public.together_records.best_score, excluded.best_score),
        best_correct = case
          when excluded.best_score > public.together_records.best_score
            then excluded.best_correct
          else public.together_records.best_correct
        end,
        updated_at = now();
end;
$$;

-- Открыть вопрос всей команде. Токен игрока нужен, только если зовёт телефон:
-- с вопросом (пока ведущий читает) телефон открыть не может.
-- p_player_token null — ход ведущего, уже проверенный на сервере.
create or replace function public.together_open(
  p_code text,
  p_player_token text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_room public.rooms%rowtype;
  v_state public.game_states%rowtype;
  v_player public.players%rowtype;
  v_version integer;
begin
  select * into v_room
  from public.rooms
  where code = upper(trim(coalesce(p_code, '')));

  if not found then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;
  if v_room.play_mode is distinct from 'together' then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  if p_player_token is not null then
    v_player := public.lookup_player(v_room.id, p_player_token);
    if v_player.id is null then
      return jsonb_build_object('ok', false, 'error', 'player_not_found');
    end if;
    if v_player.role <> 'player' then
      return jsonb_build_object('ok', false, 'error', 'spectators_cannot_buzz');
    end if;
  end if;

  -- Сначала партия, как в tick_room: комнату блокирует уже само обновление счёта.
  select * into v_state
  from public.game_states
  where room_id = v_room.id
  for update;

  if v_state.phase = 'answering' then
    return jsonb_build_object('ok', true, 'version', v_state.version, 'phase', 'answering');
  end if;

  if p_player_token is not null and v_state.phase = 'question' then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  if v_state.phase not in ('question', 'buzzing', 'cat_pick')
     or v_state.current_question_id is null
  then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  update public.questions
  set status = 'open',
      assigned_player_id = null
  where id = v_state.current_question_id
    and status is distinct from 'answered';

  update public.game_states
  set phase = 'answering',
      buzz_winner_player_id = null,
      deadline = clock_timestamp() + interval '30 seconds',
      version = version + 1,
      updated_at = clock_timestamp()
  where room_id = v_room.id
  returning version into v_version;

  return jsonb_build_object('ok', true, 'version', v_version, 'phase', 'answering');
end;
$$;

-- Принять текст любого игрока команды. Кот и кнопка здесь не разводят стол.
create or replace function public.together_begin(
  p_code text,
  p_player_token text,
  p_text text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_room_id uuid;
  v_player public.players%rowtype;
  v_state public.game_states%rowtype;
  v_secret public.question_secrets%rowtype;
  v_mode text;
  v_answer_id uuid;
  v_verdict text;
  v_phase text;
  v_text text := left(btrim(coalesce(p_text, '')), 300);
  v_opened jsonb;
begin
  if v_text = '' then
    return jsonb_build_object('ok', false, 'error', 'empty_answer');
  end if;

  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  if (select play_mode from public.rooms where id = v_room_id) is distinct from 'together' then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  v_player := public.lookup_player(v_room_id, p_player_token);
  if v_player.id is null then
    return jsonb_build_object('ok', false, 'error', 'player_not_found');
  end if;
  if v_player.role <> 'player' then
    return jsonb_build_object('ok', false, 'error', 'spectators_cannot_buzz');
  end if;

  select phase into v_phase
  from public.game_states
  where room_id = v_room_id;

  if v_phase in ('buzzing', 'cat_pick') then
    v_opened := public.together_open(p_code, p_player_token);
    if coalesce((v_opened->>'ok')::boolean, false) is not true then
      return v_opened;
    end if;
  end if;

  select * into v_state
  from public.game_states
  where room_id = v_room_id
  for update;

  if v_state.phase <> 'answering' or v_state.current_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  if v_state.deadline is not null and clock_timestamp() > v_state.deadline then
    return jsonb_build_object('ok', false, 'error', 'too_late');
  end if;

  select verdict into v_verdict
  from public.answers
  where question_id = v_state.current_question_id
    and player_id = v_player.id;

  if v_verdict is not null and v_verdict <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'team_tried');
  end if;

  select * into v_secret
  from public.question_secrets
  where question_id = v_state.current_question_id;

  select host_mode into v_mode from public.rooms where id = v_room_id;

  if v_verdict is null then
    insert into public.answers (
      room_id, question_id, player_id, raw_text, normalized_text, verdict
    ) values (
      v_room_id, v_state.current_question_id, v_player.id, v_text, v_text, 'pending'
    )
    returning id into v_answer_id;
  else
    update public.answers
    set raw_text = v_text,
        normalized_text = v_text
    where question_id = v_state.current_question_id
      and player_id = v_player.id
    returning id into v_answer_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'kind', 'together',
    'answer_id', v_answer_id,
    'player_id', v_player.id,
    'question_id', v_state.current_question_id,
    'raw_text', v_text,
    'expected', v_secret.answer,
    'variants', to_jsonb(v_secret.variants),
    'host_mode', v_mode
  );
end;
$$;

-- Засчитать или отклонить ответ. Верный закрывает вопрос на команду один раз.
create or replace function public.together_resolve(
  p_code text,
  p_player_id uuid,
  p_correct boolean,
  p_method text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_room public.rooms%rowtype;
  v_state public.game_states%rowtype;
  v_question public.questions%rowtype;
  v_answer text;
  v_method text;
  v_streak integer;
  v_mult integer;
  v_points integer;
  v_left integer;
  v_version integer;
  v_answer_id uuid;
begin
  v_method := case
    when p_method in ('exact', 'fuzzy', 'llm', 'host') then p_method
    else 'fuzzy'
  end;

  select * into v_room
  from public.rooms
  where code = upper(trim(coalesce(p_code, '')));

  if not found then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;
  if v_room.play_mode is distinct from 'together' then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  select * into v_state
  from public.game_states
  where room_id = v_room.id
  for update;

  -- Серия могла измениться, пока ждали блокировку партии.
  select * into v_room from public.rooms where id = v_room.id;

  if v_state.current_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_active_question');
  end if;

  select id into v_answer_id
  from public.answers
  where question_id = v_state.current_question_id
    and player_id = p_player_id;

  if v_state.phase not in ('answering', 'judging')
     or exists (
       select 1
       from public.questions q
       where q.id = v_state.current_question_id
         and q.status = 'answered'
     )
  then
    if v_answer_id is not null then
      update public.answers
      set verdict = case when p_correct then 'correct' else 'incorrect' end,
          points_delta = 0,
          method = v_method,
          suggestion_correct = p_correct
      where id = v_answer_id
        and verdict = 'pending';
    end if;
    return jsonb_build_object('ok', false, 'error', 'already_scored', 'revealed', true);
  end if;

  select * into v_question
  from public.questions
  where id = v_state.current_question_id
  for update;

  select s.answer into v_answer
  from public.question_secrets s
  where s.question_id = v_question.id;

  if v_answer_id is null then
    insert into public.answers (
      room_id, question_id, player_id, raw_text, normalized_text,
      verdict, points_delta, method, suggestion_correct
    ) values (
      v_room.id, v_question.id, p_player_id, '', '',
      'pending', 0, v_method, p_correct
    )
    returning id into v_answer_id;
  end if;

  if p_correct then
    v_streak := v_room.team_streak + 1;
    -- Тот же потолок, что в src/lib/game/together.ts (STREAK_CAP).
    v_mult := least(greatest(v_streak, 1), 3);
    v_points := v_question.value * v_mult;

    update public.players
    set score = score + v_points
    where id = p_player_id;

    update public.answers
    set verdict = 'correct',
        points_delta = v_points,
        method = v_method,
        suggestion_correct = true
    where id = v_answer_id;

    update public.rooms
    set team_score = team_score + v_points,
        team_streak = v_streak,
        team_best_streak = greatest(team_best_streak, v_streak),
        team_correct = team_correct + 1,
        team_played = team_played + 1
    where id = v_room.id;

    update public.questions set status = 'answered' where id = v_question.id;
    update public.game_states
    set phase = 'reveal',
        revealed_answer = v_answer,
        chooser_player_id = p_player_id,
        buzz_winner_player_id = null,
        deadline = clock_timestamp() + interval '4 seconds',
        version = version + 1,
        updated_at = clock_timestamp()
    where room_id = v_room.id
    returning version into v_version;

    return jsonb_build_object(
      'ok', true,
      'correct', true,
      'revealed', true,
      'points', v_points,
      'multiplier', v_mult,
      'streak', v_streak,
      'version', v_version
    );
  end if;

  update public.answers
  set verdict = 'incorrect',
      points_delta = 0,
      method = v_method,
      suggestion_correct = false
  where id = v_answer_id;

  select count(*) into v_left
  from public.players p
  where p.room_id = v_room.id
    and p.role = 'player'
    and not exists (
      select 1
      from public.answers a
      where a.question_id = v_question.id
        and a.player_id = p.id
        and a.verdict <> 'pending'
    );

  if v_left > 0 then
    update public.game_states
    set version = version + 1,
        updated_at = clock_timestamp()
    where room_id = v_room.id
    returning version into v_version;

    return jsonb_build_object(
      'ok', true,
      'correct', false,
      'revealed', false,
      'points', 0,
      'multiplier', 1,
      'version', v_version
    );
  end if;

  perform public.together_note_miss(v_room.id);

  update public.questions set status = 'answered' where id = v_question.id;
  update public.game_states
  set phase = 'reveal',
      revealed_answer = v_answer,
      buzz_winner_player_id = null,
      deadline = clock_timestamp() + interval '4 seconds',
      version = version + 1,
      updated_at = clock_timestamp()
  where room_id = v_room.id
  returning version into v_version;

  return jsonb_build_object(
    'ok', true,
    'correct', false,
    'revealed', true,
    'points', 0,
    'multiplier', 1,
    'streak', 0,
    'version', v_version
  );
end;
$$;

-- Команда сдаётся: ответ на экран, серия с нуля, без штрафа.
create or replace function public.together_give_up(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_room_id uuid;
  v_state public.game_states%rowtype;
  v_answer text;
  v_version integer;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;
  if (select play_mode from public.rooms where id = v_room_id) is distinct from 'together' then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  select * into v_state
  from public.game_states
  where room_id = v_room_id
  for update;

  if v_state.phase not in ('answering', 'buzzing', 'cat_pick', 'question')
     or v_state.current_question_id is null
  then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  select answer into v_answer
  from public.question_secrets
  where question_id = v_state.current_question_id;

  perform public.together_note_miss(v_room_id);

  update public.questions
  set status = 'answered'
  where id = v_state.current_question_id;

  update public.game_states
  set phase = 'reveal',
      revealed_answer = v_answer,
      buzz_winner_player_id = null,
      deadline = clock_timestamp() + interval '4 seconds',
      version = version + 1,
      updated_at = clock_timestamp()
  where room_id = v_room_id
  returning version into v_version;

  return jsonb_build_object('ok', true, 'phase', 'reveal', 'version', v_version);
end;
$$;

-- Пас по таймеру (фаза buzzing). Во «Вместе» это промах команды.
create or replace function public.pass_question(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_room_id uuid;
  v_state public.game_states%rowtype;
  v_answer text;
  v_version integer;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  select * into v_state from public.game_states where room_id = v_room_id for update;
  if v_state.phase <> 'buzzing' or v_state.current_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  select answer into v_answer
  from public.question_secrets
  where question_id = v_state.current_question_id;

  if (select play_mode from public.rooms where id = v_room_id) = 'together' then
    perform public.together_note_miss(v_room_id);
  end if;

  update public.questions set status = 'answered' where id = v_state.current_question_id;
  update public.buzzes set is_first = false where question_id = v_state.current_question_id;
  update public.game_states
  set phase = 'reveal',
      revealed_answer = v_answer,
      buzz_winner_player_id = null,
      deadline = clock_timestamp() + interval '4 seconds',
      version = version + 1,
      updated_at = clock_timestamp()
  where room_id = v_room_id
  returning version into v_version;

  return jsonb_build_object('ok', true, 'advanced', true, 'phase', 'reveal', 'version', v_version);
end;
$$;

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
  -- Сбалансированное поле: темы с типом и семейством.
  v_names text[];
  v_kinds text[];
  v_fams text[];
  v_fresh boolean[];
  v_video_round integer;
  v_slots text[];
  v_slot text;
  v_attempts text[][];
  v_try integer;
  v_want text[];
  v_strict boolean;
  v_round_cats text[];
  v_round_fams text[];
  v_used text[] := '{}'::text[];
  v_music integer := 0;
  v_picture integer := 0;
  v_pic_fams text[] := '{}'::text[];
  v_pick_cat text;
  v_pick_kind text;
  v_pick_fam text;
  -- «Детский рисунок» — обязательная картиночная тема каждой игры.
  v_kids constant text := 'Детский рисунок';
  v_kids_round integer;
  v_kids_pending boolean := false;
  v_kids_fam text;
  -- Фиксированное поле комнаты (room_secrets.board_categories).
  v_board text[];
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

  if v_count < case when v_room.play_mode = 'together' then 1 else 2 end then
    return jsonb_build_object('ok', false, 'error', case when v_room.play_mode = 'together' then 'need_player' else 'need_players' end);
  end if;
  if v_count > 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many_players');
  end if;

  select company_id, board_categories into v_company, v_board
  from public.room_secrets
  where room_id = v_room.id;

  -- Фиксированное поле: ровно 12 тем (1–6 — первый раунд, 7–12 — второй),
  -- у каждой ≥5 доступных вопросов. Иначе — обычный подбор.
  if v_board is not null and (
    coalesce(array_length(v_board, 1), 0) <> 12
    or (select count(distinct c) from unnest(v_board) as c) <> 12
    or exists (
      select 1 from unnest(v_board) as c
      where (
        select count(*) from public.question_bank b
        where b.category = c and (b.picture is null or b.enabled)
      ) < 5
    )
  ) then
    v_board := null;
  end if;

  -- Кандидаты: темы с ≥10 доступными вопросами (картинки — только одобренные).
  -- fresh — у компании осталось хотя бы 5 невиденных вопросов темы.
  -- Тип и семейство — из category_meta (нет строки — text).
  select coalesce(array_agg(s.category), '{}'::text[]),
    coalesce(array_agg(s.kind), '{}'::text[]),
    coalesce(array_agg(s.family), '{}'::text[]),
    coalesce(array_agg(s.fresh), '{}'::boolean[])
  into v_names, v_kinds, v_fams, v_fresh
  from (
    select b.category,
      coalesce(max(m.kind), 'text') as kind,
      max(m.family) as family,
      count(*) filter (where cs.bank_id is null) >= 5 as fresh
    from public.question_bank b
    left join public.company_seen cs
      on cs.company_id = v_company and cs.bank_id = b.id
    left join public.category_meta m on m.category = b.category
    where b.picture is null or b.enabled
    group by b.category
    having count(*) >= 10
  ) s;

  if coalesce(array_length(v_names, 1), 0) < 12 then
    return jsonb_build_object('ok', false, 'error', 'bank_too_small');
  end if;

  -- В каждом раунде 6 тем: 1 music + 1 picture + 1 brain + text, и в одном
  -- из раундов (случайно) одна text заменена на video. Так картинки есть в
  -- обоих раундах (2 за игру — ровно лимит), а не в одном: раньше картиночная
  -- тема была одна на игру и в половине игр пряталась во втором раунде.
  -- Нет темы нужного типа — другое медиа, потом text, потом любая. За игру не
  -- больше 2 music и 2 picture; в раунде нет двух тем одного семейства;
  -- вторая картиночная тема — по возможности из другого семейства.
  -- Порядок колонок — случайный.
  if v_board is not null then
    v_categories :=
      array(select x from unnest(v_board[1:6]) as x order by random())
      || array(select x from unnest(v_board[7:12]) as x order by random());
  else
  v_video_round := 1 + floor(random() * 2)::integer;
  -- «Детский рисунок» занимает картиночный слот одного (случайного) раунда;
  -- второй картиночный слот — другая картиночная тема. Если темы нет среди
  -- кандидатов (меньше 10 вопросов) — всё как раньше.
  if v_kids = any(v_names) then
    v_kids_round := 1 + floor(random() * 2)::integer;
    v_kids_pending := true;
    select m.family into v_kids_fam from public.category_meta m where m.category = v_kids;
  end if;
  v_categories := '{}'::text[];
  for v_round in 1..2 loop
    v_round_cats := '{}'::text[];
    v_round_fams := '{}'::text[];
    -- В раунде «Детского рисунка» он выбирается первым, чтобы его семейство
    -- (cinema) не заняла другая тема этого раунда.
    v_slots := array[
      case when v_round = v_kids_round then 'kids' else 'music' end,
      case when v_round = v_kids_round then 'music' else 'picture' end,
      'brain',
      case when v_round = v_video_round then 'video' else 'text' end,
      'text', 'text'
    ];
    foreach v_slot in array v_slots loop
      v_pick_cat := null;
      if v_slot = 'kids' then
        v_pick_cat := v_kids;
        v_pick_kind := 'picture';
        v_pick_fam := v_kids_fam;
        v_kids_pending := false;
      else
      v_attempts := case v_slot
        when 'video' then array[
          array['video', 'video', 'video', 'video', 'video'],
          array['picture', 'picture', 'picture', 'picture', 'picture'],
          array['text', 'text', 'text', 'text', 'text'],
          array['text', 'music', 'video', 'picture', 'brain']]
        when 'picture' then array[
          array['picture', 'picture', 'picture', 'picture', 'picture'],
          array['video', 'video', 'video', 'video', 'video'],
          array['text', 'text', 'text', 'text', 'text'],
          array['text', 'music', 'video', 'picture', 'brain']]
        else array[
          array[v_slot, v_slot, v_slot, v_slot, v_slot],
          array['text', 'text', 'text', 'text', 'text'],
          array['text', 'music', 'video', 'picture', 'brain']]
      end;
      -- Сначала с ограничениями (семейство, лимиты), в крайнем случае — без них.
      foreach v_strict in array array[true, false] loop
        for v_try in 1..array_length(v_attempts, 1) loop
          v_want := v_attempts[v_try:v_try][1:5];
          select c.name, c.kind, c.fam
          into v_pick_cat, v_pick_kind, v_pick_fam
          from unnest(v_names, v_kinds, v_fams, v_fresh) as c(name, kind, fam, fresh)
          where c.kind = any(v_want)
            and not (c.name = any(v_used))
            and c.name <> v_kids
            and (
              not v_strict
              or (
                (c.fam is null or not (c.fam = any(v_round_fams)))
                and (c.kind <> 'music' or v_music < 2)
                -- место под «Детский рисунок» зарезервировано
                and (c.kind <> 'picture'
                  or v_picture < 2 - case when v_kids_pending then 1 else 0 end)
              )
            )
          order by c.fresh desc,
            (c.kind = 'picture' and c.fam is not null and c.fam = any(v_pic_fams)),
            random()
          limit 1;
          exit when v_pick_cat is not null;
        end loop;
        exit when v_pick_cat is not null;
      end loop;
      end if;

      if v_pick_cat is null then
        return jsonb_build_object('ok', false, 'error', 'bank_too_small');
      end if;
      v_used := v_used || v_pick_cat;
      v_round_cats := v_round_cats || v_pick_cat;
      if v_pick_fam is not null then
        v_round_fams := v_round_fams || v_pick_fam;
      end if;
      if v_pick_kind = 'music' then v_music := v_music + 1; end if;
      if v_pick_kind = 'picture' then
        v_picture := v_picture + 1;
        if v_pick_fam is not null then
          v_pic_fams := v_pic_fams || v_pick_fam;
        end if;
      end if;
    end loop;

    v_categories := v_categories || array(
      select x from unnest(v_round_cats) as x order by random()
    );
  end loop;
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
          select tiered.prompt, tiered.answer, tiered.variants, tiered.value
          from (
            select pool.*,
              row_number() over (
                partition by pool.hard
                order by pool.seen_at asc nulls first, pool.r
              ) as tier_rn
            from (
              select b.prompt, b.answer, b.variants, b.value,
                coalesce(b.value, 0) >= 300 as hard,
                cs.seen_at, random() as r
              from public.question_bank b
              left join public.company_seen cs
                on cs.company_id = v_company and cs.bank_id = b.id
              where b.category = v_category
                and (b.picture is null or b.enabled)
            ) pool
          ) tiered
          -- «Детский рисунок»: 2 лёгких (value ≤ 200) на клетки 100–200 и 3 трудных
          -- (value ≥ 300) на 300–500; не хватает — добираем любыми. Другие темы
          -- как раньше: невиденные, потом давно виденные.
          order by
            case
              when v_category <> 'Детский рисунок' then 0
              when not tiered.hard and tiered.tier_rn <= 2 then 0
              when tiered.hard and tiered.tier_rn <= 3 then 0
              else 1
            end,
            tiered.seen_at asc nulls first, tiered.r
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

  -- Сюрпризы: только если комнату создал новый фронт (surprises = true).
  if v_room.surprises is true then
    perform public.mark_surprises(v_room.id);
  end if;

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
  v_pick_next uuid;
  v_board text[];
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  select * into v_state from public.game_states where room_id = v_room_id for update;
  if v_state.phase <> 'reveal' then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  -- Сюрпризы: эффекты этого вопроса гаснут; «выбор хода» передаёт выбор клетки.
  if v_state.current_question_id is not null then
    select e.player_id into v_pick_next
    from public.room_effects e
    join public.players p on p.id = e.player_id and p.role = 'player'
    where e.room_id = v_room_id
      and e.question_id = v_state.current_question_id
      and e.effect = 'pick_next'
      and e.status = 'active'
    order by e.created_at desc
    limit 1;
    update public.room_effects
    set status = case when effect = 'pick_next' then 'used' else 'expired' end,
        ended_at = clock_timestamp()
    where room_id = v_room_id
      and status = 'active'
      and question_id = v_state.current_question_id
      and effect in ('hint', 'freeze', 'half_timer', 'triple', 'scramble', 'pick_next');
  end if;

  select count(*) into v_hidden
  from public.questions
  where room_id = v_room_id and round = v_state.round and status = 'hidden';

  if v_hidden > 0 then
    update public.game_states
    set phase = 'board',
        chooser_player_id = coalesce(v_pick_next, chooser_player_id),
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
        chooser_player_id = coalesce(v_pick_next, chooser_player_id),
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

  -- «Вместе» не идёт в финал со ставками: после второго раунда общий итог.
  if v_state.round >= 2 and exists (
    select 1 from public.rooms r
    where r.id = v_room_id and r.play_mode = 'together'
  ) then
    perform public.together_save_record(v_room_id);
    update public.rooms set status = 'finished' where id = v_room_id;
    update public.game_states
    set phase = 'finished',
        current_question_id = null,
        revealed_answer = null,
        buzz_winner_player_id = null,
        deadline = null,
        version = version + 1,
        updated_at = clock_timestamp()
    where room_id = v_room_id
    returning version into v_version;
    return jsonb_build_object('ok', true, 'phase', 'finished', 'version', v_version);
  end if;

  -- В финале сюрпризов нет: всё, что не потрачено, сгорает.
  update public.room_effects
  set status = 'expired', ended_at = clock_timestamp()
  where room_id = v_room_id and status = 'active';

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

  select rs.board_categories into v_board
  from public.room_secrets rs where rs.room_id = v_room_id;

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
    -- Фиксированное поле: финал — из тех же тем.
    and (v_board is null or b.category = any(v_board))
    and not exists (
    select 1
    from public.questions q
    join public.question_secrets s on s.question_id = q.id
    where q.room_id = v_room_id and q.prompt = b.prompt and s.answer = b.answer
  )
  order by
    -- в тематической игре финал по возможности без медиа
    (v_board is not null and (b.audio_url is not null or b.vk_url is not null
      or b.youtube_id is not null or b.rutube_url is not null)),
    cs.seen_at asc nulls first, random()
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


revoke all on function public.together_note_miss(uuid) from public, anon, authenticated;
revoke all on function public.together_save_record(uuid) from public, anon, authenticated;
revoke all on function public.together_open(text, text) from public, anon, authenticated;
revoke all on function public.together_begin(text, text, text) from public, anon, authenticated;
revoke all on function public.together_resolve(text, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.together_give_up(text) from public, anon, authenticated;

grant execute on function public.together_note_miss(uuid) to service_role;
grant execute on function public.together_save_record(uuid) to service_role;
grant execute on function public.together_open(text, text) to service_role;
grant execute on function public.together_begin(text, text, text) to service_role;
grant execute on function public.together_resolve(text, uuid, boolean, text) to service_role;
grant execute on function public.together_give_up(text) to service_role;

notify pgrst, 'reload schema';
