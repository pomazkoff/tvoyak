-- Твояк, каркас M0.
-- Комнаты без аккаунтов, до 10 игроков и зрители, состояние партии с номером версии.
-- «Кот в мешке» (special = 'cat') потом отдаётся другому игроку через assigned_player_id.
-- Финал: answers.wager, раунд 3. Неверный ответ всегда даёт отрицательный points_delta.
-- Победитель кнопки «Ответить» определяется в public.buzz по clock_timestamp().

create extension if not exists pgcrypto with schema extensions;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'lobby',
  host_mode text not null default 'human',
  created_at timestamptz not null default now(),
  constraint rooms_code_check check (code ~ '^[A-Z]{4}$'),
  constraint rooms_status_check check (status in ('lobby', 'round1', 'round2', 'final', 'finished')),
  constraint rooms_host_mode_check check (host_mode in ('human', 'bot'))
);

comment on table public.rooms is
  'Комната партии. Ведущий не является игроком: host_mode = human или bot.';

comment on column public.rooms.host_mode is
  'human — живой ведущий; bot — ведущий-бот (голос Web Speech API появится позже).';

create table public.room_secrets (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  host_secret_hash text not null
);

comment on table public.room_secrets is
  'Хеш ключа ведущего. Anon этот стол не читает.';

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  nickname text not null,
  role text not null,
  score integer not null default 0,
  joined_at timestamptz not null default now(),
  constraint players_nickname_len check (char_length(nickname) between 1 and 24),
  constraint players_role_check check (role in ('player', 'spectator'))
);

comment on column public.players.score is
  'Очки могут уйти в минус: неверный ответ всегда снимает стоимость вопроса.';

create index players_room_role_idx on public.players (room_id, role);

create table public.player_secrets (
  player_id uuid primary key references public.players (id) on delete cascade,
  token_hash text not null unique
);

comment on table public.player_secrets is
  'Хеш токена игрока. На клиент токен возвращается один раз из join_room.';

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  round smallint not null,
  category text not null,
  value integer not null,
  prompt text not null,
  answer text not null,
  special text,
  assigned_player_id uuid references public.players (id) on delete set null,
  row_index smallint not null,
  col_index smallint not null,
  status text not null default 'hidden',
  constraint questions_round_check check (round in (1, 2, 3)),
  constraint questions_value_check check (value >= 0),
  constraint questions_text_check check (char_length(category) > 0 and char_length(prompt) > 0 and char_length(answer) > 0),
  constraint questions_special_check check (special is null or special in ('cat', 'auction')),
  constraint questions_row_check check (row_index between 0 and 4),
  constraint questions_col_check check (col_index between 0 and 5),
  constraint questions_status_check check (status in ('hidden', 'open', 'answered')),
  constraint questions_cell_unique unique (room_id, round, row_index, col_index)
);

comment on table public.questions is
  'Поле 6×5: col_index 0..5 — категории, row_index 0..4 — стоимости. Раунд 1: 100–500, раунд 2: 200–1000, раунд 3 — финал.';

comment on column public.questions.special is
  'cat — «Кот в мешке», его нужно отдать другому игроку; auction — аукцион.';

comment on column public.questions.assigned_player_id is
  'Кто обязан отвечать на «кота». Это не тот игрок, который открыл ячейку.';

comment on column public.questions.answer is
  'Эталон. Колонку не отдаём роли anon.';

create index questions_room_round_idx on public.questions (room_id, round);

create table public.game_states (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  version integer not null default 1,
  phase text not null default 'lobby',
  round smallint not null default 0,
  current_question_id uuid references public.questions (id) on delete set null,
  buzz_winner_player_id uuid references public.players (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint game_states_version_check check (version > 0),
  constraint game_states_phase_check check (
    phase in ('lobby', 'board', 'question', 'buzzing', 'answering', 'judging', 'wager', 'reveal', 'finished')
  ),
  constraint game_states_round_check check (round in (0, 1, 2, 3))
);

comment on column public.game_states.version is
  'Монотонная версия состояния. Её увеличивает каждое изменение партии, чтобы клиент не затирал чужое.';

comment on column public.game_states.phase is
  'wager — скрытые ставки финала.';

create table public.buzzes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  server_time timestamptz not null,
  is_first boolean not null default false,
  created_at timestamptz not null default now(),
  constraint buzzes_once unique (question_id, player_id)
);

comment on column public.buzzes.server_time is
  'clock_timestamp() в момент решения, не now() транзакции и не часы телефона.';

create index buzzes_question_time_idx on public.buzzes (question_id, server_time);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  buzz_id uuid references public.buzzes (id) on delete set null,
  raw_text text not null,
  normalized_text text not null,
  wager integer,
  verdict text not null default 'pending',
  points_delta integer not null default 0,
  method text,
  created_at timestamptz not null default now(),
  constraint answers_wager_check check (wager is null or wager >= 0),
  constraint answers_verdict_check check (verdict in ('pending', 'correct', 'incorrect')),
  constraint answers_method_check check (method is null or method in ('exact', 'fuzzy', 'llm', 'host')),
  constraint answers_once unique (question_id, player_id)
);

