-- M1: партия поверх каркаса M0.
-- Эталон и варианты лежат в question_secrets и не попадают в realtime.
-- Телефоны читают question_board: формулировка скрыта, пока ячейка не открыта,
-- а ответ — только после status = answered.

alter table public.questions drop constraint questions_text_check;
alter table public.questions drop column answer;
alter table public.questions
  add constraint questions_prompt_check check (char_length(category) > 0 and char_length(prompt) > 0);

create table public.question_secrets (
  question_id uuid primary key references public.questions (id) on delete cascade,
  answer text not null,
  variants text[] not null default '{}',
  constraint question_secrets_answer_check check (char_length(answer) > 0)
);

comment on table public.question_secrets is
  'Эталон и допустимые варианты. Anon и realtime эту таблицу не видят.';

create table public.question_bank (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  prompt text not null,
  answer text not null,
  variants text[] not null default '{}',
  constraint question_bank_text_check check (
    char_length(category) > 0 and char_length(prompt) > 0 and char_length(answer) > 0
  ),
  constraint question_bank_prompt_unique unique (category, prompt)
);

comment on table public.question_bank is
  'Общий пул вопросов. В комнату копируется при старте партии.';

create index question_bank_category_idx on public.question_bank (category);

alter table public.game_states drop constraint game_states_phase_check;
alter table public.game_states
  add constraint game_states_phase_check check (
    phase in (
      'lobby', 'board', 'cat_pick', 'question', 'buzzing', 'answering',
      'judging', 'reveal', 'wager', 'final_answer', 'finished'
    )
  );

alter table public.game_states
  add column chooser_player_id uuid references public.players (id) on delete set null,
  add column deadline timestamptz,
  add column revealed_answer text;

comment on column public.game_states.chooser_player_id is
  'Кто выбирает ячейку. После верного ответа им становится ответивший.';
comment on column public.game_states.deadline is
  'Серверный край срока на кнопку, ответ, ставку или финал.';
comment on column public.game_states.revealed_answer is
  'Текст эталона. Заполняется только когда ответ уже можно показывать всем.';

alter table public.answers
  add column suggestion_correct boolean;

comment on column public.answers.suggestion_correct is
  'Подсказка автопроверки для живого ведущего. Не отдаётся телефонам.';

alter table public.question_secrets enable row level security;
alter table public.question_bank enable row level security;

revoke all on table public.questions from anon, authenticated;
revoke all on table public.answers from anon, authenticated;
revoke all on table public.question_secrets from anon, authenticated;
revoke all on table public.question_bank from anon, authenticated;

grant all on table public.question_secrets to service_role;
grant all on table public.question_bank to service_role;

create view public.question_board
with (security_barrier = true, security_invoker = false) as
select
  q.id,
  q.room_id,
  q.round,
  q.category,
  q.value,
  q.row_index,
  q.col_index,
  q.status,
  case when q.status = 'hidden' then null else q.prompt end as prompt,
  case when q.status = 'hidden' then null else q.special end as special,
  case when q.status = 'hidden' then null else q.assigned_player_id end as assigned_player_id,
  case when q.status = 'answered' then s.answer else null end as revealed_answer
from public.questions q
left join public.question_secrets s on s.question_id = q.id;

comment on view public.question_board is
  'Поле для экранов. Скрытая ячейка без текста, эталон только у уже сыгранной.';

grant select on public.question_board to anon, authenticated, service_role;

create or replace function public.lookup_player(p_room_id uuid, p_token text)
returns public.players
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select p.*
  from public.players p
  join public.player_secrets s on s.player_id = p.id
  where p.room_id = p_room_id
    and s.token_hash = public.hash_secret(p_token)
  limit 1;
$$;

