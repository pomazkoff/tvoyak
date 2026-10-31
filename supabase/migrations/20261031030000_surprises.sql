-- «Сюрпризы»: 2–3 тайные клетки за игру. Открыли такую — перед вопросом
-- рулетка выбирает эффект (бафф, дебафф или хаос для всех), сервер его
-- применяет, потом вопрос идёт как обычно. В финале сюрпризов нет.
--
-- Обратная совместимость: rooms.surprises по умолчанию null — старый фронт
-- его не ставит, и для таких комнат start_game ничего не помечает, а
-- pick_cell/apply_outcome/buzz ведут себя ровно как раньше. Новый фронт
-- создаёт комнату с surprises = true (тумблер «Сюрпризы» в лобби).

alter table public.rooms add column if not exists surprises boolean;
grant select (surprises) on table public.rooms to anon, authenticated;

alter table public.question_secrets
  add column if not exists surprise boolean not null default false;

-- Тестовый крючок: следующий сюрприз в комнате — этот эффект.
-- Ставится только service_role через debug_force_surprise.
alter table public.room_secrets add column if not exists forced_effect text;

alter table public.game_states drop constraint if exists game_states_phase_check;
alter table public.game_states add constraint game_states_phase_check check (
  phase = any (array[
    'lobby', 'board', 'cat_pick', 'surprise', 'surprise_pick', 'question',
    'buzzing', 'answering', 'judging', 'reveal', 'wager', 'final_answer',
    'finished'
  ]::text[])
);

create table if not exists public.room_surprises (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  round smallint not null,
  opener_player_id uuid references public.players(id) on delete set null,
  effect text not null,
  status text not null default 'rolling'
    check (status in ('rolling', 'choosing', 'done')),
  outcome jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  unique (question_id)
);
create index if not exists room_surprises_room on public.room_surprises (room_id);

-- Действующие эффекты. player_id null — на всех; question_id — эффект
-- одного вопроса (гаснет на continue_game) или вопрос, где его потратили.
create table if not exists public.room_effects (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  surprise_id uuid references public.room_surprises(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  effect text not null,
  question_id uuid references public.questions(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'used', 'expired')),
  created_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz
);
create index if not exists room_effects_room_active
  on public.room_effects (room_id) where status = 'active';
create index if not exists room_effects_question on public.room_effects (question_id);

-- Журнал очков: ответы и все изменения от сюрпризов.
create table if not exists public.score_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  delta integer not null,
  score_after integer,
  reason text not null check (reason in ('answer', 'effect')),
  effect text,
  surprise_id uuid references public.room_surprises(id) on delete set null,
  question_id uuid references public.questions(id) on delete set null,
  note text,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists score_events_room on public.score_events (room_id, created_at);

alter table public.room_surprises enable row level security;
alter table public.room_effects enable row level security;
alter table public.score_events enable row level security;

drop policy if exists room_surprises_select on public.room_surprises;
create policy room_surprises_select on public.room_surprises for select using (true);
drop policy if exists room_effects_select on public.room_effects;
create policy room_effects_select on public.room_effects for select using (true);
drop policy if exists score_events_select on public.score_events;
create policy score_events_select on public.score_events for select using (true);

revoke all on table public.room_surprises, public.room_effects, public.score_events
  from anon, authenticated;
grant select on table public.room_surprises, public.room_effects, public.score_events
  to anon, authenticated;
grant all on table public.room_surprises, public.room_effects, public.score_events
  to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_surprises'
  ) then
    alter publication supabase_realtime add table public.room_surprises;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_effects'
  ) then
    alter publication supabase_realtime add table public.room_effects;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Вспомогательные функции
-- ---------------------------------------------------------------------------

create or replace function public.surprise_effect_ids()
returns text[]
language sql
immutable
set search_path = pg_catalog, public
as $$
  select array[
    'double', 'shield', 'letter_a', 'hint', 'pick_next', 'steal',
    'swap_left', 'caps', 'one_word', 'shortest_nick', 'freeze', 'half_timer',
    'rotate', 'robin_hood', 'triple', 'scramble'
  ]::text[];
$$;

-- Ответ под эффектом «только КАПСОМ» / «одно слово».
create or replace function public.answer_format_ok(p_effect text, p_raw text)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case p_effect
    when 'caps' then coalesce(p_raw, '') = upper(coalesce(p_raw, ''))
    when 'one_word' then btrim(coalesce(p_raw, '')) <> ''
      and btrim(coalesce(p_raw, '')) !~ '\s'
    else true
  end;
$$;

-- Срок ответа с учётом «таймер вдвое короче» на этом вопросе.
create or replace function public.answer_window(p_question_id uuid, p_seconds integer)
returns interval
language sql
stable
set search_path = pg_catalog, public
as $$
  select make_interval(secs => case
    when exists (
      select 1 from public.room_effects e
      where e.question_id = p_question_id
        and e.effect = 'half_timer'
        and e.status = 'active'
    ) then ceil(p_seconds / 2.0)
    else p_seconds
  end);
$$;

