-- Сложность в банке: value из пачки (100…1000). start_game раскладывает
-- выбранные пять вопросов темы по возрастанию сложности.
alter table public.question_bank add column if not exists value integer;
alter table public.question_bank drop constraint if exists question_bank_value_check;
alter table public.question_bank add constraint question_bank_value_check
  check (value is null or value between 100 and 1000);

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

  -- Сначала темы, где у этой компании осталось хотя бы 5 невиденных
  -- вопросов, затем остальные; внутри — случайно.
  select coalesce(array_agg(category), '{}'::text[])
  into v_categories
  from (
    select b.category
    from public.question_bank b
    left join public.company_seen cs
      on cs.company_id = v_company and cs.bank_id = b.id
    group by b.category
    having count(*) >= 10
    order by (count(*) filter (where cs.bank_id is null) >= 5) desc, random()
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
        select picked.prompt, picked.answer, picked.variants
        from (
          select b.prompt, b.answer, b.variants, b.value
          from public.question_bank b
          left join public.company_seen cs
            on cs.company_id = v_company and cs.bank_id = b.id
          where b.category = v_category
          -- невиденные, потом давно виденные
          order by cs.seen_at asc nulls first, random()
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
