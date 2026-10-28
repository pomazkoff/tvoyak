-- M3/M4: пачки вопросов и протоколы проверки.
-- Anon их не читает. Принимает пачку только сервер с ADMIN_TOKEN.

create table public.question_packs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'collecting',
  source_notes text not null default '',
  error text,
  created_at timestamptz not null default now(),
  constraint question_packs_status_check check (
    status in ('collecting', 'reviewing', 'ready', 'failed', 'approved', 'rejected')
  )
);

create table public.pack_items (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.question_packs (id) on delete cascade,
  category text not null,
  prompt text not null,
  answer text not null,
  variants text[] not null default '{}',
  value integer not null default 100,
  kind text not null default 'text',
  curtain boolean not null default false,
  status text not null default 'draft',
  agent_mark text,
  constraint pack_items_status_check check (status in ('draft', 'approved', 'rejected')),
  constraint pack_items_value_check check (value in (100, 200, 300, 400, 500, 600, 800, 1000)),
  constraint pack_items_kind_check check (kind in ('text', 'image', 'video', 'music'))
);

create table public.pack_reviews (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.question_packs (id) on delete cascade,
  item_id uuid references public.pack_items (id) on delete cascade,
  pass text not null,
  status text not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint pack_reviews_pass_check check (
    pass in ('safety', 'fact', 'freshness', 'difficulty', 'duplicates')
  ),
  constraint pack_reviews_status_check check (status in ('passed', 'failed', 'skipped'))
);

create index pack_items_pack_idx on public.pack_items (pack_id);
create index pack_reviews_pack_idx on public.pack_reviews (pack_id);

alter table public.question_packs enable row level security;
alter table public.pack_items enable row level security;
alter table public.pack_reviews enable row level security;

revoke all on table public.question_packs from anon, authenticated;
revoke all on table public.pack_items from anon, authenticated;
revoke all on table public.pack_reviews from anon, authenticated;

grant all on table public.question_packs to service_role;
grant all on table public.pack_items to service_role;
grant all on table public.pack_reviews to service_role;

comment on table public.question_packs is
  'Сгенерированная пачка. status=failed, если нет ключа OpenRouter или проверка не прошла.';

notify pgrst, 'reload schema';
