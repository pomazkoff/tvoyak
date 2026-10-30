-- final_sheet дополнительно отдаёт question_id: серверу нужно знать тему
-- финального вопроса, чтобы подсказать судье её правила (например, ±20%
-- для «Сколько стоило?»). Только добавление поля в ответ.
CREATE OR REPLACE FUNCTION public.final_sheet(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
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
    'question_id', v_state.current_question_id,
    'prompt', v_prompt,
    'expected', v_secret.answer,
    'variants', to_jsonb(v_secret.variants),
    'rows', v_rows
  );
end;
$function$;
