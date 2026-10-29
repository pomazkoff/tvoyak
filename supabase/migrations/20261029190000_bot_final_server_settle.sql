-- Финал у бота больше не зависит от открытого телевизора.
-- 1) При переходе в judging (раунд 3, бот) ставится срок 20 с.
-- 2) Сервер Next.js (/api/play/settle, ответ игрока) успевает проверить ответы
--    с LLM; если никто не успел — tick_room по сроку сам подводит итог
--    нормализованным сравнением (auto_settle_final).

create or replace function public.norm_answer(p text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select btrim(regexp_replace(
    regexp_replace(replace(lower(coalesce(p, '')), 'ё', 'е'), '[^[:alnum:][:space:]]+', ' ', 'g'),
    '\s+', ' ', 'g'))
$$;

create or replace function public.answer_matches(p_given text, p_expected text, p_variants text[])
returns boolean
language plpgsql
immutable
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_given text := public.norm_answer(p_given);
  v_cand text;
begin
  if v_given = '' then
    return false;
  end if;
  foreach v_cand in array (array[p_expected] || coalesce(p_variants, '{}'::text[]))
  loop
    v_cand := public.norm_answer(v_cand);
    continue when v_cand = '';
    if v_given = v_cand
      or (char_length(v_cand) >= 3 and (' ' || v_given || ' ') like ('% ' || v_cand || ' %'))
    then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

create or replace function public.auto_settle_final(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $$
declare
  v_room_id uuid;
  v_state public.game_states%rowtype;
  v_secret public.question_secrets%rowtype;
  v_rows jsonb;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;
  select * into v_state from public.game_states where room_id = v_room_id;
  if v_state.phase <> 'judging' or v_state.round <> 3 or v_state.current_question_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;
  select * into v_secret from public.question_secrets where question_id = v_state.current_question_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'player_id', a.player_id,
    'correct', coalesce(a.suggestion_correct,
      public.answer_matches(a.raw_text, v_secret.answer, v_secret.variants)),
    'method', case when a.suggestion_correct is not null then coalesce(a.method, 'fuzzy') else 'exact' end
  )), '[]'::jsonb)
  into v_rows
  from public.answers a
  where a.question_id = v_state.current_question_id and a.verdict = 'pending';

  return public.apply_final(p_code, v_rows);
end;
$$;

revoke all on function public.auto_settle_final(text) from public, anon, authenticated;
grant execute on function public.auto_settle_final(text) to service_role;

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

CREATE OR REPLACE FUNCTION public.begin_final_answer(p_code text, p_player_token text, p_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
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
        deadline = case
          when (select host_mode from public.rooms where id = v_room_id) = 'bot'
            then clock_timestamp() + interval '20 seconds'
        end,
        version = version + 1,
        updated_at = clock_timestamp()
    where room_id = v_room_id
    returning version into v_version;
  else
    select version into v_version from public.game_states where room_id = v_room_id;
  end if;

  return jsonb_build_object('ok', true, 'version', v_version, 'ready', v_have >= v_need);
end;
$function$;

-- Уже застрявшие финалы бота без срока тоже подхватит tick (updated_at + 20 с).
notify pgrst, 'reload schema';
