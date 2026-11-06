-- Фиксированное (тематическое) поле комнаты. Additive: новая nullable колонка
-- room_secrets.board_categories; null — всё как раньше.
-- Если задано ровно 12 тем (1–6 — раунд 1, 7–12 — раунд 2, у каждой ≥5
-- вопросов), start_game берёт их как есть (порядок колонок — случайный) и не
-- добавляет «Детский рисунок»; финал continue_game — из этих же тем.
-- Пример: музыкальная игра без «Классики».

alter table public.room_secrets
  add column if not exists board_categories text[];

comment on column public.room_secrets.board_categories is
  '12 тем фиксированного поля (1–6 — раунд 1, 7–12 — раунд 2). null — обычный подбор.';

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
  -- «Детский рисунок» — обязательная картиночная тема каждой игры.
  v_kids constant text := 'Детский рисунок';
  v_kids_round integer;
  v_kids_pending boolean := false;
  v_kids_fam text;
  -- Фиксированное поле комнаты (room_secrets.board_categories).
  v_board text[];
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

  select company_id, board_categories into v_company, v_board
  from public.room_secrets
  where room_id = v_room.id;

  -- Фиксированное поле: ровно 12 тем (1–6 — первый раунд, 7–12 — второй),
  -- у каждой ≥5 доступных вопросов. Иначе — обычный подбор.
  if v_board is not null and (
    coalesce(array_length(v_board, 1), 0) <> 12
    or (select count(distinct c) from unnest(v_board) as c) <> 12
    or exists (
      select 1 from unnest(v_board) as c
      where (
        select count(*) from public.question_bank b
        where b.category = c and (b.picture is null or b.enabled)
      ) < 5
    )
  ) then
    v_board := null;
  end if;

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
  if v_board is not null then
    v_categories :=
      array(select x from unnest(v_board[1:6]) as x order by random())
      || array(select x from unnest(v_board[7:12]) as x order by random());
  else
  v_video_round := 1 + floor(random() * 2)::integer;
  -- «Детский рисунок» занимает картиночный слот одного (случайного) раунда;
  -- второй картиночный слот — другая картиночная тема. Если темы нет среди
  -- кандидатов (меньше 10 вопросов) — всё как раньше.
  if v_kids = any(v_names) then
    v_kids_round := 1 + floor(random() * 2)::integer;
    v_kids_pending := true;
    select m.family into v_kids_fam from public.category_meta m where m.category = v_kids;
  end if;
  v_categories := '{}'::text[];
  for v_round in 1..2 loop
    v_round_cats := '{}'::text[];
    v_round_fams := '{}'::text[];
    -- В раунде «Детского рисунка» он выбирается первым, чтобы его семейство
    -- (cinema) не заняла другая тема этого раунда.
    v_slots := array[
      case when v_round = v_kids_round then 'kids' else 'music' end,
      case when v_round = v_kids_round then 'music' else 'picture' end,
      'brain',
      case when v_round = v_video_round then 'video' else 'text' end,
      'text', 'text'
    ];
    foreach v_slot in array v_slots loop
      v_pick_cat := null;
      if v_slot = 'kids' then
        v_pick_cat := v_kids;
        v_pick_kind := 'picture';
        v_pick_fam := v_kids_fam;
        v_kids_pending := false;
      else
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
            and c.name <> v_kids
            and (
              not v_strict
              or (
                (c.fam is null or not (c.fam = any(v_round_fams)))
                and (c.kind <> 'music' or v_music < 2)
                -- место под «Детский рисунок» зарезервировано
                and (c.kind <> 'picture'
                  or v_picture < 2 - case when v_kids_pending then 1 else 0 end)
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
      end if;

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
  v_board text[];
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

  select rs.board_categories into v_board
  from public.room_secrets rs where rs.room_id = v_room_id;

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
    -- Фиксированное поле: финал — из тех же тем.
    and (v_board is null or b.category = any(v_board))
    and not exists (
    select 1
    from public.questions q
    join public.question_secrets s on s.question_id = q.id
    where q.room_id = v_room_id and q.prompt = b.prompt and s.answer = b.answer
  )
  order by
    -- в тематической игре финал по возможности без медиа
    (v_board is not null and (b.audio_url is not null or b.vk_url is not null
      or b.youtube_id is not null or b.rutube_url is not null)),
    cs.seen_at asc nulls first, random()
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

notify pgrst, 'reload schema';
