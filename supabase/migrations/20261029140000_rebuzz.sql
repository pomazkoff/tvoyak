-- После неверного ответа окно кнопки открывается снова для тех, кто ещё не
-- отвечал на этот вопрос. Старый победитель и просроченный срок больше не
-- превращают чужое нажатие в «кто-то нажал раньше». Истёкшее окно вскрывает
-- ответ. Уникальность (question_id, player_id) остаётся: повтор того, кто уже
-- ответил, — already_buzzed, а не новая строка.

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
        deadline = null,
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
    return public.pass_question(p_code);
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
