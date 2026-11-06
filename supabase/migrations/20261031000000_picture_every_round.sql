-- Картиночные темы в каждом раунде.
-- Баг: за игру на поле попадала ровно одна картиночная тема (медиа-слот —
-- видео в одном раунде, картинки в другом), и в половине игр она стояла во
-- втором раунде, до которого компания доходит не всегда или к самому концу.
-- Теперь picture-слот есть в обоих раундах (лимит 2 за игру), видео остаётся
-- в одном случайном раунде вместо одной из текстовых тем.

create or replace function public.start_game(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
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
  v_video_round := 1 + floor(random() * 2)::integer;
  v_categories := '{}'::text[];
  for v_round in 1..2 loop
    v_round_cats := '{}'::text[];
    v_round_fams := '{}'::text[];
    v_slots := array[
      'music', 'picture', 'brain',
      case when v_round = v_video_round then 'video' else 'text' end,
      'text', 'text'
    ];
    foreach v_slot in array v_slots loop
      v_pick_cat := null;
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
            and (
              not v_strict
              or (
                (c.fam is null or not (c.fam = any(v_round_fams)))
                and (c.kind <> 'music' or v_music < 2)
                and (c.kind <> 'picture' or v_picture < 2)
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
