-- Очередь кнопки. Нажатие, пока другой игрок ещё отвечает, пишется в buzzes
-- с is_first = false. Раньше apply_outcome считал любую такую строку потраченной
-- попыткой, и почти одновременный второй игрок не получал ход. Теперь самое раннее
-- нажатие без засчитанного ответа становится его ходом: фаза answering и новые 20 секунд.
-- Если очереди нет, окно кнопки открывается снова только для тех, кто ещё не нажимал.

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

-- Ставка финала секретная: колонка answers.wager не уходит роли anon.
revoke select (wager) on table public.answers from anon, authenticated;

notify pgrst, 'reload schema';
