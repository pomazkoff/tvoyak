-- Заявки с B2B-лендинга tvoyak.ru/business («Твояк для баров и корпоративов»).
--
-- Пишет только серверный роут /api/b2b-lead ключом service role. У anon и
-- authenticated нет ни чтения, ни записи: RLS включён без политик, права
-- отозваны. Читать заявки — из панели Supabase или service role.

create table if not exists public.b2b_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 80),
  company text not null check (char_length(company) between 1 and 120),
  lead_type text not null
    check (lead_type in ('bar', 'corporate', 'agency', 'other')),
  contact text not null check (char_length(contact) between 3 and 120),
  event_date date,
  comment text check (comment is null or char_length(comment) <= 1500),
  source text not null default 'business',
  user_agent text,
  notified_at timestamptz,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'won', 'lost', 'spam'))
);

comment on table public.b2b_leads is
  'Заявки с /business. Только service role: без публичного чтения и записи.';

create index if not exists b2b_leads_created_at_idx
  on public.b2b_leads (created_at desc);

alter table public.b2b_leads enable row level security;

revoke all on table public.b2b_leads from public, anon, authenticated;
grant select, insert, update on table public.b2b_leads to service_role;
