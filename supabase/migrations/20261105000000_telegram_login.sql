-- Вход ведущего через Telegram (deep-link t.me/<бот>?start=login_<token>).
-- Храним только sha256 от токена. Живёт ~10 минут, одноразовый.
-- Только для service role (RLS без политик).

CREATE TABLE IF NOT EXISTS public.tg_login_tokens (
  token_hash   text PRIMARY KEY,
  origin       text NOT NULL,                 -- куда вернуть ведущего
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  tg_id        bigint,
  tg_name      text,
  tg_username  text,
  confirmed_at timestamptz,
  consumed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS tg_login_tokens_expires_idx
  ON public.tg_login_tokens (expires_at);

ALTER TABLE public.tg_login_tokens ENABLE ROW LEVEL SECURITY;
