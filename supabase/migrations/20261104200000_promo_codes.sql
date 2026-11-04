-- Промокоды для ведущих — по образцу бюро (buro-etozhety, миграции 0017/0019).
--
-- Код — ярлык канала (TG-KANAL, BLOG-ANNA, BAR-XYZ). Виды:
--   percent / rub      — скидка на 99 ₽ или 499 ₽ (product = null — на любой);
--                        скидка до нуля выдаёт тариф сразу, без ЮKassa;
--   games              — N бесплатных партий на баланс;
--   unlimited_days     — безлимит на N дней.
-- Каждый ведущий может применить код один раз. Использования не хранятся
-- счётчиком: их считают по promo_redemptions (used + свежие брони < 1 ч).

CREATE TABLE IF NOT EXISTS public.promo_codes (
  code        text PRIMARY KEY,                -- верхний регистр, A-Z0-9 и дефис
  kind        text NOT NULL CHECK (kind IN ('percent', 'rub', 'games', 'unlimited_days')),
  value       integer NOT NULL CHECK (value > 0),
  product     text CHECK (product IN ('game', 'month')),
  channel     text NOT NULL,
  note        text,
  max_uses    integer CHECK (max_uses > 0),   -- null — без лимита
  starts_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,                    -- null — бессрочно
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_percent_range CHECK (kind <> 'percent' OR value <= 100),
  CONSTRAINT promo_code_shape CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{1,30}[A-Z0-9]$')
);

ALTER TABLE public.host_payments
  ADD COLUMN IF NOT EXISTS promo_code text REFERENCES public.promo_codes (code),
  ADD COLUMN IF NOT EXISTS discount_rub integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.promo_redemptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL REFERENCES public.promo_codes (code),
  user_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  payment_id  uuid REFERENCES public.host_payments (id),
  status      text NOT NULL CHECK (status IN ('reserved', 'used', 'released')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  used_at     timestamptz
);
-- Один ведущий — одно применение кода (бронь или использование).
CREATE UNIQUE INDEX IF NOT EXISTS promo_redemptions_once
  ON public.promo_redemptions (code, user_id) WHERE status IN ('reserved', 'used');
CREATE INDEX IF NOT EXISTS promo_redemptions_payment
  ON public.promo_redemptions (payment_id) WHERE payment_id IS NOT NULL;

-- Ограничение частоты проверок (как promo_check_limits в бюро): иначе
-- ручка проверки — оракул для перебора кодов.
CREATE TABLE IF NOT EXISTS public.promo_check_limits (
  key          text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits         integer NOT NULL DEFAULT 0
);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_check_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.promo_codes, public.promo_redemptions, public.promo_check_limits
  FROM anon, authenticated;

