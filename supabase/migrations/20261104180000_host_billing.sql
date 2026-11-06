-- Платный ведущий: первая партия бесплатно, дальше 99 ₽ за партию или
-- 499 ₽ за 30 дней безлимита. Игроки не платят никогда.
-- Работает только при PAYWALL_ENABLED=1; без флага таблицы просто пустые.
-- Все таблицы — только для service role (RLS без политик).

CREATE TABLE IF NOT EXISTS public.host_entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  credits integer NOT NULL DEFAULT 0 CHECK (credits >= 0),
  unlimited_until timestamptz,
  free_used_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Бесплатная партия считается и по устройству, и по аккаунту, и (мягко) по IP.
CREATE TABLE IF NOT EXISTS public.host_free_games (
  device_id text PRIMARY KEY CHECK (char_length(device_id) BETWEEN 16 AND 64),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_hash text,
  room_id uuid,
  used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS host_free_games_ip_idx
  ON public.host_free_games (ip_hash, used_at);

CREATE TABLE IF NOT EXISTS public.host_payments (
  -- Он же ключ идемпотентности для ЮKassa.
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product text NOT NULL CHECK (product IN ('game', 'month')),
  amount_rub integer NOT NULL CHECK (amount_rub > 0),
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'pending', 'succeeded', 'canceled')),
  yookassa_id text UNIQUE,
  test boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  credited_at timestamptz
);
CREATE INDEX IF NOT EXISTS host_payments_user_idx
  ON public.host_payments (user_id, created_at DESC);

-- Кто платит за комнату. Списание — на старте партии, не при создании.
CREATE TABLE IF NOT EXISTS public.room_billing (
  room_id uuid PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  device_id text,
  ip_hash text,
  kind text CHECK (kind IN ('free', 'credit', 'unlimited')),
  charged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.host_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_free_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_billing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.host_entitlements, public.host_free_games,
  public.host_payments, public.room_billing FROM anon, authenticated;

-- Списать партию за комнату. Идемпотентно: повторный старт не списывает.
CREATE OR REPLACE FUNCTION public.billing_consume(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rb public.room_billing%ROWTYPE;
  ent public.host_entitlements%ROWTYPE;
  v_kind text;
  v_ip_free integer := 0;
BEGIN
  SELECT * INTO rb FROM public.room_billing WHERE room_id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    -- Комната создана до включения оплаты.
    RETURN jsonb_build_object('ok', true, 'kind', 'legacy');
  END IF;
  IF rb.charged_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'kind', rb.kind, 'repeat', true);
  END IF;

  IF rb.user_id IS NOT NULL THEN
    INSERT INTO public.host_entitlements (user_id) VALUES (rb.user_id)
      ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO ent FROM public.host_entitlements
      WHERE user_id = rb.user_id FOR UPDATE;
    IF ent.unlimited_until IS NOT NULL AND ent.unlimited_until > now() THEN
      v_kind := 'unlimited';
    END IF;
  END IF;

  IF v_kind IS NULL AND rb.device_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.host_free_games WHERE device_id = rb.device_id)
     AND (rb.user_id IS NULL OR ent.free_used_at IS NULL) THEN
    IF rb.ip_hash IS NOT NULL THEN
      SELECT count(*) INTO v_ip_free FROM public.host_free_games
        WHERE ip_hash = rb.ip_hash AND used_at > now() - interval '30 days';
    END IF;
    IF v_ip_free < 3 THEN
      INSERT INTO public.host_free_games (device_id, user_id, ip_hash, room_id)
        VALUES (rb.device_id, rb.user_id, rb.ip_hash, p_room_id);
      IF rb.user_id IS NOT NULL THEN
        UPDATE public.host_entitlements SET free_used_at = now(), updated_at = now()
          WHERE user_id = rb.user_id;
      END IF;
      v_kind := 'free';
    END IF;
  END IF;

  IF v_kind IS NULL AND rb.user_id IS NOT NULL AND ent.credits > 0 THEN
    UPDATE public.host_entitlements
      SET credits = credits - 1, updated_at = now()
      WHERE user_id = rb.user_id;
    v_kind := 'credit';
  END IF;

  IF v_kind IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', CASE WHEN rb.user_id IS NULL THEN 'login_required' ELSE 'payment_required' END
    );
  END IF;

  UPDATE public.room_billing SET kind = v_kind, charged_at = now()
    WHERE room_id = p_room_id;
  RETURN jsonb_build_object('ok', true, 'kind', v_kind);
END;
$$;

-- Вернуть списание, если сам старт не прошёл.
CREATE OR REPLACE FUNCTION public.billing_release(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rb public.room_billing%ROWTYPE;
BEGIN
  SELECT * INTO rb FROM public.room_billing WHERE room_id = p_room_id FOR UPDATE;
  IF NOT FOUND OR rb.charged_at IS NULL THEN RETURN; END IF;
  IF rb.kind = 'credit' THEN
    UPDATE public.host_entitlements SET credits = credits + 1, updated_at = now()
      WHERE user_id = rb.user_id;
  ELSIF rb.kind = 'free' THEN
    DELETE FROM public.host_free_games WHERE room_id = p_room_id;
    IF rb.user_id IS NOT NULL THEN
      UPDATE public.host_entitlements SET free_used_at = NULL, updated_at = now()
        WHERE user_id = rb.user_id;
    END IF;
  END IF;
  UPDATE public.room_billing SET kind = NULL, charged_at = NULL
    WHERE room_id = p_room_id;
END;
$$;

-- Зачислить оплаченный платёж ровно один раз.
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
  RETURN jsonb_build_object('ok', true, 'product', pay.product);
END;
$$;

REVOKE ALL ON FUNCTION public.billing_consume(uuid), public.billing_release(uuid),
  public.billing_credit(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_consume(uuid), public.billing_release(uuid),
  public.billing_credit(text, boolean) TO service_role;