create or replace function public.log_score(
  p_room_id uuid,
  p_player_id uuid,
  p_delta integer,
  p_reason text,
  p_effect text,
  p_surprise_id uuid,
  p_question_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.score_events (
    room_id, player_id, delta, score_after, reason, effect, surprise_id, question_id, note
  )
  select p_room_id, p.id, p_delta, p.score, p_reason, p_effect, p_surprise_id, p_question_id, p_note
  from public.players p
  where p.id = p_player_id;
end;
$$;

-- Изменить счёт по эффекту, записать в журнал, вернуть строку для итога.
create or replace function public.effect_score(
  p_room_id uuid,
  p_player_id uuid,
  p_delta integer,
  p_effect text,
  p_surprise_id uuid,
  p_question_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_nick text;
  v_score integer;
begin
  update public.players
  set score = score + p_delta
  where id = p_player_id and room_id = p_room_id
  returning nickname, score into v_nick, v_score;
  if not found then
    return null;
  end if;
  perform public.log_score(
    p_room_id, p_player_id, p_delta, 'effect', p_effect, p_surprise_id, p_question_id, p_note
  );
  return jsonb_build_object(
    'player_id', p_player_id,
    'nickname', v_nick,
    'delta', p_delta,
    'score', v_score,
    'note', p_note
  );
end;
$$;

-- 2–3 тайные клетки на игру: раунды 1–2, не «кот в мешке».
create or replace function public.mark_surprises(p_room_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_want integer := 2 + floor(random() * 2)::integer;
  v_count integer;
begin
  update public.question_secrets s
  set surprise = true
  where s.question_id in (
    select q.id
    from public.questions q
    where q.room_id = p_room_id
      and q.round in (1, 2)
      and q.special is distinct from 'cat'
      and q.status = 'hidden'
    order by random()
    limit v_want
  );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Клетка-сюрприз открыта: крутим рулетку (эффект выбран сразу, экраны
-- докручивают до него). Возвращает новую версию или null — не сюрприз.
create or replace function public.begin_surprise(
  p_room_id uuid,
  p_question_id uuid,
  p_opener uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_on boolean;
  v_flag boolean;
  v_round smallint;
  v_forced text;
  v_effect text;
  v_ids text[] := public.surprise_effect_ids();
  v_version integer;
begin
  select surprises into v_on from public.rooms where id = p_room_id;
  if v_on is not true then
    return null;
  end if;
  select surprise into v_flag from public.question_secrets where question_id = p_question_id;
  if v_flag is not true then
    return null;
  end if;
  select round into v_round from public.questions where id = p_question_id;
  if v_round is null or v_round not in (1, 2) then
    return null;
  end if;
  if exists (select 1 from public.room_surprises where question_id = p_question_id) then
    return null;
  end if;

  select forced_effect into v_forced
  from public.room_secrets
  where room_id = p_room_id
  for update;
  if v_forced is not null and v_forced = any(v_ids) then
    v_effect := v_forced;
    update public.room_secrets set forced_effect = null where room_id = p_room_id;
  else
    v_effect := v_ids[1 + floor(random() * array_length(v_ids, 1))::integer];
  end if;

  insert into public.room_surprises (room_id, question_id, round, opener_player_id, effect)
  values (p_room_id, p_question_id, v_round, p_opener, v_effect);

  update public.game_states
  set phase = 'surprise',
      current_question_id = p_question_id,
      buzz_winner_player_id = null,
      deadline = clock_timestamp() + interval '11 seconds',
      revealed_answer = null,
      version = version + 1,
      updated_at = clock_timestamp()
  where room_id = p_room_id
  returning version into v_version;
  return v_version;
end;
$$;

-- После рулетки — вопрос как обычно (или «кот в мешке»).
create or replace function public.proceed_after_surprise(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_state public.game_states%rowtype;
  v_special text;
  v_version integer;
begin
  select * into v_state from public.game_states where room_id = p_room_id for update;
  if v_state.phase not in ('surprise', 'surprise_pick') or v_state.current_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;
  select special into v_special from public.questions where id = v_state.current_question_id;

  if v_special = 'cat' then
    update public.game_states
    set phase = 'cat_pick',
        buzz_winner_player_id = null,
        deadline = clock_timestamp() + interval '30 seconds',
        revealed_answer = null,
        version = version + 1,
        updated_at = clock_timestamp()
    where room_id = p_room_id
    returning version into v_version;
    return jsonb_build_object('ok', true, 'phase', 'cat_pick', 'version', v_version);
  end if;

  update public.questions set status = 'open' where id = v_state.current_question_id;
  update public.game_states
  set phase = 'question',
      buzz_winner_player_id = null,
      deadline = null,
      revealed_answer = null,
      version = version + 1,
      updated_at = clock_timestamp()
  where room_id = p_room_id
  returning version into v_version;
  return jsonb_build_object('ok', true, 'phase', 'question', 'version', v_version);
end;
$$;

-- Рулетка докрутилась: применяем эффект.
create or replace function public.finish_surprise(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_state public.game_states%rowtype;
  v_s public.room_surprises%rowtype;
  v_opener public.players%rowtype;
  v_changes jsonb := '[]'::jsonb;
  v_row jsonb;
  v_outcome jsonb := '{}'::jsonb;
  v_ids uuid[];
  v_scores integer[];
  v_n integer;
  v_i integer;
  v_j integer;
  v_target uuid;
  v_min integer;
  v_version integer;
  r record;
begin
  select * into v_state from public.game_states where room_id = p_room_id for update;
  if v_state.phase <> 'surprise' or v_state.current_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  select * into v_s
  from public.room_surprises
  where question_id = v_state.current_question_id
  for update;
  if not found or v_s.status <> 'rolling' then
    return public.proceed_after_surprise(p_room_id);
  end if;

  select * into v_opener from public.players where id = v_s.opener_player_id;

  -- Порядок игроков — как на табло (по времени входа).
  select coalesce(array_agg(p.id order by p.joined_at, p.id), '{}'::uuid[]),
         coalesce(array_agg(p.score order by p.joined_at, p.id), '{}'::integer[])
  into v_ids, v_scores
  from public.players p
  where p.room_id = p_room_id and p.role = 'player';
  v_n := coalesce(array_length(v_ids, 1), 0);

  if v_s.effect in ('double', 'shield', 'caps', 'one_word') then
    if v_opener.id is not null then
      insert into public.room_effects (room_id, surprise_id, player_id, effect)
      values (p_room_id, v_s.id, v_opener.id, v_s.effect);
    end if;

  elsif v_s.effect in ('hint', 'freeze') then
    if v_opener.id is not null then
      insert into public.room_effects (room_id, surprise_id, player_id, effect, question_id)
      values (p_room_id, v_s.id, v_opener.id, v_s.effect, v_state.current_question_id);
    end if;

  elsif v_s.effect in ('half_timer', 'triple', 'scramble') then
    insert into public.room_effects (room_id, surprise_id, player_id, effect, question_id)
    values (p_room_id, v_s.id, null, v_s.effect, v_state.current_question_id);

  elsif v_s.effect = 'letter_a' then
    if v_opener.id is not null and lower(v_opener.nickname) ~ '[аa]' then
      v_row := public.effect_score(p_room_id, v_opener.id, 1000, v_s.effect, v_s.id, v_s.question_id, 'буква «а» в имени');
      if v_row is not null then v_changes := v_changes || v_row; end if;
    else
      v_outcome := v_outcome || jsonb_build_object('nothing', true);
    end if;

  elsif v_s.effect = 'steal' then
    if v_opener.id is not null then
      select p.id into v_target
      from public.players p
      where p.room_id = p_room_id and p.role = 'player' and p.id <> v_opener.id
      order by p.score desc, p.joined_at, p.id
      limit 1;
      if v_target is not null then
        v_row := public.effect_score(p_room_id, v_target, -500, v_s.effect, v_s.id, v_s.question_id, 'украли 500');
        if v_row is not null then v_changes := v_changes || v_row; end if;
        v_row := public.effect_score(p_room_id, v_opener.id, 500, v_s.effect, v_s.id, v_s.question_id, 'украл 500');
        if v_row is not null then v_changes := v_changes || v_row; end if;
      end if;
    end if;

  elsif v_s.effect = 'swap_left' then
    if v_opener.id is not null and v_n >= 2 then
      v_i := array_position(v_ids, v_opener.id);
      if v_i is not null then
        v_j := case when v_i = 1 then v_n else v_i - 1 end;
        if v_scores[v_i] <> v_scores[v_j] then
          v_row := public.effect_score(p_room_id, v_ids[v_i], v_scores[v_j] - v_scores[v_i], v_s.effect, v_s.id, v_s.question_id, 'обмен с соседом слева');
          if v_row is not null then v_changes := v_changes || v_row; end if;
          v_row := public.effect_score(p_room_id, v_ids[v_j], v_scores[v_i] - v_scores[v_j], v_s.effect, v_s.id, v_s.question_id, 'обмен с соседом справа');
          if v_row is not null then v_changes := v_changes || v_row; end if;
        end if;
        v_outcome := v_outcome || jsonb_build_object('target_id', v_ids[v_j]);
      end if;
    end if;

  elsif v_s.effect = 'shortest_nick' then
    select min(char_length(btrim(p.nickname))) into v_min
    from public.players p
    where p.room_id = p_room_id and p.role = 'player';
    for r in
      select p.id from public.players p
      where p.room_id = p_room_id and p.role = 'player'
        and char_length(btrim(p.nickname)) = v_min
      order by p.joined_at, p.id
    loop
      v_row := public.effect_score(p_room_id, r.id, -500, v_s.effect, v_s.id, v_s.question_id, 'самое короткое имя');
      if v_row is not null then v_changes := v_changes || v_row; end if;
    end loop;

  elsif v_s.effect = 'rotate' then
    -- Каждый получает счёт соседа слева (первый — последнего).
    if v_n >= 2 then
      for v_i in 1..v_n loop
        v_j := case when v_i = 1 then v_n else v_i - 1 end;
        if v_scores[v_j] <> v_scores[v_i] then
          v_row := public.effect_score(p_room_id, v_ids[v_i], v_scores[v_j] - v_scores[v_i], v_s.effect, v_s.id, v_s.question_id, 'счёт по кругу');
          if v_row is not null then v_changes := v_changes || v_row; end if;
        end if;
      end loop;
    end if;

  elsif v_s.effect = 'robin_hood' then
    select min(p.score) into v_min
    from public.players p
    where p.room_id = p_room_id and p.role = 'player';
    for r in
      select p.id from public.players p
      where p.room_id = p_room_id and p.role = 'player' and p.score = v_min
      order by p.joined_at, p.id
    loop
      v_row := public.effect_score(p_room_id, r.id, 1500, v_s.effect, v_s.id, v_s.question_id, 'Робин Гуд');
      if v_row is not null then v_changes := v_changes || v_row; end if;
    end loop;

  elsif v_s.effect = 'pick_next' then
    if v_opener.id is not null and v_n >= 2 then
      update public.room_surprises set status = 'choosing' where id = v_s.id;
      update public.game_states
      set phase = 'surprise_pick',
          deadline = clock_timestamp() + interval '20 seconds',
          version = version + 1,
          updated_at = clock_timestamp()
      where room_id = p_room_id
      returning version into v_version;
      return jsonb_build_object('ok', true, 'phase', 'surprise_pick', 'version', v_version);
    end if;
  end if;

  update public.room_surprises
  set status = 'done',
      outcome = v_outcome || jsonb_build_object('changes', v_changes),
      resolved_at = clock_timestamp()
  where id = v_s.id;

  return public.proceed_after_surprise(p_room_id);
end;
$$;

-- «Выбор хода»: кто выбирает клетку после этого вопроса. null — сам открывший
-- (истёк срок выбора).
create or replace function public.apply_pick_next(p_room_id uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_state public.game_states%rowtype;
  v_s public.room_surprises%rowtype;
  v_target public.players%rowtype;
begin
  select * into v_state from public.game_states where room_id = p_room_id for update;
  if v_state.phase <> 'surprise_pick' or v_state.current_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;
  select * into v_s from public.room_surprises
  where question_id = v_state.current_question_id
  for update;

  select * into v_target
  from public.players
  where id = coalesce(p_target, v_s.opener_player_id)
    and room_id = p_room_id and role = 'player';
  if p_target is not null and v_target.id is null then
    return jsonb_build_object('ok', false, 'error', 'player_not_found');
  end if;

  if v_target.id is not null then
    insert into public.room_effects (room_id, surprise_id, player_id, effect, question_id)
    values (p_room_id, v_s.id, v_target.id, 'pick_next', v_state.current_question_id);
  end if;
  update public.room_surprises
  set status = 'done',
      outcome = jsonb_build_object(
        'target_id', v_target.id,
        'target_name', v_target.nickname,
        'timeout', p_target is null,
        'changes', '[]'::jsonb
      ),
      resolved_at = clock_timestamp()
  where id = v_s.id;

  return public.proceed_after_surprise(p_room_id);
end;
$$;

-- Игрок, открывший «выбор хода», называет, кто выберет следующую клетку.
create or replace function public.surprise_choose(
  p_code text,
  p_player_token text,
  p_target_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_room_id uuid;
  v_player public.players%rowtype;
  v_state public.game_states%rowtype;
  v_opener uuid;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;
  v_player := public.lookup_player(v_room_id, p_player_token);
  if v_player.id is null then
    return jsonb_build_object('ok', false, 'error', 'player_not_found');
  end if;
  select * into v_state from public.game_states where room_id = v_room_id for update;
  if v_state.phase <> 'surprise_pick' then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;
  select opener_player_id into v_opener
  from public.room_surprises where question_id = v_state.current_question_id;
  if v_opener is distinct from v_player.id then
    return jsonb_build_object('ok', false, 'error', 'not_chooser');
  end if;
  if p_target_id is null then
    return jsonb_build_object('ok', false, 'error', 'player_not_found');
  end if;
  return public.apply_pick_next(v_room_id, p_target_id);
end;
$$;

-- То же с пульта ведущего (телефон игрока отвалился).
create or replace function public.host_surprise_choose(p_code text, p_target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_room_id uuid;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;
  if p_target_id is null then
    return jsonb_build_object('ok', false, 'error', 'player_not_found');
  end if;
  return public.apply_pick_next(v_room_id, p_target_id);
end;
$$;

-- Подсказка «первая буква ответа» — только тому, кому она выпала.
create or replace function public.my_hint(p_code text, p_player_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_room_id uuid;
  v_player public.players%rowtype;
  v_state public.game_states%rowtype;
  v_status text;
  v_answer text;
  v_letter text;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;
  v_player := public.lookup_player(v_room_id, p_player_token);
  if v_player.id is null then
    return jsonb_build_object('ok', false, 'error', 'player_not_found');
  end if;
  select * into v_state from public.game_states where room_id = v_room_id;
  if v_state.current_question_id is null
     or v_state.phase not in ('question', 'buzzing', 'answering', 'judging', 'cat_pick')
     or not exists (
       select 1 from public.room_effects e
       where e.question_id = v_state.current_question_id
         and e.player_id = v_player.id
         and e.effect = 'hint'
         and e.status = 'active'
     ) then
    return jsonb_build_object('ok', true, 'letter', null);
  end if;
  select status into v_status from public.questions where id = v_state.current_question_id;
  select answer into v_answer from public.question_secrets where question_id = v_state.current_question_id;
  v_letter := upper(left(regexp_replace(coalesce(v_answer, ''), '[^[:alnum:]]', '', 'g'), 1));
  return jsonb_build_object(
    'ok', true,
    'letter', nullif(v_letter, ''),
    'question_id', v_state.current_question_id
  );
end;
$$;

-- Тестовый крючок (только service_role): сделать клетку сюрпризом и/или
-- задать эффект следующего сюрприза комнаты.
create or replace function public.debug_force_surprise(
  p_code text,
  p_question_id uuid,
  p_effect text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_room_id uuid;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;
  if p_effect is not null and not (p_effect = any(public.surprise_effect_ids())) then
    return jsonb_build_object('ok', false, 'error', 'bad_effect');
  end if;
  if p_question_id is not null then
    update public.question_secrets s
    set surprise = true
    from public.questions q
    where q.id = s.question_id and q.id = p_question_id
      and q.room_id = v_room_id and q.round in (1, 2) and q.status = 'hidden';
    if not found then
      return jsonb_build_object('ok', false, 'error', 'bad_cell');
    end if;
  end if;
  update public.room_secrets set forced_effect = p_effect where room_id = v_room_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.surprise_effect_ids() from public, anon, authenticated;
revoke all on function public.answer_format_ok(text, text) from public, anon, authenticated;
revoke all on function public.answer_window(uuid, integer) from public, anon, authenticated;
revoke all on function public.log_score(uuid, uuid, integer, text, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.effect_score(uuid, uuid, integer, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.mark_surprises(uuid) from public, anon, authenticated;
revoke all on function public.begin_surprise(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.proceed_after_surprise(uuid) from public, anon, authenticated;
revoke all on function public.finish_surprise(uuid) from public, anon, authenticated;
revoke all on function public.apply_pick_next(uuid, uuid) from public, anon, authenticated;
revoke all on function public.host_surprise_choose(text, uuid) from public, anon, authenticated;
revoke all on function public.debug_force_surprise(text, uuid, text) from public, anon, authenticated;
revoke all on function public.surprise_choose(text, text, uuid) from public;
revoke all on function public.my_hint(text, text) from public;

grant execute on function public.surprise_effect_ids() to service_role;
grant execute on function public.answer_format_ok(text, text) to service_role;
grant execute on function public.answer_window(uuid, integer) to service_role;
grant execute on function public.host_surprise_choose(text, uuid) to service_role;
grant execute on function public.debug_force_surprise(text, uuid, text) to service_role;
grant execute on function public.surprise_choose(text, text, uuid) to anon, authenticated, service_role;
grant execute on function public.my_hint(text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Существующие функции: точечные правки (остальное — как в проде)
-- ---------------------------------------------------------------------------

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

  select company_id into v_company
  from public.room_secrets
  where room_id = v_room.id;

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
  v_video_round := 1 + floor(random() * 2)::integer;
  v_categories := '{}'::text[];
  for v_round in 1..2 loop
    v_round_cats := '{}'::text[];
    v_round_fams := '{}'::text[];
    v_slots := array[
      'music', 'picture', 'brain',
      case when v_round = v_video_round then 'video' else 'text' end,
      'text', 'text'
    ];
    foreach v_slot in array v_slots loop
      v_pick_cat := null;
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
            and (
              not v_strict
              or (
                (c.fam is null or not (c.fam = any(v_round_fams)))
                and (c.kind <> 'music' or v_music < 2)
                and (c.kind <> 'picture' or v_picture < 2)
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


CREATE OR REPLACE FUNCTION public.pick_cell(p_code text, p_player_token text, p_question_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_room_id uuid;
  v_player public.players%rowtype;
  v_state public.game_states%rowtype;
  v_question public.questions%rowtype;
  v_version integer;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  v_player := public.lookup_player(v_room_id, p_player_token);
  if v_player.id is null then
    return jsonb_build_object('ok', false, 'error', 'player_not_found');
  end if;

  select * into v_state from public.game_states where room_id = v_room_id for update;
  if v_state.phase <> 'board' then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;
  if v_state.chooser_player_id is distinct from v_player.id then
    return jsonb_build_object('ok', false, 'error', 'not_chooser');
  end if;

  select * into v_question
  from public.questions
  where id = p_question_id and room_id = v_room_id
  for update;

  if not found or v_question.round <> v_state.round or v_question.status <> 'hidden' then
    return jsonb_build_object('ok', false, 'error', 'bad_cell');
  end if;

  -- Клетка-сюрприз: сначала рулетка, потом вопрос.
  v_version := public.begin_surprise(v_room_id, v_question.id, v_player.id);
  if v_version is not null then
    return jsonb_build_object('ok', true, 'cat', false, 'surprise', true, 'version', v_version);
  end if;

  if v_question.special = 'cat' then
    update public.game_states
    set phase = 'cat_pick',
        current_question_id = v_question.id,
        buzz_winner_player_id = null,
        deadline = clock_timestamp() + interval '30 seconds',
        revealed_answer = null,
        version = version + 1,
        updated_at = clock_timestamp()
    where room_id = v_room_id
    returning version into v_version;
    return jsonb_build_object('ok', true, 'cat', true, 'version', v_version);
  end if;

  update public.questions set status = 'open' where id = v_question.id;
  update public.game_states
  set phase = 'question',
      current_question_id = v_question.id,
      buzz_winner_player_id = null,
      deadline = null,
      revealed_answer = null,
      version = version + 1,
      updated_at = clock_timestamp()
  where room_id = v_room_id
  returning version into v_version;

  return jsonb_build_object('ok', true, 'cat', false, 'version', v_version);
end;
$function$;


CREATE OR REPLACE FUNCTION public.host_pick_cell(p_code text, p_question_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_room_id uuid;
  v_state public.game_states%rowtype;
  v_question public.questions%rowtype;
  v_version integer;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  select * into v_state from public.game_states where room_id = v_room_id for update;
  if v_state.phase <> 'board' or v_state.chooser_player_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  select * into v_question
  from public.questions
  where id = p_question_id and room_id = v_room_id
  for update;

  if not found or v_question.round <> v_state.round or v_question.status <> 'hidden' then
    return jsonb_build_object('ok', false, 'error', 'bad_cell');
  end if;

  -- Клетка-сюрприз: сначала рулетка, потом вопрос.
  v_version := public.begin_surprise(v_room_id, v_question.id, v_state.chooser_player_id);
  if v_version is not null then
    return jsonb_build_object('ok', true, 'cat', false, 'surprise', true, 'version', v_version);
  end if;

  if v_question.special = 'cat' then
    update public.game_states
    set phase = 'cat_pick',
        current_question_id = v_question.id,
        buzz_winner_player_id = null,
        deadline = clock_timestamp() + interval '30 seconds',
        revealed_answer = null,
        version = version + 1,
        updated_at = clock_timestamp()
    where room_id = v_room_id
    returning version into v_version;
    return jsonb_build_object('ok', true, 'cat', true, 'version', v_version);
  end if;

  update public.questions set status = 'open' where id = v_question.id;
  update public.game_states
  set phase = 'question',
      current_question_id = v_question.id,
      buzz_winner_player_id = null,
      deadline = null,
      revealed_answer = null,
      version = version + 1,
      updated_at = clock_timestamp()
  where room_id = v_room_id
  returning version into v_version;

  return jsonb_build_object('ok', true, 'cat', false, 'version', v_version);
end;
$function$;


CREATE OR REPLACE FUNCTION public.buzz(p_code text, p_player_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_room_id uuid;
  v_player public.players%rowtype;
  v_state public.game_states%rowtype;
  v_special text;
  v_time timestamptz;
  v_buzz_id uuid;
  v_buzz_first boolean;
  v_last_wrong timestamptz;
  v_version integer;
  v_tick jsonb;
begin
  if p_player_token is null or char_length(p_player_token) < 8 then
    return jsonb_build_object('ok', false, 'error', 'player_not_found', 'server_time', clock_timestamp());
  end if;

  v_room_id := public.room_id_by_code(v_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found', 'server_time', clock_timestamp());
  end if;

  v_player := public.lookup_player(v_room_id, p_player_token);
  if v_player.id is null then
    return jsonb_build_object('ok', false, 'error', 'player_not_found', 'server_time', clock_timestamp());
  end if;
  if v_player.role <> 'player' then
    return jsonb_build_object('ok', false, 'error', 'spectators_cannot_buzz', 'server_time', clock_timestamp());
  end if;

  -- Ленивый шаг часов: просроченное окно закрывается до решения о нажатии.
  v_tick := public.tick_room(v_room_id);

  select * into v_state from public.game_states where room_id = v_room_id for update;
  if v_state.phase = 'reveal' and coalesce((v_tick->>'advanced')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'buzz_closed', 'server_time', clock_timestamp());
  end if;
  if v_state.current_question_id is null or v_state.phase not in ('buzzing', 'answering') then
    return jsonb_build_object(
      'ok', false,
      'error', case when v_state.phase in ('reveal', 'judging') then 'buzz_closed' else 'no_active_question' end,
      'server_time', clock_timestamp()
    );
  end if;

  select special into v_special from public.questions where id = v_state.current_question_id;
  if v_special = 'cat' then
    return jsonb_build_object('ok', false, 'error', 'cat_no_buzz', 'server_time', clock_timestamp());
  end if;

  -- Сюрприз «заморозка»: этот вопрос игрок пропускает.
  if exists (
    select 1 from public.room_effects e
    where e.question_id = v_state.current_question_id
      and e.player_id = v_player.id
      and e.effect = 'freeze'
      and e.status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'error', 'frozen', 'server_time', clock_timestamp());
  end if;

  if exists (
    select 1 from public.answers
    where question_id = v_state.current_question_id
      and player_id = v_player.id
      and verdict <> 'pending'
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_buzzed', 'server_time', clock_timestamp());
  end if;

  select max(created_at) into v_last_wrong
  from public.answers
  where question_id = v_state.current_question_id
    and verdict = 'incorrect';

  -- Окно не сдвинули после неверного ответа: победитель или старый срок ещё на месте.
  if v_last_wrong is not null and (
    (
      v_state.buzz_winner_player_id is not null
      and exists (
        select 1 from public.answers
        where question_id = v_state.current_question_id
          and player_id = v_state.buzz_winner_player_id
          and verdict <> 'pending'
      )
    )
    or (
      v_state.phase = 'buzzing'
      and v_state.buzz_winner_player_id is null
      and (v_state.deadline is null or v_state.deadline <= v_last_wrong)
    )
  ) then
    update public.buzzes
    set is_first = false
    where question_id = v_state.current_question_id
      and player_id is distinct from v_player.id;

    update public.game_states
    set phase = 'buzzing',
        buzz_winner_player_id = null,
        deadline = clock_timestamp() + interval '15 seconds',
        version = version + 1,
        updated_at = clock_timestamp()
    where room_id = v_room_id
    returning * into v_state;
  end if;

  if v_state.phase = 'buzzing'
     and v_state.buzz_winner_player_id is null
     and v_state.deadline is not null
     and clock_timestamp() > v_state.deadline
  then
    perform public.pass_question(v_code);
    return jsonb_build_object('ok', false, 'error', 'buzz_closed', 'server_time', clock_timestamp());
  end if;

  select id, is_first into v_buzz_id, v_buzz_first
  from public.buzzes
  where question_id = v_state.current_question_id
    and player_id = v_player.id;

  if v_buzz_id is not null then
    if v_state.phase = 'buzzing'
       and v_state.buzz_winner_player_id is null
       and not v_buzz_first
    then
      v_time := clock_timestamp();
      update public.buzzes
      set is_first = true, server_time = v_time
      where id = v_buzz_id;
      update public.game_states
      set buzz_winner_player_id = v_player.id,
          phase = 'answering',
          deadline = v_time + public.answer_window(v_state.current_question_id, 20),
          version = version + 1,
          updated_at = v_time
      where room_id = v_room_id
      returning version into v_version;
      return jsonb_build_object(
        'ok', true, 'won', true, 'buzz_id', v_buzz_id,
        'server_time', v_time, 'version', v_version
      );
    end if;
    return jsonb_build_object('ok', false, 'error', 'already_buzzed', 'server_time', clock_timestamp());
  end if;

  if v_state.phase <> 'buzzing' or v_state.buzz_winner_player_id is not null then
    v_time := clock_timestamp();
    insert into public.buzzes (room_id, question_id, player_id, server_time, is_first)
    values (v_room_id, v_state.current_question_id, v_player.id, v_time, false)
    returning id into v_buzz_id;
    update public.game_states
    set version = version + 1, updated_at = v_time
    where room_id = v_room_id
    returning version into v_version;
    return jsonb_build_object(
      'ok', true, 'won', false, 'buzz_id', v_buzz_id,
      'server_time', v_time, 'version', v_version
    );
  end if;

  v_time := clock_timestamp();
  insert into public.buzzes (room_id, question_id, player_id, server_time, is_first)
  values (v_room_id, v_state.current_question_id, v_player.id, v_time, true)
  returning id into v_buzz_id;

  update public.game_states
  set buzz_winner_player_id = v_player.id,
      phase = 'answering',
      deadline = v_time + public.answer_window(v_state.current_question_id, 20),
      version = version + 1,
      updated_at = v_time
  where room_id = v_room_id
  returning version into v_version;

  return jsonb_build_object(
    'ok', true,
    'won', true,
    'buzz_id', v_buzz_id,
    'server_time', v_time,
    'version', v_version
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.assign_cat(p_code text, p_player_token text, p_target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_room_id uuid;
  v_player public.players%rowtype;
  v_target public.players%rowtype;
  v_state public.game_states%rowtype;
  v_question public.questions%rowtype;
  v_version integer;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  v_player := public.lookup_player(v_room_id, p_player_token);
  if v_player.id is null then
    return jsonb_build_object('ok', false, 'error', 'player_not_found');
  end if;

  select * into v_state from public.game_states where room_id = v_room_id for update;
  if v_state.phase <> 'cat_pick' or v_state.current_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;
  if v_state.chooser_player_id is distinct from v_player.id then
    return jsonb_build_object('ok', false, 'error', 'not_chooser');
  end if;
  if p_target_id = v_player.id then
    return jsonb_build_object('ok', false, 'error', 'cat_needs_other');
  end if;

  select * into v_target
  from public.players
  where id = p_target_id and room_id = v_room_id and role = 'player';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'player_not_found');
  end if;

  select * into v_question from public.questions where id = v_state.current_question_id for update;
  update public.questions
  set assigned_player_id = v_target.id,
      status = 'open'
  where id = v_question.id;

  update public.game_states
  set phase = 'answering',
      buzz_winner_player_id = null,
      deadline = clock_timestamp() + public.answer_window(v_question.id, 25),
      version = version + 1,
      updated_at = clock_timestamp()
  where room_id = v_room_id
  returning version into v_version;

  return jsonb_build_object('ok', true, 'version', v_version, 'player_id', v_target.id);
end;
$function$;


CREATE OR REPLACE FUNCTION public.begin_answer(p_code text, p_player_token text, p_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_room_id uuid;
  v_player public.players%rowtype;
  v_state public.game_states%rowtype;
  v_question public.questions%rowtype;
  v_secret public.question_secrets%rowtype;
  v_mode text;
  v_answer_id uuid;
  v_text text := left(coalesce(p_text, ''), 300);
  v_answerer uuid;
  v_new_version integer;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  v_player := public.lookup_player(v_room_id, p_player_token);
  if v_player.id is null then
    return jsonb_build_object('ok', false, 'error', 'player_not_found');
  end if;

  select * into v_state from public.game_states where room_id = v_room_id for update;

  if v_state.phase = 'answering' and v_state.current_question_id is not null
     and v_state.deadline is not null and clock_timestamp() > v_state.deadline then
    select * into v_question from public.questions where id = v_state.current_question_id;
    v_answerer := case when v_question.special = 'cat' then v_question.assigned_player_id
                       else v_state.buzz_winner_player_id end;
    perform public.tick_room(v_room_id);
    if v_answerer = v_player.id then
      return jsonb_build_object('ok', false, 'error', 'answer_late', 'delta', -v_question.value);
    end if;
    return jsonb_build_object('ok', false, 'error', 'not_your_turn');
  end if;

  if v_state.phase = 'judging' and v_state.round < 3 then
    return jsonb_build_object('ok', false, 'error', 'already_answered');
  end if;
  if v_state.phase <> 'answering' or v_state.current_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  select * into v_question from public.questions where id = v_state.current_question_id;
  if v_question.special = 'cat' then
    if v_question.assigned_player_id is distinct from v_player.id then
      return jsonb_build_object('ok', false, 'error', 'not_your_turn');
    end if;
  elsif v_state.buzz_winner_player_id is distinct from v_player.id then
    return jsonb_build_object('ok', false, 'error', 'not_your_turn');
  end if;

  select * into v_secret from public.question_secrets where question_id = v_question.id;
  select host_mode into v_mode from public.rooms where id = v_room_id;

  select id into v_answer_id
  from public.answers
  where question_id = v_question.id and player_id = v_player.id;

  if v_answer_id is null then
    insert into public.answers (
      room_id, question_id, player_id, buzz_id, raw_text, normalized_text, verdict
    ) values (
      v_room_id,
      v_question.id,
      v_player.id,
      (
        select id from public.buzzes
        where question_id = v_question.id and player_id = v_player.id
        limit 1
      ),
      v_text,
      v_text,
      'pending'
    )
    returning id into v_answer_id;
  end if;

  -- У бота проверка автоматическая; если сервер упал посреди неё, через 30 с
  -- часы применят подсказку (или «неверно»). У живого ведущего срока нет.
  update public.game_states
  set phase = 'judging',
      deadline = case when v_mode = 'bot' then clock_timestamp() + interval '30 seconds' else null end,
      version = version + 1,
      updated_at = clock_timestamp()
  where room_id = v_room_id and phase = 'answering'
  returning version into v_new_version;

  return jsonb_build_object(
    'ok', true,
    'kind', 'normal',
    'answer_id', v_answer_id,
    'player_id', v_player.id,
    'question_id', v_question.id,
    'raw_text', v_text,
    'expected', v_secret.answer,
    'variants', to_jsonb(v_secret.variants),
    'host_mode', v_mode,
    'value', v_question.value,
    'format', (
      select e.effect from public.room_effects e
      where e.room_id = v_room_id and e.player_id = v_player.id
        and e.status = 'active' and e.effect in ('caps', 'one_word')
      order by e.created_at
      limit 1
    ),
    'version', v_new_version
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.apply_outcome(p_room_id uuid, p_player_id uuid, p_correct boolean, p_method text, p_raw text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_state public.game_states%rowtype;
  v_question public.questions%rowtype;
  v_answer text;
  v_delta integer;
  v_left integer;
  v_reveal boolean := false;
  v_version integer;
  v_answer_id uuid;
  v_next uuid;
  v_next_buzz uuid;
  v_mult integer := 1;
  v_notes text[] := '{}'::text[];
  v_fx uuid;
  v_fx_kind text;
begin
  select * into v_state
  from public.game_states
  where room_id = p_room_id
  for update;

  if not found or v_state.phase not in ('answering', 'judging') or v_state.current_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  select * into v_question
  from public.questions
  where id = v_state.current_question_id
  for update;

  if v_question.special = 'cat' then
    if v_question.assigned_player_id is distinct from p_player_id then
      return jsonb_build_object('ok', false, 'error', 'not_your_turn');
    end if;
  elsif v_state.buzz_winner_player_id is distinct from p_player_id then
    return jsonb_build_object('ok', false, 'error', 'not_your_turn');
  end if;

  select s.answer into v_answer
  from public.question_secrets s
  where s.question_id = v_question.id;

  -- Сюрпризы. Формат ответа (КАПС / одно слово): не тот формат — неверно.
  select e.id, e.effect into v_fx, v_fx_kind
  from public.room_effects e
  where e.room_id = p_room_id and e.player_id = p_player_id
    and e.status = 'active' and e.effect in ('caps', 'one_word')
  order by e.created_at
  limit 1;
  if v_fx is not null then
    update public.room_effects
    set status = 'used', ended_at = clock_timestamp(), question_id = coalesce(question_id, v_question.id)
    where id = v_fx;
    if not public.answer_format_ok(v_fx_kind, p_raw) then
      p_correct := false;
      p_method := 'format';
      v_notes := v_notes || v_fx_kind;
    end if;
  end if;

  if exists (
    select 1 from public.room_effects e
    where e.question_id = v_question.id and e.effect = 'triple' and e.status = 'active'
  ) then
    v_mult := 3;
    v_notes := v_notes || 'triple'::text;
  end if;

  v_delta := (case when p_correct then v_question.value else -v_question.value end) * v_mult;

  v_fx := null;
  if p_correct then
    update public.room_effects
    set status = 'used', ended_at = clock_timestamp(), question_id = coalesce(question_id, v_question.id)
    where id = (
      select e.id from public.room_effects e
      where e.room_id = p_room_id and e.player_id = p_player_id
        and e.effect = 'double' and e.status = 'active'
      order by e.created_at
      limit 1
    )
    returning id into v_fx;
    if v_fx is not null then
      v_delta := v_delta * 2;
      v_notes := v_notes || 'double'::text;
    end if;
  elsif v_delta < 0 then
    update public.room_effects
    set status = 'used', ended_at = clock_timestamp(), question_id = coalesce(question_id, v_question.id)
    where id = (
      select e.id from public.room_effects e
      where e.room_id = p_room_id and e.player_id = p_player_id
        and e.effect = 'shield' and e.status = 'active'
      order by e.created_at
      limit 1
    )
    returning id into v_fx;
    if v_fx is not null then
      v_delta := 0;
      v_notes := v_notes || 'shield'::text;
    end if;
  end if;

  update public.players
  set score = score + v_delta
  where id = p_player_id;

  perform public.log_score(
    p_room_id, p_player_id, v_delta, 'answer',
    nullif(array_to_string(v_notes, ','), ''), null, v_question.id,
    case when p_correct then 'correct' else 'incorrect' end
  );

  select id into v_answer_id
  from public.answers
  where question_id = v_question.id and player_id = p_player_id;

  if v_answer_id is null then
    insert into public.answers (
      room_id, question_id, player_id, raw_text, normalized_text,
      verdict, points_delta, method, suggestion_correct
    ) values (
      p_room_id, v_question.id, p_player_id, coalesce(p_raw, ''), coalesce(p_raw, ''),
      case when p_correct then 'correct' else 'incorrect' end,
      v_delta, p_method, p_correct
    );
  else
    update public.answers
    set verdict = case when p_correct then 'correct' else 'incorrect' end,
        points_delta = v_delta,
        method = p_method,
        suggestion_correct = p_correct,
        raw_text = case when coalesce(p_raw, '') = '' then raw_text else p_raw end
    where id = v_answer_id;
  end if;

  if p_correct or v_question.special = 'cat' then
    v_reveal := true;
  else
    select b.player_id, b.id
      into v_next, v_next_buzz
    from public.buzzes b
    join public.players np on np.id = b.player_id and np.role = 'player'
    where b.question_id = v_question.id
      and b.player_id is distinct from p_player_id
      and not exists (
        select 1
        from public.answers a
        where a.question_id = v_question.id
          and a.player_id = b.player_id
          and a.verdict is distinct from 'pending'
      )
    order by b.server_time asc, b.id asc
    limit 1;

    if v_next is null then
      select count(*) into v_left
      from public.players p
      where p.room_id = p_room_id
        and p.role = 'player'
        and not exists (
          select 1 from public.buzzes b
          where b.question_id = v_question.id and b.player_id = p.id
        )
        -- «Заморозка»: этот игрок не может нажать — его не ждём.
        and not exists (
          select 1 from public.room_effects e
          where e.question_id = v_question.id and e.player_id = p.id
            and e.effect = 'freeze' and e.status = 'active'
        );
      v_reveal := v_left = 0;
    end if;
  end if;

  if v_reveal then
    update public.questions set status = 'answered' where id = v_question.id;
    update public.buzzes
    set is_first = false
    where question_id = v_question.id;
    update public.game_states
    set phase = 'reveal',
        revealed_answer = v_answer,
        chooser_player_id = case when p_correct then p_player_id else chooser_player_id end,
        buzz_winner_player_id = null,
        deadline = clock_timestamp() + interval '4 seconds',
        version = version + 1,
        updated_at = clock_timestamp()
    where room_id = p_room_id
    returning version into v_version;
  elsif v_next is not null then
    update public.buzzes
    set is_first = (id = v_next_buzz)
    where question_id = v_question.id;

    update public.game_states
    set phase = 'answering',
        buzz_winner_player_id = v_next,
        revealed_answer = null,
        deadline = clock_timestamp() + public.answer_window(v_question.id, 20),
        version = version + 1,
        updated_at = clock_timestamp()
    where room_id = p_room_id
    returning version into v_version;
  else
    update public.buzzes
    set is_first = false
    where question_id = v_question.id;

    update public.game_states
    set phase = 'buzzing',
        buzz_winner_player_id = null,
        revealed_answer = null,
        deadline = clock_timestamp() + interval '15 seconds',
        version = version + 1,
        updated_at = clock_timestamp()
    where room_id = p_room_id
    returning version into v_version;
  end if;

  return jsonb_build_object(
    'ok', true,
    'correct', p_correct,
    'revealed', v_reveal,
    'promoted', v_next is not null,
    'delta', v_delta,
    'effects', to_jsonb(v_notes),
    'version', v_version
  );
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


CREATE OR REPLACE FUNCTION public.tick_room(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_state public.game_states%rowtype;
  v_code text;
  v_mode text;
  v_special text;
  v_player_id uuid;
  v_verdict text;
  v_suggest boolean;
  v_method text;
  v_raw text;
  v_due timestamptz;
  v_need integer;
  v_version integer;
  v_result jsonb;
  v_target uuid;
begin
  select * into v_state from public.game_states where room_id = p_room_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  select code, host_mode into v_code, v_mode from public.rooms where id = p_room_id;

  -- Старые reveal без срока (до этой миграции) тоже уходят через 4 секунды.
  -- У бота чтение вопроса без срока на экране, но не дольше 45 секунд.
  v_due := case
    when v_state.phase = 'reveal' then coalesce(v_state.deadline, v_state.updated_at + interval '4 seconds')
    when v_state.phase = 'question' and v_mode = 'bot' then v_state.updated_at + interval '45 seconds'
    when v_state.phase = 'judging' and v_state.round = 3 and v_mode = 'bot'
      then coalesce(v_state.deadline, v_state.updated_at + interval '20 seconds')
    else v_state.deadline
  end;

  if v_due is null or clock_timestamp() <= v_due then
    return jsonb_build_object('ok', true, 'advanced', false, 'phase', v_state.phase, 'version', v_state.version);
  end if;

  if v_state.phase = 'surprise' then
    v_result := public.finish_surprise(p_room_id);
    return v_result || jsonb_build_object('advanced', coalesce((v_result->>'ok')::boolean, false), 'reason', 'surprise_done');
  end if;

  if v_state.phase = 'surprise_pick' then
    v_result := public.apply_pick_next(p_room_id, null);
    return v_result || jsonb_build_object('advanced', coalesce((v_result->>'ok')::boolean, false), 'reason', 'surprise_pick_timeout');
  end if;

  if v_state.phase = 'question' then
    v_result := public.open_buzz(v_code);
    return v_result || jsonb_build_object('advanced', coalesce((v_result->>'ok')::boolean, false), 'reason', 'read_timeout');
  end if;

  if v_state.phase = 'cat_pick' and v_state.current_question_id is not null then
    select id into v_target
    from public.players
    where room_id = p_room_id and role = 'player'
      and id is distinct from v_state.chooser_player_id
    order by random()
    limit 1;
    if v_target is null then
      update public.game_states set phase = 'buzzing' where room_id = p_room_id;
      v_result := public.pass_question(v_code);
      return v_result || jsonb_build_object('advanced', true, 'reason', 'cat_timeout');
    end if;
    update public.questions
    set assigned_player_id = v_target, status = 'open'
    where id = v_state.current_question_id;
    update public.game_states
    set phase = 'answering',
        buzz_winner_player_id = null,
        deadline = clock_timestamp() + public.answer_window(v_state.current_question_id, 25),
        version = version + 1,
        updated_at = clock_timestamp()
    where room_id = p_room_id
    returning version into v_version;
    return jsonb_build_object('ok', true, 'advanced', true, 'reason', 'cat_timeout', 'player_id', v_target, 'version', v_version);
  end if;

  if v_state.phase = 'buzzing' then
    -- Окно не сдвинули после неверного ответа (победитель уже ответил):
    -- это не тишина за столом, а битое окно — открываем его заново.
    if v_state.buzz_winner_player_id is not null and exists (
      select 1 from public.answers
      where question_id = v_state.current_question_id
        and player_id = v_state.buzz_winner_player_id
        and verdict <> 'pending'
    ) then
      update public.buzzes set is_first = false where question_id = v_state.current_question_id;
      update public.game_states
      set buzz_winner_player_id = null,
          deadline = clock_timestamp() + interval '15 seconds',
          version = version + 1,
          updated_at = clock_timestamp()
      where room_id = p_room_id
      returning version into v_version;
      return jsonb_build_object('ok', true, 'advanced', true, 'reason', 'rebuzz', 'version', v_version);
    end if;
    v_result := public.pass_question(v_code);
    return v_result || jsonb_build_object('advanced', coalesce((v_result->>'ok')::boolean, false), 'reason', 'buzz_timeout');
  end if;

  if v_state.phase = 'answering' and v_state.current_question_id is not null then
    select special, assigned_player_id into v_special, v_player_id
    from public.questions
    where id = v_state.current_question_id;
    if v_special is distinct from 'cat' then
      v_player_id := v_state.buzz_winner_player_id;
    end if;

    select verdict into v_verdict
    from public.answers
    where question_id = v_state.current_question_id and player_id = v_player_id;

    if v_player_id is not null and (v_verdict is null or v_verdict = 'pending') then
      v_result := public.apply_outcome(p_room_id, v_player_id, false, 'timeout', '');
      return v_result || jsonb_build_object(
        'advanced', coalesce((v_result->>'ok')::boolean, false),
        'reason', 'answer_timeout',
        'player_id', v_player_id
      );
    end if;

    -- Отвечающего нет или он уже отвечал: окно битое, просто вскрываем ответ.
    update public.game_states
    set phase = 'buzzing', buzz_winner_player_id = null
    where room_id = p_room_id;
    v_result := public.pass_question(v_code);
    return v_result || jsonb_build_object('advanced', true, 'reason', 'answer_timeout');
  end if;

  if v_state.phase = 'judging' and v_state.round < 3 and v_state.current_question_id is not null then
    select special, assigned_player_id into v_special, v_player_id
    from public.questions
    where id = v_state.current_question_id;
    if v_special is distinct from 'cat' then
      v_player_id := v_state.buzz_winner_player_id;
    end if;
    select suggestion_correct, method, raw_text into v_suggest, v_method, v_raw
    from public.answers
    where question_id = v_state.current_question_id and player_id = v_player_id;
    v_result := public.apply_outcome(
      p_room_id, v_player_id, coalesce(v_suggest, false),
      coalesce(v_method, 'fuzzy'), v_raw
    );
    return v_result || jsonb_build_object('advanced', coalesce((v_result->>'ok')::boolean, false), 'reason', 'judge_timeout');
  end if;

  -- Бот-ведущий: финал подводит сервер, даже если телевизор закрыт.
  if v_state.phase = 'judging' and v_state.round = 3 and v_mode = 'bot' then
    v_result := public.auto_settle_final(v_code);
    return v_result || jsonb_build_object('advanced', coalesce((v_result->>'ok')::boolean, false), 'reason', 'final_auto');
  end if;

  if v_state.phase = 'reveal' then
    v_result := public.continue_game(v_code);
    return v_result || jsonb_build_object('advanced', coalesce((v_result->>'ok')::boolean, false), 'reason', 'reveal_done');
  end if;

  if v_state.phase = 'wager' and v_state.current_question_id is not null then
    insert into public.answers (
      room_id, question_id, player_id, raw_text, normalized_text, wager, verdict
    )
    select p_room_id, v_state.current_question_id, p.id, '', '', 0, 'pending'
    from public.players p
    where p.room_id = p_room_id
      and p.role = 'player'
      and p.score > 0
      and not exists (
        select 1 from public.answers a
        where a.question_id = v_state.current_question_id and a.player_id = p.id
      );
    perform public.open_final_if_ready(p_room_id);
    select version into v_version from public.game_states where room_id = p_room_id;
    return jsonb_build_object('ok', true, 'advanced', true, 'reason', 'wager_timeout', 'version', v_version);
  end if;

  if v_state.phase = 'final_answer' and v_state.current_question_id is not null then
    select count(*) into v_need from public.players
    where room_id = p_room_id and role = 'player' and score > 0;
    update public.game_states
    set phase = 'judging',
        deadline = case when v_mode = 'bot' then clock_timestamp() + interval '20 seconds' end,
        version = version + 1,
        updated_at = clock_timestamp()
    where room_id = p_room_id
    returning version into v_version;
    return jsonb_build_object('ok', true, 'advanced', true, 'reason', 'final_timeout', 'version', v_version, 'eligible', v_need);
  end if;

  return jsonb_build_object('ok', true, 'advanced', false, 'phase', v_state.phase, 'version', v_state.version);
end;
$function$;

notify pgrst, 'reload schema';
