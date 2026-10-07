-- Private calendar feed links (Settings → Calendar Feed).
--
-- The Apple / Google Calendar feed (api/cron.js ?action=calendar) used to be
-- one open URL that returned every event to anyone. Now each staff login gets
-- its own secret link, ?action=calendar&token=…, and the feed only shows that
-- person the events the Calendar page would show them. A link stops working
-- the moment it's reset or the person stops being active staff.
--
--   calendar_feed_tokens          — one secret per user; no browser access
--   calendar_feed_token(reset)    — signed-in staff: get (or reset) my link
--   calendar_feed_owner(token)    — server only: who a link belongs to, or
--                                   nothing if the link is unknown or the
--                                   owner is no longer staff
-- Run this in your Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.calendar_feed_tokens (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token        text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

-- RLS on with no policies: the browser can't read or write this table
-- directly, only through the two functions below.
ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;

-- 64 hex characters from two random v4 uuids (244 random bits).
CREATE OR REPLACE FUNCTION public.calendar_feed_token(p_reset boolean DEFAULT false) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token text;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff logins have a calendar feed.' USING ERRCODE = '42501';
  END IF;
  IF NOT p_reset THEN
    SELECT token INTO v_token FROM calendar_feed_tokens WHERE user_id = auth.uid();
    IF v_token IS NOT NULL THEN RETURN v_token; END IF;
  END IF;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO calendar_feed_tokens (user_id, token) VALUES (auth.uid(), v_token)
  ON CONFLICT (user_id) DO UPDATE SET token = EXCLUDED.token, created_at = now(), last_used_at = NULL;
  RETURN v_token;
END $$;

REVOKE ALL ON FUNCTION public.calendar_feed_token(boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.calendar_feed_token(boolean) TO authenticated;

-- Runs is_staff() / is_admin() as the link's owner by setting the user id
-- auth.uid() reads, for this transaction only, so the feed follows exactly the
-- same staff and admin rules as the app.
CREATE OR REPLACE FUNCTION public.calendar_feed_owner(p_token text) RETURNS json
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_user_id uuid;
  v_result  json;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN RETURN NULL; END IF;
  SELECT user_id INTO v_user_id FROM calendar_feed_tokens WHERE token = p_token;
  IF v_user_id IS NULL THEN RETURN NULL; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  IF NOT public.is_staff() THEN RETURN NULL; END IF;

  UPDATE calendar_feed_tokens SET last_used_at = now() WHERE user_id = v_user_id;

  SELECT json_build_object(
    'user_id',   u.id,
    'email',     u.email,
    'full_name', COALESCE(
                   (SELECT e.full_name FROM employees e WHERE lower(e.email) = lower(u.email) LIMIT 1),
                   u.raw_user_meta_data->>'full_name',
                   u.email),
    -- Same "can see private events" rule as the Calendar page (canUserSeeEvent).
    'is_admin',  public.is_admin()
                 OR COALESCE(u.raw_user_meta_data->>'role', '') IN ('admin', 'manager')
  ) INTO v_result
  FROM auth.users u WHERE u.id = v_user_id;
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.calendar_feed_owner(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calendar_feed_owner(text) TO service_role;

-- View-only logins may still get a feed link (it only reads), so the viewer
-- write block (055) lets this one table through. Same function as 055 plus
-- that exception; re-running 055 later would drop it, so re-run this after.
CREATE OR REPLACE FUNCTION public.block_viewer_writes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME = 'notifications' AND TG_OP = 'UPDATE' THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME = 'calendar_feed_tokens' THEN RETURN NULL; END IF;
  IF public.is_viewer() THEN
    RAISE EXCEPTION 'View-only access: your login can see everything but can''t make changes.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS viewer_read_only ON public.calendar_feed_tokens;
CREATE TRIGGER viewer_read_only BEFORE INSERT OR UPDATE OR DELETE ON public.calendar_feed_tokens
  FOR EACH STATEMENT EXECUTE FUNCTION public.block_viewer_writes();

NOTIFY pgrst, 'reload schema';
