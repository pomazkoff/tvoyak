-- Код для телевизора. Телефон ведущего (уже с ключом комнаты) показывает
-- шесть цифр, телевизор на /tv меняет их на свой ключ экрана. Входа на
-- телевизоре нет. В room_secrets — только хеши: anon эту таблицу не читает
-- (revoke в init). Миграция только добавляет колонки, таблицу и функцию.
--
-- Лимит попыток: 10-минутное окно на ключ (хеш IP и отдельный общий счётчик).
-- Потолок задаёт вызывающий код. Неверный код тоже тратит попытку.

alter table public.room_secrets
  add column if not exists tv_code_hash text,
  add column if not exists tv_code_expires_at timestamptz,
  add column if not exists tv_screen_hash text;

comment on column public.room_secrets.tv_code_hash is
  'sha256 шестизначного кода для /tv. Пусто — кода нет.';
comment on column public.room_secrets.tv_code_expires_at is
  'До какого момента код /tv ещё принимается.';
comment on column public.room_secrets.tv_screen_hash is
  'sha256 ключа большого экрана, выданного по коду /tv. Принимается наравне с host_secret.';

-- Один живой код — одна комната. Просроченные хеши код приложения стирает,
-- иначе цифра навсегда занимает слот.
create unique index if not exists room_secrets_tv_code_hash_idx
  on public.room_secrets (tv_code_hash)
  where tv_code_hash is not null;

create table if not exists public.tv_code_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);

comment on table public.tv_code_limits is
  'Счётчик попыток ввода кода /tv: по адресу и общий, окно 10 минут.';

alter table public.tv_code_limits enable row level security;
revoke all on table public.tv_code_limits from anon, authenticated;

-- true — лимит не превышен. p_limit задаёт потолок на это окно.
create or replace function public.tv_code_rate_hit(p_key text, p_limit integer)
returns boolean
language sql
security definer
set search_path = public
as $$
  insert into public.tv_code_limits as l (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case
      when l.window_start < now() - interval '10 minutes' then now()
      else l.window_start
    end,
    hits = case
      when l.window_start < now() - interval '10 minutes' then 1
      else l.hits + 1
    end
  returning hits <= p_limit;
$$;

revoke all on function public.tv_code_rate_hit(text, integer) from public;
grant execute on function public.tv_code_rate_hit(text, integer) to service_role;

notify pgrst, 'reload schema';