comment on column public.answers.wager is
  'Скрытая ставка финала. Вне финала null.';

comment on column public.answers.points_delta is
  'Изменение счёта. Для неверного ответа значение отрицательное.';

create index answers_question_idx on public.answers (question_id);

alter table public.players replica identity full;
alter table public.game_states replica identity full;

alter table public.rooms enable row level security;
alter table public.room_secrets enable row level security;
alter table public.players enable row level security;
alter table public.player_secrets enable row level security;
alter table public.questions enable row level security;
alter table public.game_states enable row level security;
alter table public.buzzes enable row level security;
alter table public.answers enable row level security;

create policy rooms_select on public.rooms
  for select to anon, authenticated
  using (true);

create policy players_select on public.players
  for select to anon, authenticated
  using (true);

create policy questions_select on public.questions
  for select to anon, authenticated
  using (true);

create policy game_states_select on public.game_states
  for select to anon, authenticated
  using (true);

create policy buzzes_select on public.buzzes
  for select to anon, authenticated
  using (true);

create policy answers_select on public.answers
  for select to anon, authenticated
  using (true);

grant usage on schema public to anon, authenticated, service_role;

revoke all on table public.rooms from anon, authenticated;
revoke all on table public.room_secrets from anon, authenticated;
revoke all on table public.players from anon, authenticated;
revoke all on table public.player_secrets from anon, authenticated;
revoke all on table public.questions from anon, authenticated;
revoke all on table public.game_states from anon, authenticated;
revoke all on table public.buzzes from anon, authenticated;
revoke all on table public.answers from anon, authenticated;

grant select (id, code, status, host_mode, created_at) on public.rooms to anon, authenticated;
grant select on public.players to anon, authenticated;
grant select on public.game_states to anon, authenticated;
grant select (
  id,
  room_id,
  round,
  category,
  value,
  prompt,
  special,
  assigned_player_id,
  row_index,
  col_index,
  status
) on public.questions to anon, authenticated;
grant select on public.buzzes to anon, authenticated;
grant select (
  id,
  room_id,
  question_id,
  player_id,
  buzz_id,
  raw_text,
  normalized_text,
  wager,
  verdict,
  points_delta,
  method,
  created_at
) on public.answers to anon, authenticated;

grant all on table
  public.rooms,
  public.room_secrets,
  public.players,
  public.player_secrets,
  public.questions,
  public.game_states,
  public.buzzes,
  public.answers
to service_role;

create or replace function public.random_room_code()
returns text
language sql
volatile
set search_path = pg_catalog, public
as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 24)::integer, 1),
    ''
  )
  from generate_series(1, 4);
$$;

