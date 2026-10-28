-- M2: картинка, видео и музыка. Ссылки, без скачивания.
-- Видео: YouTube (IFrame API, таймкоды), запасной VK, затем Rutube.
-- curtain прячет картинку ролика, остаётся звук.

alter table public.question_bank
  add column kind text not null default 'text',
  add column youtube_id text,
  add column vk_url text,
  add column rutube_url text,
  add column image_url text,
  add column start_seconds integer,
  add column end_seconds integer,
  add column curtain boolean not null default false,
  add constraint question_bank_kind_check check (kind in ('text', 'image', 'video', 'music')),
  add constraint question_bank_window_check check (
    start_seconds is null or start_seconds >= 0
  ),
  add constraint question_bank_window_end_check check (
    end_seconds is null or start_seconds is null or end_seconds > start_seconds
  );

alter table public.questions
  add column kind text not null default 'text',
  add column youtube_id text,
  add column vk_url text,
  add column rutube_url text,
  add column image_url text,
  add column start_seconds integer,
  add column end_seconds integer,
  add column curtain boolean not null default false,
  add constraint questions_kind_check check (kind in ('text', 'image', 'video', 'music'));

alter table public.rooms
  add column host_starts_media boolean not null default false;

comment on column public.rooms.host_starts_media is
  'Живой ведущий сам включает трек. Бот запускает ролик сразу.';

comment on column public.questions.curtain is
  'Своя шторка поверх плеера: виден только звук.';

create or replace function public.copy_question_media()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.questions q
  set kind = b.kind,
      youtube_id = b.youtube_id,
      vk_url = b.vk_url,
      rutube_url = b.rutube_url,
      image_url = b.image_url,
      start_seconds = b.start_seconds,
      end_seconds = b.end_seconds,
      curtain = b.curtain
  from public.question_bank b
  where q.id = new.id
    and b.category = new.category
    and b.prompt = new.prompt;
  return new;
end;
$$;

drop trigger if exists questions_copy_media on public.questions;
create trigger questions_copy_media
after insert on public.questions
for each row
execute function public.copy_question_media();

create or replace function public.set_host_starts_media(p_code text, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_room_id uuid;
begin
  v_room_id := public.room_id_by_code(p_code);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;
  update public.rooms
  set host_starts_media = coalesce(p_on, false)
  where id = v_room_id;
  return jsonb_build_object('ok', true, 'host_starts_media', coalesce(p_on, false));
end;
$$;

revoke all on function public.copy_question_media() from public, anon, authenticated;
revoke all on function public.set_host_starts_media(text, boolean) from public;
grant execute on function public.set_host_starts_media(text, boolean) to service_role;

drop view if exists public.question_board;
create view public.question_board
with (security_barrier = true, security_invoker = false) as
select
  q.id,
  q.room_id,
  q.round,
  q.category,
  q.value,
  q.row_index,
  q.col_index,
  q.status,
  case when q.status = 'hidden' then null else q.prompt end as prompt,
  case when q.status = 'hidden' then null else q.special end as special,
  case when q.status = 'hidden' then null else q.assigned_player_id end as assigned_player_id,
  case when q.status = 'answered' then s.answer else null end as revealed_answer,
  case when q.status = 'hidden' then 'text' else q.kind end as kind,
  case when q.status = 'hidden' then null else q.youtube_id end as youtube_id,
  case when q.status = 'hidden' then null else q.vk_url end as vk_url,
  case when q.status = 'hidden' then null else q.rutube_url end as rutube_url,
  case when q.status = 'hidden' then null else q.image_url end as image_url,
  case when q.status = 'hidden' then null else q.start_seconds end as start_seconds,
  case when q.status = 'hidden' then null else q.end_seconds end as end_seconds,
  case when q.status = 'hidden' then false else q.curtain end as curtain
from public.questions q
left join public.question_secrets s on s.question_id = q.id;

grant select on public.question_board to anon, authenticated, service_role;

notify pgrst, 'reload schema';
