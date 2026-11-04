-- Lead follow-ups and appointment reminders.
--
-- A simple rule per brand: "this stage with no activity for N hours/days"
-- or "this long before an appointment." The sender (api/_lib/followups.js)
-- reuses the email/text setup from 057 (Resend, Twilio, quiet hours, STOP,
-- unsubscribe). Run 057 and 062 before this file.
--
-- Everything ships OFF. followup_settings.mode is 'off', and every seeded
-- rule is disabled. Off does nothing. Dry run writes a log line and does
-- not text or email anyone. Live sends only when a rule is also turned on.
--
-- The archived March 2026 lead-import company is rejected by a trigger and
-- never seeded. Turning a rule on does not blast leads that were already
-- past the timer (catch_up defaults to false).
--
-- Not applied to production by the agent. Run it yourself, on a copy first
-- if you want, then here.

DO $$
BEGIN
  IF to_regprocedure('public.is_owner()') IS NULL
     OR to_regprocedure('public.can_access_company(uuid)') IS NULL
     OR to_regprocedure('public.attach_company_scope(text,text)') IS NULL
     OR to_regprocedure('public.attach_brand_guard(text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Apply 062_employee_company_access.sql before 063_followup_rules.sql';
  END IF;
  IF to_regclass('public.messages') IS NULL OR to_regclass('public.message_opt_outs') IS NULL THEN
    RAISE EXCEPTION 'Apply 057_messaging_automations.sql before 063_followup_rules.sql';
  END IF;
END $$;

-- Columns the calendar and to-do screens already save. Production has them;
-- a database built only from this repo's migrations did not.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS linked_client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS linked_project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS assigned_users JSONB;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS linked_client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS linked_project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS linked_calendar_event_id UUID;

-- ─── Settings and rules ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS followup_settings (
  company_id  UUID PRIMARY KEY REFERENCES company_profiles(id) ON DELETE CASCADE,
  -- off: the checker skips this brand. dry_run: log only. live: send.
  mode        TEXT NOT NULL DEFAULT 'off' CHECK (mode IN ('off', 'dry_run', 'live')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS followup_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  kind                TEXT NOT NULL CHECK (kind IN ('stage_idle', 'appointment')),
  enabled             BOOLEAN NOT NULL DEFAULT false,
  -- Set when the rule is turned on. Leads already past the timer are left
  -- alone unless catch_up is on, so the first day doesn't text the backlog.
  enabled_at          TIMESTAMPTZ,
  catch_up            BOOLEAN NOT NULL DEFAULT false,
  lead_stage          TEXT,
  idle_amount         INT,
  idle_unit           TEXT CHECK (idle_unit IS NULL OR idle_unit IN ('hours', 'days')),
  minutes_before      INT,
  send_email          BOOLEAN NOT NULL DEFAULT false,
  send_sms            BOOLEAN NOT NULL DEFAULT false,
  create_todo         BOOLEAN NOT NULL DEFAULT false,
  notify_rep          BOOLEAN NOT NULL DEFAULT false,
  notify_rep_channel  TEXT NOT NULL DEFAULT 'email' CHECK (notify_rep_channel IN ('email', 'sms', 'both')),
  email_subject       TEXT,
  email_body          TEXT,
  sms_body            TEXT,
  todo_title          TEXT,
  todo_notes          TEXT,
  rep_email_subject   TEXT,
  rep_email_body      TEXT,
  rep_sms_body        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'stage_idle' AND lead_stage IS NOT NULL AND idle_amount > 0 AND idle_unit IN ('hours', 'days'))
    OR (kind = 'appointment' AND minutes_before > 0)
  ),
  CHECK (send_email OR send_sms OR create_todo OR notify_rep)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_followup_rules_company_name ON followup_rules(company_id, name);
CREATE INDEX IF NOT EXISTS idx_followup_rules_company ON followup_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_followup_rules_enabled ON followup_rules(company_id) WHERE enabled;

-- One row per attempt. The unique key is what stops a second copy of the
-- same message. Dry runs use their own key, so a practice pass does not
-- block the real send later.
CREATE TABLE IF NOT EXISTS followup_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID REFERENCES company_profiles(id) ON DELETE SET NULL,
  rule_id          UUID REFERENCES followup_rules(id) ON DELETE SET NULL,
  lead_id          UUID REFERENCES leads(id) ON DELETE SET NULL,
  client_id        UUID REFERENCES clients(id) ON DELETE SET NULL,
  event_id         UUID,
  channel          TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'todo', 'rep_email', 'rep_sms')),
  status           TEXT NOT NULL CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped', 'dry_run')),
  reason           TEXT,
  dedupe_key       TEXT NOT NULL,
  to_address       TEXT,
  subject          TEXT,
  body             TEXT,
  message_id       UUID REFERENCES messages(id) ON DELETE SET NULL,
  todo_id          UUID,
  show_on_timeline BOOLEAN NOT NULL DEFAULT true,
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_followup_log_dedupe ON followup_log(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_followup_log_lead ON followup_log(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_log_client ON followup_log(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_log_company ON followup_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_log_open ON followup_log(expires_at) WHERE status IN ('queued', 'sending');

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['followup_settings', 'followup_rules', 'followup_log'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t || '_updated_at', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.followup_rule_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.enabled AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.enabled, false)) THEN
    NEW.enabled_at := COALESCE(NEW.enabled_at, now());
    IF TG_OP = 'UPDATE' AND NOT COALESCE(OLD.enabled, false) THEN
      NEW.enabled_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS followup_rule_touch ON followup_rules;
CREATE TRIGGER followup_rule_touch BEFORE INSERT OR UPDATE OF enabled ON followup_rules
  FOR EACH ROW EXECUTE FUNCTION public.followup_rule_touch();

-- Archived brands, including the March 2026 import, cannot have rules.
CREATE OR REPLACE FUNCTION public.reject_archived_followup_company() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cname TEXT;
  active BOOLEAN;
BEGIN
  SELECT name, is_active INTO cname, active FROM company_profiles WHERE id = NEW.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown company' USING ERRCODE = '23503';
  END IF;
  IF COALESCE(active, true) = false
     OR cname ~* '^\s*archived\b'
     OR NEW.company_id = 'a7c41e00-0000-4000-8000-000000000325' THEN
    RAISE EXCEPTION 'Follow-ups are not used for archived companies' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.reject_archived_followup_company() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_archived_followup_company() TO authenticated;

DROP TRIGGER IF EXISTS reject_archived_followup ON followup_rules;
CREATE TRIGGER reject_archived_followup BEFORE INSERT OR UPDATE OF company_id ON followup_rules
  FOR EACH ROW EXECUTE FUNCTION public.reject_archived_followup_company();
DROP TRIGGER IF EXISTS reject_archived_followup_settings ON followup_settings;
CREATE TRIGGER reject_archived_followup_settings BEFORE INSERT OR UPDATE OF company_id ON followup_settings
  FOR EACH ROW EXECUTE FUNCTION public.reject_archived_followup_company();

-- ─── Claim one send so two checkers can't deliver it twice ────────────────

CREATE OR REPLACE FUNCTION public.claim_followup_dispatch(
  p_dedupe_key TEXT,
  p_company_id UUID,
  p_rule_id UUID,
  p_lead_id UUID,
  p_client_id UUID,
  p_event_id UUID,
  p_channel TEXT,
  p_to TEXT,
  p_subject TEXT,
  p_body TEXT,
  p_status TEXT,
  p_reason TEXT,
  p_show BOOLEAN,
  p_expires_at TIMESTAMPTZ
) RETURNS SETOF followup_log
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  row followup_log;
BEGIN
  INSERT INTO followup_log (
    dedupe_key, company_id, rule_id, lead_id, client_id, event_id, channel,
    to_address, subject, body, status, reason, show_on_timeline, expires_at
  ) VALUES (
    p_dedupe_key, p_company_id, p_rule_id, p_lead_id, p_client_id, p_event_id, p_channel,
    p_to, p_subject, p_body, p_status, p_reason, COALESCE(p_show, true), p_expires_at
  )
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING * INTO row;

  IF row.id IS NOT NULL THEN
    RETURN NEXT row;
    RETURN;
  END IF;

  -- A send that died mid-flight can be picked up again. A finished row
  -- (sent, skipped, failed, dry run) is never claimed twice.
  UPDATE followup_log
     SET status = CASE WHEN message_id IS NOT NULL THEN 'sent' ELSE 'queued' END,
         updated_at = now()
   WHERE dedupe_key = p_dedupe_key
     AND status IN ('queued', 'sending')
     AND updated_at < now() - interval '2 minutes'
     AND (expires_at IS NULL OR expires_at > now())
  RETURNING * INTO row;

  IF row.id IS NOT NULL THEN
    RETURN NEXT row;
  END IF;
  RETURN;
END $$;

REVOKE ALL ON FUNCTION public.claim_followup_dispatch(TEXT, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;

-- Texts still waiting when the appointment window closes are marked skipped
-- instead of going out the next morning.
CREATE OR REPLACE FUNCTION public.expire_followup_dispatches() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT;
BEGIN
  UPDATE followup_log
     SET status = 'skipped',
         reason = 'Quiet hours ran past the appointment',
         show_on_timeline = true
   WHERE status IN ('queued', 'sending')
     AND expires_at IS NOT NULL
     AND expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.expire_followup_dispatches() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON followup_rules, followup_settings, followup_log TO service_role;
    GRANT EXECUTE ON FUNCTION public.claim_followup_dispatch(TEXT, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ) TO service_role;
    GRANT EXECUTE ON FUNCTION public.expire_followup_dispatches() TO service_role;
  END IF;
END $$;

-- ─── Who can see and edit rules ────────────────────────────────────────────
-- Same brand rule as the rest of the app (062): owner sees every company,
-- everyone else only the companies they're assigned to. The log is written
-- by the checker (service role) and only read in the app.

REVOKE ALL ON followup_rules, followup_settings, followup_log FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON followup_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON followup_settings TO authenticated;
GRANT SELECT ON followup_log TO authenticated;

ALTER TABLE followup_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_only ON followup_rules;
CREATE POLICY staff_only ON followup_rules FOR ALL TO authenticated
  USING ((SELECT public.is_staff())) WITH CHECK ((SELECT public.is_staff()));
DROP POLICY IF EXISTS staff_only ON followup_settings;
CREATE POLICY staff_only ON followup_settings FOR ALL TO authenticated
  USING ((SELECT public.is_staff())) WITH CHECK ((SELECT public.is_staff()));
DROP POLICY IF EXISTS followup_log_read ON followup_log;
CREATE POLICY followup_log_read ON followup_log FOR SELECT TO authenticated
  USING ((SELECT public.is_staff()));

SELECT public.attach_company_scope('followup_rules', $policy$
  NOT (SELECT public.is_staff())
  OR (SELECT public.is_owner())
  OR (SELECT public.can_access_company(company_id))
$policy$);
SELECT public.attach_company_scope('followup_settings', $policy$
  NOT (SELECT public.is_staff())
  OR (SELECT public.is_owner())
  OR (SELECT public.can_access_company(company_id))
$policy$);
SELECT public.attach_company_scope('followup_log', $policy$
  NOT (SELECT public.is_staff())
  OR (SELECT public.is_owner())
  OR (SELECT public.can_access_company(company_id))
$policy$);

SELECT public.attach_brand_guard('followup_rules', false);
SELECT public.attach_brand_guard('followup_settings', false);

DROP TRIGGER IF EXISTS viewer_read_only ON followup_rules;
CREATE TRIGGER viewer_read_only BEFORE INSERT OR UPDATE OR DELETE ON followup_rules
  FOR EACH STATEMENT EXECUTE FUNCTION public.block_viewer_writes();
DROP TRIGGER IF EXISTS viewer_read_only ON followup_settings;
CREATE TRIGGER viewer_read_only BEFORE INSERT OR UPDATE OR DELETE ON followup_settings
  FOR EACH STATEMENT EXECUTE FUNCTION public.block_viewer_writes();

-- ─── Suggested rules, all off ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.seed_followup_rules(p_company UUID) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cname TEXT;
  active BOOLEAN;
BEGIN
  SELECT name, is_active INTO cname, active FROM company_profiles WHERE id = p_company;
  IF NOT FOUND OR COALESCE(active, true) = false OR cname ~* '^\s*archived\b'
     OR p_company = 'a7c41e00-0000-4000-8000-000000000325' THEN
    RETURN;
  END IF;

  INSERT INTO followup_settings (company_id, mode)
  VALUES (p_company, 'off')
  ON CONFLICT (company_id) DO NOTHING;

  INSERT INTO followup_rules (
    company_id, name, kind, enabled, catch_up, lead_stage, idle_amount, idle_unit,
    minutes_before, send_email, send_sms, create_todo, notify_rep, notify_rep_channel,
    email_subject, email_body, sms_body, todo_title, todo_notes,
    rep_email_subject, rep_email_body, rep_sms_body
  ) VALUES
  (
    p_company, 'New lead, no contact', 'stage_idle', false, false, 'New Lead', 4, 'hours',
    NULL, true, true, true, false, 'email',
    'Following up on your {{company_name}} project',
    $msg$Hi {{first_name|there}},

This is {{rep_name|our team}} at {{company_name}}. We got your request and haven't been able to connect yet.

Reply to this email or call us at {{company_phone|the number on our site}} and we'll get you on the calendar.

{{company_name}}$msg$,
    $msg$Hi {{first_name|there}}, this is {{rep_name|{{company_name}}}}. We got your project request and wanted to follow up. Call {{company_phone|us}} or reply here. Reply STOP to opt out.$msg$,
    'Call {{full_name}} — new lead, no contact',
    'No contact since they came in. Stage: {{stage}}.',
    NULL, NULL, NULL
  ),
  (
    p_company, 'Contact attempted, no activity', 'stage_idle', false, false, 'Contact Attempted', 2, 'days',
    NULL, false, false, true, false, 'email',
    NULL, NULL, NULL,
    'Try {{full_name}} again',
    'Still in {{stage}} with no new activity.',
    NULL, NULL, NULL
  ),
  (
    p_company, 'Contacted, gone quiet', 'stage_idle', false, false, 'Contacted', 5, 'days',
    NULL, false, false, true, false, 'email',
    NULL, NULL, NULL,
    'Follow up with {{full_name}}',
    'Still in {{stage}} with no new activity.',
    NULL, NULL, NULL
  ),
  (
    p_company, 'Estimate sent, no activity', 'stage_idle', false, false, 'Quote Delivered/Price Locked', 3, 'days',
    NULL, true, false, true, false, 'email',
    'Your {{company_name}} estimate',
    $msg$Hi {{first_name|there}},

Checking in on the estimate we sent for your {{project_type|project}}. If you have questions or want to change the scope, reply here or call {{company_phone|us}}.

{{rep_name|{{company_name}}}}$msg$,
    NULL,
    'Follow up on {{full_name}}''s estimate',
    'Estimate has been out since they entered {{stage}}, with no new activity.',
    NULL, NULL, NULL
  ),
  (
    p_company, 'In financing, no activity', 'stage_idle', false, false, 'In Financing', 7, 'days',
    NULL, true, false, true, false, 'email',
    'Checking in on financing — {{company_name}}',
    $msg$Hi {{first_name|there}},

Checking in while financing is in progress for your {{project_type|project}}. Reply here or call {{company_phone|us}} if you need anything from us.

{{rep_name|{{company_name}}}}$msg$,
    NULL,
    'Check financing for {{full_name}}',
    'In financing with no new activity.',
    NULL, NULL, NULL
  ),
  (
    p_company, 'Appointment reminder, 24 hours', 'appointment', false, false, NULL, NULL, NULL,
    1440, true, true, false, true, 'email',
    'Reminder: {{appointment_title|your appointment}} {{appointment_date}}',
    $msg$Hi {{first_name|there}},

This is a reminder from {{company_name}} that {{appointment_title|your appointment}} is {{appointment_date}} at {{appointment_time}}.

Need to reschedule? Reply to this email or call {{company_phone|us}}.

{{rep_name|See you then}}$msg$,
    $msg$Reminder from {{company_name}}: {{appointment_title|your appointment}} is {{appointment_date}} at {{appointment_time}}. Reply to reschedule or STOP to opt out.$msg$,
    NULL, NULL,
    'Upcoming: {{full_name}} {{appointment_date}} {{appointment_time}}',
    $msg$You have {{appointment_title|an appointment}} with {{full_name}} on {{appointment_date}} at {{appointment_time}} ({{company_name}}).$msg$,
    NULL
  ),
  (
    p_company, 'Appointment reminder, 2 hours', 'appointment', false, false, NULL, NULL, NULL,
    120, false, true, false, true, 'sms',
    NULL, NULL,
    $msg${{company_name}} reminder: {{appointment_title|your appointment}} is today at {{appointment_time}}. See you soon. Reply STOP to opt out.$msg$,
    NULL, NULL,
    NULL, NULL,
    $msg$In 2 hours: {{full_name}} — {{appointment_title|appointment}} at {{appointment_time}}.$msg$
  )
  ON CONFLICT (company_id, name) DO NOTHING;
END $$;

REVOKE ALL ON FUNCTION public.seed_followup_rules(UUID) FROM PUBLIC, anon, authenticated;

SELECT public.seed_followup_rules(id)
FROM company_profiles
WHERE COALESCE(is_active, true) = true
  AND name !~* '^\s*archived\b'
  AND id <> 'a7c41e00-0000-4000-8000-000000000325';

CREATE OR REPLACE FUNCTION public.seed_followup_rules_on_company() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.seed_followup_rules(NEW.id);
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.seed_followup_rules_on_company() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_followup_rules_on_company() TO authenticated;

DROP TRIGGER IF EXISTS seed_followup_rules ON company_profiles;
CREATE TRIGGER seed_followup_rules AFTER INSERT ON company_profiles
  FOR EACH ROW EXECUTE FUNCTION public.seed_followup_rules_on_company();

NOTIFY pgrst, 'reload schema';

-- ─── Schedule ──────────────────────────────────────────────────────────────
-- Vercel's free plan only runs its own cron once a day (vercel.json). That
-- is a backstop, not enough for a 2-hour appointment reminder.
--
-- pg_cron and pg_net are the on-time checker. They are extensions, not part
-- of this file, so nothing here places the schedule (a wrong secret would
-- start calling the site). After CRON_SECRET is set on Vercel, run:
--
-- SELECT cron.schedule('followups-tick', '*/15 * * * *', $cron$
--   SELECT net.http_get(
--     url := 'https://clardy.io/api/cron?action=followups-tick',
--     headers := '{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb,
--     timeout_milliseconds := 60000);
-- $cron$);
--
-- The checker is safe to run as often as you like. With mode still 'off'
-- it does nothing. Dry run writes log lines and does not contact anyone.