create or replace function public.apply_outcome(
  p_room_id uuid,
  p_player_id uuid,
  p_correct boolean,
  p_method text,
  p_raw text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_state public.game_states%rowtype;
  v_question public.questions%rowtype;
  v_answer text;
  v_delta integer;
  v_left integer;
  v_reveal boolean := false;
  v_version integer;
  v_answer_id uuid;
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

  v_delta := case when p_correct then v_question.value else -v_question.value end;

  update public.players
  set score = score + v_delta
  where id = p_player_id;

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
    select count(*) into v_left
    from public.players p
    where p.room_id = p_room_id
      and p.role = 'player'
      and not exists (
        select 1 from public.buzzes b
        where b.question_id = v_question.id and b.player_id = p.id
      );
    v_reveal := v_left = 0;
  end if;

  if v_reveal then
    update public.questions set status = 'answered' where id = v_question.id;
    update public.game_states
    set phase = 'reveal',
        revealed_answer = v_answer,
        chooser_player_id = case when p_correct then p_player_id else chooser_player_id end,
        buzz_winner_player_id = null,
        deadline = null,
        version = version + 1,
        updated_at = clock_timestamp()
    where room_id = p_room_id
    returning version into v_version;
  else
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
    'delta', v_delta,
    'version', v_version
  );
end;
$$;

create or replace function public.room_id_by_code(p_code text)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select id from public.rooms where code = upper(trim(coalesce(p_code, '')));
$$;

