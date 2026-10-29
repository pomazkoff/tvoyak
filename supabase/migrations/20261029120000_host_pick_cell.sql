-- Запасной ход с телевизора в режиме бота. Клетку по-прежнему выбирает игрок
-- через pick_cell. Если телефон не нажал, ведущий этой комнаты может открыть
-- ту же клетку: функция только у service_role, её зовёт /api/host/action.

create or replace function public.host_pick_cell(
  p_code text,
  p_question_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
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

revoke all on function public.host_pick_cell(text, uuid) from public, anon, authenticated;
grant execute on function public.host_pick_cell(text, uuid) to service_role;