create or replace function public.hash_secret(p_secret text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public, extensions
as $$
  select encode(extensions.digest(convert_to(p_secret, 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function public.create_room(p_host_mode text default 'human')
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_mode text := coalesce(p_host_mode, 'human');
  v_code text;
  v_secret text;
  v_room_id uuid;
  v_attempt integer := 0;
begin
  if v_mode not in ('human', 'bot') then
    return jsonb_build_object('ok', false, 'error', 'bad_host_mode');
  end if;

  v_secret := encode(extensions.gen_random_bytes(24), 'hex');

  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 20 then
      return jsonb_build_object('ok', false, 'error', 'code_exhausted');
    end if;

    v_code := public.random_room_code();
    begin
      insert into public.rooms (code, host_mode)
      values (v_code, v_mode)
      returning id into v_room_id;
      exit;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  insert into public.room_secrets (room_id, host_secret_hash)
  values (v_room_id, public.hash_secret(v_secret));

  insert into public.game_states (room_id)
  values (v_room_id);

  return jsonb_build_object(
    'ok', true,
    'room_id', v_room_id,
    'code', v_code,
    'host_secret', v_secret,
    'host_mode', v_mode
  );
end;
$$;

create or replace function public.join_room(
  p_code text,
  p_nickname text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_nickname text := regexp_replace(trim(coalesce(p_nickname, '')), '\s+', ' ', 'g');
  v_role text := coalesce(p_role, '');
  v_room public.rooms%rowtype;
  v_token text;
  v_player_id uuid;
  v_count integer;
  v_version integer;
begin
  if v_code !~ '^[A-Z]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  if v_role not in ('player', 'spectator') then
    return jsonb_build_object('ok', false, 'error', 'bad_role');
  end if;

  if char_length(v_nickname) < 1
    or char_length(v_nickname) > 24
    or v_nickname ~ '[[:cntrl:]]' then
    return jsonb_build_object('ok', false, 'error', 'bad_nickname');
  end if;

  select * into v_room
  from public.rooms
  where code = v_code
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  if v_room.status = 'finished' then
    return jsonb_build_object('ok', false, 'error', 'room_finished');
  end if;

  select count(*) into v_count
  from public.players
  where room_id = v_room.id and role = v_role;

  if v_role = 'player' and v_count >= 10 then
    return jsonb_build_object('ok', false, 'error', 'room_full');
  end if;

  if v_role = 'spectator' and v_count >= 50 then
    return jsonb_build_object('ok', false, 'error', 'spectators_full');
  end if;

  v_token := encode(extensions.gen_random_bytes(18), 'hex');

  insert into public.players (room_id, nickname, role)
  values (v_room.id, v_nickname, v_role)
  returning id into v_player_id;

  insert into public.player_secrets (player_id, token_hash)
  values (v_player_id, public.hash_secret(v_token));

  update public.game_states
  set version = version + 1,
      updated_at = clock_timestamp()
  where room_id = v_room.id
  returning version into v_version;

  return jsonb_build_object(
    'ok', true,
    'player_id', v_player_id,
    'player_token', v_token,
    'room_id', v_room.id,
    'nickname', v_nickname,
    'role', v_role,
    'version', v_version
  );
end;
$$;

create or replace function public.leave_room(p_code text, p_player_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_room_id uuid;
  v_player_id uuid;
  v_version integer;
begin
  if p_player_token is null or char_length(p_player_token) < 8 then
    return jsonb_build_object('ok', false, 'error', 'player_not_found');
  end if;

  select id into v_room_id
  from public.rooms
  where code = v_code;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  select p.id into v_player_id
  from public.players p
  join public.player_secrets s on s.player_id = p.id
  where p.room_id = v_room_id
    and s.token_hash = public.hash_secret(p_player_token);

  if not found then
    return jsonb_build_object('ok', false, 'error', 'player_not_found');
  end if;

  delete from public.players where id = v_player_id;

  update public.game_states
  set version = version + 1,
      updated_at = clock_timestamp()
  where room_id = v_room_id
  returning version into v_version;

  return jsonb_build_object('ok', true, 'version', v_version);
end;
$$;

-- Первый, кто захватил строку game_states, пока фаза buzzing, побеждает.
-- server_time пишется как clock_timestamp() уже после блокировки, поэтому
-- у победителя время не позже остальных нажатий на этот вопрос.
create or replace function public.buzz(p_code text, p_player_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_room_id uuid;
  v_player public.players%rowtype;
  v_state public.game_states%rowtype;
  v_time timestamptz;
  v_buzz_id uuid;
  v_is_first boolean := false;
  v_version integer;
begin
  if p_player_token is null or char_length(p_player_token) < 8 then
    return jsonb_build_object(
      'ok', false,
      'error', 'player_not_found',
      'server_time', clock_timestamp()
    );
  end if;

  select id into v_room_id
  from public.rooms
  where code = v_code;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'room_not_found',
      'server_time', clock_timestamp()
    );
  end if;

  select p.* into v_player
  from public.players p
  join public.player_secrets s on s.player_id = p.id
  where p.room_id = v_room_id
    and s.token_hash = public.hash_secret(p_player_token);

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'player_not_found',
      'server_time', clock_timestamp()
    );
  end if;

  if v_player.role <> 'player' then
    return jsonb_build_object(
      'ok', false,
      'error', 'spectators_cannot_buzz',
      'server_time', clock_timestamp()
    );
  end if;

  select * into v_state
  from public.game_states
  where room_id = v_room_id
  for update;

  if v_state.current_question_id is null or v_state.phase not in ('buzzing', 'answering') then
    return jsonb_build_object(
      'ok', false,
      'error', 'no_active_question',
      'server_time', clock_timestamp()
    );
  end if;

  if exists (
    select 1
    from public.buzzes
    where question_id = v_state.current_question_id
      and player_id = v_player.id
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'already_buzzed',
      'server_time', clock_timestamp()
    );
  end if;

  v_time := clock_timestamp();
  v_is_first := v_state.phase = 'buzzing' and v_state.buzz_winner_player_id is null;

  insert into public.buzzes (room_id, question_id, player_id, server_time, is_first)
  values (v_room_id, v_state.current_question_id, v_player.id, v_time, v_is_first)
  returning id into v_buzz_id;

  if v_is_first then
    update public.game_states
    set buzz_winner_player_id = v_player.id,
        phase = 'answering',
        version = version + 1,
        updated_at = v_time
    where room_id = v_room_id
    returning version into v_version;
  else
    update public.game_states
    set version = version + 1,
        updated_at = v_time
    where room_id = v_room_id
    returning version into v_version;
  end if;

  return jsonb_build_object(
    'ok', true,
    'won', v_is_first,
    'buzz_id', v_buzz_id,
    'server_time', v_time,
    'version', v_version
  );
end;
$$;

revoke all on function public.random_room_code() from public, anon, authenticated;
revoke all on function public.hash_secret(text) from public, anon, authenticated;
revoke all on function public.create_room(text) from public;
revoke all on function public.join_room(text, text, text) from public;
revoke all on function public.leave_room(text, text) from public;
revoke all on function public.buzz(text, text) from public;

grant execute on function public.create_room(text) to anon, authenticated, service_role;
grant execute on function public.join_room(text, text, text) to anon, authenticated, service_role;
grant execute on function public.leave_room(text, text) to anon, authenticated, service_role;
grant execute on function public.buzz(text, text) to anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.players;
    alter publication supabase_realtime add table public.game_states;
  else
    raise notice 'Публикация supabase_realtime не найдена, realtime-лобби не заработает.';
  end if;
end $$;