create or replace function public.start_game(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
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

  select coalesce(array_agg(category), '{}'::text[])
  into v_categories
  from (
    select category
    from public.question_bank
    group by category
    having count(*) >= 10
    order by random()
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
        select prompt, answer, variants
        from public.question_bank
        where category = v_category
        order by random()
        limit 5
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
$$;

create or replace function public.pick_cell(
  p_code text,
  p_player_token text,
  p_question_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
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

  if v_question.special = 'cat' then
    update public.game_states
    set phase = 'cat_pick',
        current_question_id = v_question.id,
        buzz_winner_player_id = null,
        deadline = null,
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
$$;

create or replace function public.assign_cat(
  p_code text,
  p_player_token text,
  p_target_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
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
      deadline = clock_timestamp() + interval '25 seconds',
      version = version + 1,
      updated_at = clock_timestamp()
  where room_id = v_room_id
  returning version into v_version;

  return jsonb_build_object('ok', true, 'version', v_version, 'player_id', v_target.id);
end;
$$;

create or replace function public.open_buzz(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_room_id uuid;
  v_state public.game_states%rowtype;
  v_special text;
  v_version integer;
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

  select special into v_special from public.questions where id = v_state.current_question_id;
  if v_special = 'cat' then
    return jsonb_build_object('ok', false, 'error', 'cat_no_buzz');
  end if;

  update public.game_states
  set phase = 'buzzing',
      buzz_winner_player_id = null,
      deadline = clock_timestamp() + interval '15 seconds',
      version = version + 1,
      updated_at = clock_timestamp()
  where room_id = v_room_id
  returning version into v_version;

  return jsonb_build_object('ok', true, 'version', v_version);
end;
$$;

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
  if v_state.phase <> 'buzzing' or v_state.buzz_winner_player_id is not null or v_state.current_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  select answer into v_answer
  from public.question_secrets
  where question_id = v_state.current_question_id;

  update public.questions set status = 'answered' where id = v_state.current_question_id;
  update public.game_states
  set phase = 'reveal',
      revealed_answer = v_answer,
      deadline = null,
      version = version + 1,
      updated_at = clock_timestamp()
  where room_id = v_room_id
  returning version into v_version;

  return jsonb_build_object('ok', true, 'version', v_version);
end;
$$;

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
  v_special text;
  v_time timestamptz;
  v_buzz_id uuid;
  v_is_first boolean := false;
  v_version integer;
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

  select * into v_state from public.game_states where room_id = v_room_id for update;
  if v_state.current_question_id is null or v_state.phase not in ('buzzing', 'answering') then
    return jsonb_build_object('ok', false, 'error', 'no_active_question', 'server_time', clock_timestamp());
  end if;

  select special into v_special from public.questions where id = v_state.current_question_id;
  if v_special = 'cat' then
    return jsonb_build_object('ok', false, 'error', 'cat_no_buzz', 'server_time', clock_timestamp());
  end if;

  if v_state.deadline is not null and clock_timestamp() > v_state.deadline and v_state.phase = 'buzzing' then
    return jsonb_build_object('ok', false, 'error', 'too_late', 'server_time', clock_timestamp());
  end if;

  if exists (
    select 1 from public.buzzes
    where question_id = v_state.current_question_id and player_id = v_player.id
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_buzzed', 'server_time', clock_timestamp());
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
        deadline = v_time + interval '20 seconds',
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

create or replace function public.begin_answer(
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
  v_question public.questions%rowtype;
  v_secret public.question_secrets%rowtype;
  v_mode text;
  v_answer_id uuid;
  v_text text := left(coalesce(p_text, ''), 300);
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
  if v_state.phase not in ('answering', 'judging') or v_state.current_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;
  if v_state.phase = 'answering' and v_state.deadline is not null and clock_timestamp() > v_state.deadline then
    return jsonb_build_object('ok', false, 'error', 'too_late');
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

  update public.game_states
  set phase = 'judging',
      deadline = null,
      version = version + 1,
      updated_at = clock_timestamp()
  where room_id = v_room_id and phase = 'answering';

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
    'value', v_question.value
  );
end;
$$;

create or replace function public.note_suggestion(
  p_code text,
  p_correct boolean,
  p_method text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_room_id uuid;
  v_state public.game_states%rowtype;
  v_player_id uuid;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  select * into v_state from public.game_states where room_id = v_room_id for update;
  if v_state.phase <> 'judging' or v_state.current_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  select case
    when q.special = 'cat' then q.assigned_player_id
    else v_state.buzz_winner_player_id
  end into v_player_id
  from public.questions q
  where q.id = v_state.current_question_id;

  update public.answers
  set suggestion_correct = p_correct,
      method = p_method
  where question_id = v_state.current_question_id
    and player_id = v_player_id
    and verdict = 'pending';

  return jsonb_build_object('ok', true, 'version', v_state.version);
end;
$$;

create or replace function public.apply_verdict(
  p_code text,
  p_correct boolean,
  p_method text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_room_id uuid;
  v_state public.game_states%rowtype;
  v_player_id uuid;
  v_raw text;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  select * into v_state from public.game_states where room_id = v_room_id;
  if v_state.current_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_active_question');
  end if;

  select case
    when q.special = 'cat' then q.assigned_player_id
    else v_state.buzz_winner_player_id
  end into v_player_id
  from public.questions q
  where q.id = v_state.current_question_id;

  select raw_text into v_raw
  from public.answers
  where question_id = v_state.current_question_id and player_id = v_player_id;

  return public.apply_outcome(v_room_id, v_player_id, p_correct, p_method, v_raw);
end;
$$;

create or replace function public.continue_game(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
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
  where not exists (
    select 1
    from public.questions q
    join public.question_secrets s on s.question_id = q.id
    where q.room_id = v_room_id and q.prompt = b.prompt and s.answer = b.answer
  )
  order by random()
  limit 1;

  if not found then
    select prompt, answer, variants, category
    into v_pick
    from public.question_bank
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
$$;

create or replace function public.open_final_if_ready(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_state public.game_states%rowtype;
  v_need integer;
  v_have integer;
begin
  select * into v_state from public.game_states where room_id = p_room_id for update;
  if v_state.phase <> 'wager' or v_state.current_question_id is null then
    return;
  end if;

  select count(*) into v_need
  from public.players
  where room_id = p_room_id and role = 'player' and score > 0;

  select count(*) into v_have
  from public.answers
  where question_id = v_state.current_question_id and wager is not null;

  if v_have < v_need then
    return;
  end if;

  update public.questions set status = 'open' where id = v_state.current_question_id;
  update public.game_states
  set phase = 'final_answer',
      deadline = clock_timestamp() + interval '45 seconds',
      revealed_answer = null,
      version = version + 1,
      updated_at = clock_timestamp()
  where room_id = p_room_id;
end;
$$;

create or replace function public.place_wager(
  p_code text,
  p_player_token text,
  p_wager integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_room_id uuid;
  v_player public.players%rowtype;
  v_state public.game_states%rowtype;
  v_version integer;
begin
  if p_wager is null or p_wager < 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_wager');
  end if;

  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  v_player := public.lookup_player(v_room_id, p_player_token);
  if v_player.id is null then
    return jsonb_build_object('ok', false, 'error', 'player_not_found');
  end if;
  if v_player.role <> 'player' or v_player.score <= 0 then
    return jsonb_build_object('ok', false, 'error', 'not_eligible');
  end if;
  if p_wager > v_player.score then
    return jsonb_build_object('ok', false, 'error', 'bad_wager');
  end if;

  select * into v_state from public.game_states where room_id = v_room_id for update;
  if v_state.phase <> 'wager' or v_state.current_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  insert into public.answers (
    room_id, question_id, player_id, raw_text, normalized_text, wager, verdict
  ) values (
    v_room_id, v_state.current_question_id, v_player.id, '', '', p_wager, 'pending'
  )
  on conflict (question_id, player_id) do update
  set wager = excluded.wager
  where public.answers.verdict = 'pending';

  perform public.open_final_if_ready(v_room_id);

  select version into v_version from public.game_states where room_id = v_room_id;
  return jsonb_build_object('ok', true, 'version', v_version);
end;
$$;

create or replace function public.begin_final_answer(
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
  v_text text := left(coalesce(p_text, ''), 300);
  v_need integer;
  v_have integer;
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
  if v_player.score <= 0 then
    return jsonb_build_object('ok', false, 'error', 'not_eligible');
  end if;

  select * into v_state from public.game_states where room_id = v_room_id for update;
  if v_state.phase <> 'final_answer' or v_state.current_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;
  if v_state.deadline is not null and clock_timestamp() > v_state.deadline then
    return jsonb_build_object('ok', false, 'error', 'too_late');
  end if;

  update public.answers
  set raw_text = v_text,
      normalized_text = v_text
  where question_id = v_state.current_question_id
    and player_id = v_player.id
    and wager is not null
    and verdict = 'pending';

  if not found then
    return jsonb_build_object('ok', false, 'error', 'need_wager');
  end if;

  select count(*) into v_need
  from public.players
  where room_id = v_room_id and role = 'player' and score > 0;

  select count(*) into v_have
  from public.answers
  where question_id = v_state.current_question_id
    and wager is not null
    and verdict = 'pending'
    and char_length(raw_text) > 0;

  if v_have >= v_need then
    update public.game_states
    set phase = 'judging',
        deadline = null,
        version = version + 1,
        updated_at = clock_timestamp()
    where room_id = v_room_id
    returning version into v_version;
  else
    select version into v_version from public.game_states where room_id = v_room_id;
  end if;

  return jsonb_build_object('ok', true, 'version', v_version, 'ready', v_have >= v_need);
end;
$$;

create or replace function public.final_sheet(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_room_id uuid;
  v_state public.game_states%rowtype;
  v_secret public.question_secrets%rowtype;
  v_prompt text;
  v_mode text;
  v_rows jsonb;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  select * into v_state from public.game_states where room_id = v_room_id;
  if v_state.current_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_active_question');
  end if;

  select prompt into v_prompt from public.questions where id = v_state.current_question_id;
  select * into v_secret from public.question_secrets where question_id = v_state.current_question_id;
  select host_mode into v_mode from public.rooms where id = v_room_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'player_id', p.id,
    'nickname', p.nickname,
    'raw_text', a.raw_text,
    'wager', a.wager,
    'suggestion_correct', a.suggestion_correct,
    'method', a.method,
    'verdict', a.verdict
  ) order by p.joined_at), '[]'::jsonb)
  into v_rows
  from public.answers a
  join public.players p on p.id = a.player_id
  where a.question_id = v_state.current_question_id;

  return jsonb_build_object(
    'ok', true,
    'phase', v_state.phase,
    'host_mode', v_mode,
    'prompt', v_prompt,
    'expected', v_secret.answer,
    'variants', to_jsonb(v_secret.variants),
    'rows', v_rows
  );
end;
$$;

create or replace function public.mark_final_suggestions(p_code text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_room_id uuid;
  v_state public.game_states%rowtype;
  v_row jsonb;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;
  select * into v_state from public.game_states where room_id = v_room_id for update;
  if v_state.phase <> 'judging' or v_state.round <> 3 then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    update public.answers
    set suggestion_correct = (v_row->>'correct')::boolean,
        method = v_row->>'method'
    where question_id = v_state.current_question_id
      and player_id = (v_row->>'player_id')::uuid
      and verdict = 'pending';
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.apply_final(p_code text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_room_id uuid;
  v_state public.game_states%rowtype;
  v_answer text;
  v_row jsonb;
  v_correct boolean;
  v_wager integer;
  v_delta integer;
  v_version integer;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  select * into v_state from public.game_states where room_id = v_room_id for update;
  if v_state.phase <> 'judging' or v_state.round <> 3 or v_state.current_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_correct := coalesce((v_row->>'correct')::boolean, false);
    select wager into v_wager
    from public.answers
    where question_id = v_state.current_question_id
      and player_id = (v_row->>'player_id')::uuid
      and verdict = 'pending';
    if v_wager is null then
      continue;
    end if;
    v_delta := case when v_correct then v_wager else -v_wager end;
    update public.players
    set score = score + v_delta
    where id = (v_row->>'player_id')::uuid;
    update public.answers
    set verdict = case when v_correct then 'correct' else 'incorrect' end,
        points_delta = v_delta,
        method = coalesce(v_row->>'method', method),
        suggestion_correct = v_correct
    where question_id = v_state.current_question_id
      and player_id = (v_row->>'player_id')::uuid;
  end loop;

  select answer into v_answer
  from public.question_secrets
  where question_id = v_state.current_question_id;

  update public.questions set status = 'answered' where id = v_state.current_question_id;
  update public.rooms set status = 'finished' where id = v_room_id;
  update public.game_states
  set phase = 'finished',
      revealed_answer = v_answer,
      deadline = null,
      version = version + 1,
      updated_at = clock_timestamp()
  where room_id = v_room_id
  returning version into v_version;

  return jsonb_build_object('ok', true, 'version', v_version);
end;
$$;

create or replace function public.host_sheet(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_room_id uuid;
  v_state public.game_states%rowtype;
  v_question public.questions%rowtype;
  v_secret public.question_secrets%rowtype;
  v_mode text;
  v_rows jsonb;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  select * into v_state from public.game_states where room_id = v_room_id;
  select host_mode into v_mode from public.rooms where id = v_room_id;

  if v_state.current_question_id is null then
    return jsonb_build_object('ok', true, 'phase', v_state.phase, 'host_mode', v_mode, 'rows', '[]'::jsonb);
  end if;

  select * into v_question from public.questions where id = v_state.current_question_id;
  select * into v_secret from public.question_secrets where question_id = v_question.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'player_id', p.id,
    'nickname', p.nickname,
    'raw_text', a.raw_text,
    'wager', a.wager,
    'suggestion_correct', a.suggestion_correct,
    'method', a.method,
    'verdict', a.verdict
  ) order by a.created_at), '[]'::jsonb)
  into v_rows
  from public.answers a
  join public.players p on p.id = a.player_id
  where a.question_id = v_question.id;

  return jsonb_build_object(
    'ok', true,
    'phase', v_state.phase,
    'host_mode', v_mode,
    'round', v_state.round,
    'prompt', case when v_question.status = 'hidden' and v_state.phase = 'cat_pick' then null else v_question.prompt end,
    'category', v_question.category,
    'value', v_question.value,
    'special', v_question.special,
    'expected', v_secret.answer,
    'variants', to_jsonb(v_secret.variants),
    'rows', v_rows
  );
end;
$$;

create or replace function public.advance_clock(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_room_id uuid;
  v_state public.game_states%rowtype;
  v_player_id uuid;
  v_special text;
  v_need integer;
  v_version integer;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  select * into v_state from public.game_states where room_id = v_room_id for update;
  if v_state.deadline is null or clock_timestamp() <= v_state.deadline then
    return jsonb_build_object('ok', true, 'advanced', false, 'version', v_state.version);
  end if;

  if v_state.phase = 'buzzing' and v_state.buzz_winner_player_id is null then
    return public.pass_question(p_code);
  end if;

  if v_state.phase = 'answering' and v_state.current_question_id is not null then
    select special, assigned_player_id into v_special, v_player_id
    from public.questions
    where id = v_state.current_question_id;
    if v_special is distinct from 'cat' then
      v_player_id := v_state.buzz_winner_player_id;
    end if;
    if not exists (
      select 1 from public.answers
      where question_id = v_state.current_question_id
        and player_id = v_player_id
        and verdict <> 'pending'
    ) then
      return public.apply_outcome(v_room_id, v_player_id, false, 'host', '');
    end if;
  end if;

  if v_state.phase = 'wager' and v_state.current_question_id is not null then
    insert into public.answers (
      room_id, question_id, player_id, raw_text, normalized_text, wager, verdict
    )
    select v_room_id, v_state.current_question_id, p.id, '', '', 0, 'pending'
    from public.players p
    where p.room_id = v_room_id
      and p.role = 'player'
      and p.score > 0
      and not exists (
        select 1 from public.answers a
        where a.question_id = v_state.current_question_id and a.player_id = p.id
      );
    perform public.open_final_if_ready(v_room_id);
    select version into v_version from public.game_states where room_id = v_room_id;
    return jsonb_build_object('ok', true, 'advanced', true, 'version', v_version);
  end if;

  if v_state.phase = 'final_answer' and v_state.current_question_id is not null then
    select count(*) into v_need from public.players
    where room_id = v_room_id and role = 'player' and score > 0;
    update public.game_states
    set phase = 'judging',
        deadline = null,
        version = version + 1,
        updated_at = clock_timestamp()
    where room_id = v_room_id
    returning version into v_version;
    return jsonb_build_object('ok', true, 'advanced', true, 'version', v_version, 'eligible', v_need);
  end if;

  return jsonb_build_object('ok', true, 'advanced', false, 'version', v_state.version);
end;
$$;

revoke all on function public.lookup_player(uuid, text) from public, anon, authenticated;
revoke all on function public.apply_outcome(uuid, uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function public.room_id_by_code(text) from public, anon, authenticated;
revoke all on function public.open_final_if_ready(uuid) from public, anon, authenticated;
revoke all on function public.start_game(text) from public;
revoke all on function public.pick_cell(text, text, uuid) from public;
revoke all on function public.assign_cat(text, text, uuid) from public;
revoke all on function public.open_buzz(text) from public;
revoke all on function public.pass_question(text) from public;
revoke all on function public.buzz(text, text) from public;
revoke all on function public.begin_answer(text, text, text) from public;
revoke all on function public.note_suggestion(text, boolean, text) from public;
revoke all on function public.apply_verdict(text, boolean, text) from public;
revoke all on function public.continue_game(text) from public;
revoke all on function public.place_wager(text, text, integer) from public;
revoke all on function public.begin_final_answer(text, text, text) from public;
revoke all on function public.final_sheet(text) from public;
revoke all on function public.mark_final_suggestions(text, jsonb) from public;
revoke all on function public.apply_final(text, jsonb) from public;
revoke all on function public.host_sheet(text) from public;
revoke all on function public.advance_clock(text) from public;

grant execute on function public.pick_cell(text, text, uuid) to anon, authenticated, service_role;
grant execute on function public.assign_cat(text, text, uuid) to anon, authenticated, service_role;
grant execute on function public.buzz(text, text) to anon, authenticated, service_role;
grant execute on function public.place_wager(text, text, integer) to anon, authenticated, service_role;
grant execute on function public.advance_clock(text) to anon, authenticated, service_role;

grant execute on function public.start_game(text) to service_role;
grant execute on function public.open_buzz(text) to service_role;
grant execute on function public.pass_question(text) to service_role;
grant execute on function public.begin_answer(text, text, text) to service_role;
grant execute on function public.note_suggestion(text, boolean, text) to service_role;
grant execute on function public.apply_verdict(text, boolean, text) to service_role;
grant execute on function public.continue_game(text) to service_role;
grant execute on function public.begin_final_answer(text, text, text) to service_role;
grant execute on function public.final_sheet(text) to service_role;
grant execute on function public.mark_final_suggestions(text, jsonb) to service_role;
grant execute on function public.apply_final(text, jsonb) to service_role;
grant execute on function public.host_sheet(text) to service_role;

notify pgrst, 'reload schema';
