-- Канал комнаты и оплаты: first-touch и last-touch UTM.
-- Код пишет колонку отдельно и молча пропускает ошибку «колонки нет»,
-- поэтому выкладка до этой миграции комнаты и платежи не ломает.
--
-- Без plpgsql-функций. CASE внутри условия IF в plpgsql нужно брать
-- в скобки, иначе парсер падает на CASE; здесь такого кода нет.

alter table public.rooms
  add column if not exists utm jsonb;

comment on column public.rooms.utm is
  'Канал комнаты: {first,last} с ключами source, medium, campaign, content, term. Без персональных данных.';

alter table public.host_payments
  add column if not exists utm jsonb;

comment on column public.host_payments.utm is
  'Канал платежа: {first,last} с ключами source, medium, campaign, content, term. Без персональных данных.';
