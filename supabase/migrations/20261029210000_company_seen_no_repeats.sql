-- «Без повторов для компании»: компания = браузер ведущего (uuid в его
-- localStorage, приходит в POST /api/rooms). Храним в room_secrets, чтобы
-- клиенты его не видели. Вопрос считается увиденным, когда его открыли.

alter table public.room_secrets add column if not exists company_id uuid;
create index if not exists room_secrets_company_idx on public.room_secrets (company_id);

create table if not exists public.company_seen (
  company_id uuid not null,
  bank_id uuid not null references public.question_bank (id) on delete cascade,
  seen_at timestamptz not null default now(),
  times integer not null default 1,
  primary key (company_id, bank_id)
);
alter table public.company_seen enable row level security;
revoke all on public.company_seen from anon, authenticated;

create or replace function public.mark_company_seen()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_company uuid;
begin
  if old.status <> 'hidden' or new.status = 'hidden' then
    return new;
  end if;
  select company_id into v_company
  from public.room_secrets
  where room_id = new.room_id;
  if v_company is null then
    return new;
  end if;
  insert into public.company_seen (company_id, bank_id, seen_at)
  select v_company, b.id, now()
  from public.question_bank b
  where b.category = new.category and b.prompt = new.prompt
  on conflict (company_id, bank_id)
  do update set seen_at = excluded.seen_at, times = public.company_seen.times + 1;
  return new;
end;
$function$;

drop trigger if exists questions_mark_company_seen on public.questions;
create trigger questions_mark_company_seen
after update of status on public.questions
for each row execute function public.mark_company_seen();

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
        select b.prompt, b.answer, b.variants
        from public.question_bank b
        left join public.company_seen cs
          on cs.company_id = v_company and cs.bank_id = b.id
        where b.category = v_category
        -- невиденные, потом давно виденные
        order by cs.seen_at asc nulls first, random()
        limit 5
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
$function$

;

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
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  select * into v_state from public.game_states where room_id = v_room_id for update;
  if v_state.phase <> 'reveal' then
    return jsonb_build_object('ok', false, 'error', 'bad_phase');
  end if;

  select count(*) into v_hidden
  from public.questions
  where room_id = v_room_id and round = v_state.round and status = 'hidden';

  if v_hidden > 0 then
    update public.game_states
    set phase = 'board',
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

  select b.prompt, b.answer, b.variants, b.category
  into v_pick
  from public.question_bank b
  left join public.company_seen cs
    on cs.company_id = (
      select rs.company_id from public.room_secrets rs where rs.room_id = v_room_id
    )
    and cs.bank_id = b.id
  where not exists (
    select 1
    from public.questions q
    join public.question_secrets s on s.question_id = q.id
    where q.room_id = v_room_id and q.prompt = b.prompt and s.answer = b.answer
  )
  order by cs.seen_at asc nulls first, random()
  limit 1;

  if not found then
    select prompt, answer, variants, category
    into v_pick
    from public.question_bank
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
$function$

;
