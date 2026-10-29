-- Серверные сроки. Любой клиент (ТВ, телефон, сервер) может дёрнуть
-- advance_clock, когда его локальный таймер дошёл до нуля: функция смотрит на
-- deadline под блокировкой строки и двигает партию ровно один раз. Те же шаги
-- выполняются лениво в начале buzz и begin_answer, так что зависшая комната
-- оживает от первого же нажатия.
--
-- * buzzing истёк — показываем ответ (reveal) на 4 секунды;
-- * answering истёк — штраф −цена (method = 'timeout'), кнопка снова открыта
--   тем, кто ещё не пробовал; если таких нет — reveal;
-- * judging у бота завис дольше 30 секунд — применяем подсказку проверки;
-- * reveal истёк — continue_game: поле и правильный выбирающий.
-- Все функции пишутся через create or replace: файл можно накатывать повторно.

alter table public.answers drop constraint if exists answers_method_check;
alter table public.answers
  add constraint answers_method_check
  check (method is null or method in ('exact', 'fuzzy', 'llm', 'host', 'timeout'));

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
  v_next uuid;
  v_next_buzz uuid;
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
        deadline = clock_timestamp() + interval '20 seconds',
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
    'version', v_version
  );
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
  if v_state.phase <> 'buzzing' or v_state.current_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  select answer into v_answer
  from public.question_secrets
  where question_id = v_state.current_question_id;

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

-- Один шаг часов для комнаты. Внутренняя функция: anon её не видит.
create or replace function public.tick_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
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
begin
  select * into v_state from public.game_states where room_id = p_room_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  -- Старые reveal без срока (до этой миграции) тоже уходят через 4 секунды.
  v_due := case
    when v_state.phase = 'reveal' then coalesce(v_state.deadline, v_state.updated_at + interval '4 seconds')
    else v_state.deadline
  end;

  if v_due is null or clock_timestamp() <= v_due then
    return jsonb_build_object('ok', true, 'advanced', false, 'phase', v_state.phase, 'version', v_state.version);
  end if;

  select code, host_mode into v_code, v_mode from public.rooms where id = p_room_id;

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
        deadline = null,
        version = version + 1,
        updated_at = clock_timestamp()
    where room_id = p_room_id
    returning version into v_version;
    return jsonb_build_object('ok', true, 'advanced', true, 'reason', 'final_timeout', 'version', v_version, 'eligible', v_need);
  end if;

  return jsonb_build_object('ok', true, 'advanced', false, 'phase', v_state.phase, 'version', v_state.version);
end;
$$;

-- Публичная точка: p_version — версия, которую видел клиент. Если партия уже
-- ушла дальше, ничего не делаем (ответ stale), клиент перечитает состояние.
drop function if exists public.advance_clock(text);

create or replace function public.advance_clock(p_code text, p_version integer default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_room_id uuid;
  v_version integer;
  v_phase text;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  if p_version is not null then
    select version, phase into v_version, v_phase from public.game_states where room_id = v_room_id;
    if v_version is distinct from p_version then
      return jsonb_build_object('ok', true, 'advanced', false, 'stale', true, 'phase', v_phase, 'version', v_version);
    end if;
  end if;

  return public.tick_room(v_room_id);
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
          deadline = v_time + interval '20 seconds',
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
      deadline = v_time + interval '20 seconds',
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
  v_answerer uuid;
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

  if v_state.phase not in ('answering', 'judging') or v_state.current_question_id is null then
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

revoke all on function public.tick_room(uuid) from public, anon, authenticated;
revoke all on function public.apply_outcome(uuid, uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function public.advance_clock(text, integer) from public;
revoke all on function public.buzz(text, text) from public;
revoke all on function public.begin_answer(text, text, text) from public;
revoke all on function public.pass_question(text) from public;

grant execute on function public.advance_clock(text, integer) to anon, authenticated, service_role;
grant execute on function public.buzz(text, text) to anon, authenticated, service_role;
grant execute on function public.tick_room(uuid) to service_role;
grant execute on function public.begin_answer(text, text, text) to service_role;
grant execute on function public.pass_question(text) to service_role;

notify pgrst, 'reload schema';
