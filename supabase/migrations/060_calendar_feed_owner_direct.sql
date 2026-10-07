-- Calendar feed links (059) were refused by the feed: calendar_feed_owner()
-- ran is_staff() as the link's owner by setting the user id auth.uid() reads,
-- which doesn't hold up when the server calls it. This checks the owner
-- directly instead, with the same rules as is_staff() / is_admin()
-- (034, 040, 041, 054): an active member of the staff org who isn't a
-- subcontractor, PM-portal or customer-portal login.
-- Run this in your Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.calendar_feed_owner(p_token text) RETURNS json
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_user_id uuid;
  v_result  json;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN RETURN NULL; END IF;
  SELECT user_id INTO v_user_id FROM calendar_feed_tokens WHERE token = p_token;
  IF v_user_id IS NULL THEN RETURN NULL; END IF;

  IF NOT EXISTS (
       SELECT 1 FROM organization_members
       WHERE user_id = v_user_id
         AND organization_id = public.staff_org_id()
         AND COALESCE(status, 'active') = 'active')
     OR EXISTS (SELECT 1 FROM subcontractor_portal_users WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM pm_portal_users WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM customer_portal_users WHERE user_id = v_user_id)
  THEN
    RETURN NULL;
  END IF;

  UPDATE calendar_feed_tokens SET last_used_at = now() WHERE user_id = v_user_id;

  SELECT json_build_object(
    'user_id',   u.id,
    'email',     u.email,
    'full_name', COALESCE(
                   (SELECT e.full_name FROM employees e WHERE lower(e.email) = lower(u.email) LIMIT 1),
                   u.raw_user_meta_data->>'full_name',
                   u.email),
    -- Same "can see private events" rule as the Calendar page (canUserSeeEvent).
    'is_admin',  EXISTS (
                   SELECT 1 FROM organization_members
                   WHERE user_id = u.id
                     AND organization_id = public.staff_org_id()
                     AND role = 'admin'
                     AND COALESCE(status, 'active') = 'active')
                 OR COALESCE(u.raw_user_meta_data->>'role', '') IN ('admin', 'manager')
  ) INTO v_result
  FROM auth.users u WHERE u.id = v_user_id;
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.calendar_feed_owner(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calendar_feed_owner(text) TO service_role;

NOTIFY pgrst, 'reload schema';

-- Check: every link should show link_works = true.
SELECT u.email,
       public.calendar_feed_owner(t.token) IS NOT NULL AS link_works,
       t.created_at
FROM calendar_feed_tokens t JOIN auth.users u ON u.id = t.user_id;
