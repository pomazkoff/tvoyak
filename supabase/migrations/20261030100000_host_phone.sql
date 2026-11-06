-- Ведущий с телефона. Экран ведущего (с host_secret) выдаёт одноразовый код
-- привязки; телефон обменивает его на свой ключ. В room_secrets хранятся
-- только хеши — anon этот стол не читает (revoke в init).
-- В rooms — два публичных флага без секретов: подключён ли телефон ведущего
-- (телевизор прячет панель «Ведущему») и читать ли вопрос вслух (переключатель
-- общий для телевизора и телефона). Миграция только добавляет колонки.

alter table public.room_secrets
  add column if not exists phone_pair_hash text,
  add column if not exists phone_pair_expires_at timestamptz,
  add column if not exists phone_token_hash text;

alter table public.rooms
  add column if not exists host_phone boolean not null default false,
  add column if not exists host_voice boolean;

comment on column public.rooms.host_phone is
  'Ведущий ведёт с телефона: большой экран не показывает панель «Ведущему».';
comment on column public.rooms.host_voice is
  'Читать вопрос вслух на экране ведущего; null — по умолчанию режима.';

grant select (host_phone, host_voice) on table public.rooms to anon, authenticated;

notify pgrst, 'reload schema';
