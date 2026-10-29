-- Защита от двойного вердикта и застреваний партии.
--
-- 1. begin_answer принимает ответ только в фазе answering. Повторное
--    «Отправить» (двойной тап) больше не запускает вторую проверку, которая
--    в боте применялась к СЛЕДУЮЩЕМУ в очереди игроку и снимала с него очки.
-- 2. apply_verdict получает p_player_id: вердикт для того, кто уже не
--    отвечает (двойной клик «Неверно», запоздавший ответ бота), отклоняется
--    как stale и не трогает следующего игрока.
-- 3. leave_room: если ушёл выбирающий, ход передаётся лидеру по очкам —
--    иначе поле стояло без выбирающего навсегда.
-- 4. «Кот в мешке»: на выбор адресата 30 секунд, потом часы отдают кота
--    случайному другому игроку.
-- 5. Бот-ведущий: если кнопку не открыли за 45 секунд чтения (экран закрыт,
--    голос завис), часы открывают её сами.


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
    'version', v_new_version
  );
end;
$function$;


drop function if exists public.apply_verdict(text, boolean, text);

CREATE OR REPLACE FUNCTION public.apply_verdict(p_code text, p_correct boolean, p_method text, p_player_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
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

  if p_player_id is not null and v_player_id is distinct from p_player_id then
    return jsonb_build_object('ok', false, 'error', 'stale', 'phase', v_state.phase);
  end if;

  select raw_text into v_raw
  from public.answers
  where question_id = v_state.current_question_id and player_id = v_player_id;

  return public.apply_outcome(v_room_id, v_player_id, p_correct, p_method, v_raw);
end;
$function$;

revoke execute on function public.apply_verdict(text, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.apply_verdict(text, boolean, text, uuid) to service_role;


CREATE OR REPLACE FUNCTION public.leave_room(p_code text, p_player_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_room_id uuid;
  v_player_id uuid;
  v_version integer;
  v_state public.game_states%rowtype;
  v_next uuid;
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

  select * into v_state from public.game_states where room_id = v_room_id for update;

  delete from public.players where id = v_player_id;

  if v_state.chooser_player_id = v_player_id
     and v_state.phase not in ('lobby', 'finished') then
    select id into v_next
    from public.players
    where room_id = v_room_id and role = 'player'
    order by score desc, joined_at
    limit 1;
    update public.game_states
    set chooser_player_id = v_next
    where room_id = v_room_id;
  end if;

  update public.game_states
  set version = version + 1,
      updated_at = clock_timestamp()
  where room_id = v_room_id
  returning version into v_version;

  return jsonb_build_object('ok', true, 'version', v_version);
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
    else v_state.deadline
  end;

  if v_due is null or clock_timestamp() <= v_due then
    return jsonb_build_object('ok', true, 'advanced', false, 'phase', v_state.phase, 'version', v_state.version);
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
        deadline = clock_timestamp() + interval '25 seconds',
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
$function$;


notify pgrst, 'reload schema';