-- true — лимит не превышен. 10 проверок за 10 минут на ключ (хэш IP).
CREATE OR REPLACE FUNCTION public.promo_rate_hit(p_key text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.promo_check_limits AS l (key, window_start, hits)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE SET
    window_start = CASE WHEN l.window_start < now() - interval '10 minutes' THEN now() ELSE l.window_start END,
    hits = CASE WHEN l.window_start < now() - interval '10 minutes' THEN 1 ELSE l.hits + 1 END
  RETURNING hits <= 10;
$$;

-- Выдать тариф (для 100 % скидки) или бонус кода.
CREATE OR REPLACE FUNCTION public.promo_grant(p_user uuid, p_credits integer, p_days integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.host_entitlements (user_id) VALUES (p_user)
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.host_entitlements
    SET credits = credits + p_credits,
        unlimited_until = CASE WHEN p_days > 0
          THEN greatest(coalesce(unlimited_until, now()), now()) + make_interval(days => p_days)
          ELSE unlimited_until END,
        updated_at = now()
    WHERE user_id = p_user;
END;
$$;

-- Проверить (p_commit = false) или применить код.
-- Ответ: {ok:false, reason} | {ok:true, kind, value, ...}
--   применение бонуса/100 % скидки → granted: true
--   скидка → payment_id (строка host_payments с ценой со скидкой) и price_rub
CREATE OR REPLACE FUNCTION public.promo_apply(
  p_code text, p_user uuid, p_product text, p_commit boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.promo_codes%ROWTYPE;
  uses integer;
  base integer;
  discount integer;
  price integer;
  pay_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('promo:' || p_code));

  -- Брошенные брони (оплата не пришла за час) освобождаются.
  UPDATE public.promo_redemptions r SET status = 'released'
    WHERE r.code = p_code AND r.status = 'reserved'
      AND r.created_at < now() - interval '1 hour'
      AND NOT EXISTS (SELECT 1 FROM public.host_payments hp
                      WHERE hp.id = r.payment_id AND hp.credited_at IS NOT NULL);

  SELECT * INTO p FROM public.promo_codes WHERE code = p_code;
  IF NOT FOUND OR NOT p.active THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'promo_not_found');
  END IF;
  IF p.starts_at > now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'promo_not_started');
  END IF;
  IF p.expires_at IS NOT NULL AND p.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'promo_expired');
  END IF;
  IF p_user IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.promo_redemptions
    WHERE code = p_code AND user_id = p_user AND status IN ('reserved', 'used')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'promo_used');
  END IF;
  SELECT count(*) INTO uses FROM public.promo_redemptions
    WHERE code = p_code AND status IN ('reserved', 'used');
  IF p.max_uses IS NOT NULL AND uses >= p.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'promo_exhausted');
  END IF;

  -- Бонусы: партии или дни безлимита.
  IF p.kind IN ('games', 'unlimited_days') THEN
    IF p_commit THEN
      IF p_user IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'login_required');
      END IF;
      INSERT INTO public.promo_redemptions (code, user_id, status, used_at)
        VALUES (p_code, p_user, 'used', now());
      PERFORM public.promo_grant(p_user,
        CASE WHEN p.kind = 'games' THEN p.value ELSE 0 END,
        CASE WHEN p.kind = 'unlimited_days' THEN p.value ELSE 0 END);
      RETURN jsonb_build_object('ok', true, 'kind', p.kind, 'value', p.value, 'granted', true);
    END IF;
    RETURN jsonb_build_object('ok', true, 'kind', p.kind, 'value', p.value);
  END IF;

  -- Скидки.
  IF p_product IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'kind', p.kind, 'value', p.value, 'product', p.product);
  END IF;
  IF p_product NOT IN ('game', 'month') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_product');
  END IF;
  IF p.product IS NOT NULL AND p.product <> p_product THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'promo_wrong_product');
  END IF;
  base := CASE p_product WHEN 'game' THEN 99 ELSE 499 END;  -- = PRODUCTS в products.ts
  discount := CASE p.kind WHEN 'percent' THEN round(base * p.value / 100.0)::integer ELSE p.value END;
  discount := greatest(0, least(base, discount));
  price := base - discount;
  IF NOT p_commit THEN
    RETURN jsonb_build_object('ok', true, 'kind', p.kind, 'value', p.value,
      'product', p_product, 'discount_rub', discount, 'price_rub', price);
  END IF;
  IF p_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'login_required');
  END IF;
  IF price = 0 THEN
    INSERT INTO public.promo_redemptions (code, user_id, status, used_at)
      VALUES (p_code, p_user, 'used', now());
    PERFORM public.promo_grant(p_user,
      CASE WHEN p_product = 'game' THEN 1 ELSE 0 END,
      CASE WHEN p_product = 'month' THEN 30 ELSE 0 END);
    RETURN jsonb_build_object('ok', true, 'kind', p.kind, 'value', p.value,
      'product', p_product, 'granted', true, 'price_rub', 0, 'discount_rub', discount);
  END IF;
  INSERT INTO public.host_payments (user_id, product, amount_rub, promo_code, discount_rub)
    VALUES (p_user, p_product, price, p_code, discount)
    RETURNING id INTO pay_id;
  INSERT INTO public.promo_redemptions (code, user_id, payment_id, status)
    VALUES (p_code, p_user, pay_id, 'reserved');
  RETURN jsonb_build_object('ok', true, 'kind', p.kind, 'value', p.value,
    'product', p_product, 'payment_id', pay_id, 'price_rub', price, 'discount_rub', discount);
END;
$$;

-- Зачисление платежа: то же, что раньше, плюс бронь промокода → used.
CREATE OR REPLACE FUNCTION public.billing_credit(p_yookassa_id text, p_test boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay public.host_payments%ROWTYPE;
BEGIN
  UPDATE public.host_payments
    SET status = 'succeeded', test = p_test,
        paid_at = coalesce(paid_at, now()), credited_at = now()
    WHERE yookassa_id = p_yookassa_id AND credited_at IS NULL
    RETURNING * INTO pay;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  INSERT INTO public.host_entitlements (user_id) VALUES (pay.user_id)
    ON CONFLICT (user_id) DO NOTHING;
  IF pay.product = 'game' THEN
    UPDATE public.host_entitlements SET credits = credits + 1, updated_at = now()
      WHERE user_id = pay.user_id;
  ELSE
    UPDATE public.host_entitlements
      SET unlimited_until = greatest(coalesce(unlimited_until, now()), now()) + interval '30 days',
          updated_at = now()
      WHERE user_id = pay.user_id;
  END IF;
  -- Если бронь уже освобождена (оплата пришла позже часа) — всё равно used:
  -- деньги со скидкой взяты. Уникальный индекс не даст, если ведущий
  -- успел применить код заново; тогда оставляем как есть.
  BEGIN
    UPDATE public.promo_redemptions SET status = 'used', used_at = now()
      WHERE payment_id = pay.id AND status <> 'used';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  RETURN jsonb_build_object('ok', true, 'product', pay.product);
END;
$$;

-- Отмена платежа освобождает бронь кода.
CREATE OR REPLACE FUNCTION public.promo_release_payment(p_payment uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.promo_redemptions SET status = 'released'
    WHERE payment_id = p_payment AND status = 'reserved';
$$;

REVOKE ALL ON FUNCTION public.promo_rate_hit(text), public.promo_grant(uuid, integer, integer),
  public.promo_apply(text, uuid, text, boolean), public.promo_release_payment(uuid),
  public.billing_credit(text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promo_rate_hit(text), public.promo_grant(uuid, integer, integer),
  public.promo_apply(text, uuid, text, boolean), public.promo_release_payment(uuid),
  public.billing_credit(text, boolean)
  TO service_role;
