-- Messaging & Automations: email (Resend) and text (Twilio) drips, one-off
-- sends, broadcasts, and a log of every message in and out.
--
--   message_settings     — per company: sender name/email, reply-to, Twilio
--                          number, time zone and texting hours
--   message_templates    — reusable email / text bodies
--   message_sequences    — a drip: what starts it, its stop rules, on/off
--   message_sequence_steps — the drip's emails/texts, each after a delay
--   message_enrollments  — one lead / client / project going through a drip
--   messages             — every email and text, sent and received
--   message_opt_outs     — addresses that unsubscribed or texted STOP
--
-- Enrolling happens HERE, in triggers, so it works for every way a lead is
-- created or moved (app, public lead form, MCP, imports):
--   * a new lead            → drips set to "New lead"
--   * a lead changes stage  → drips set to that stage; drips with "stop on
--                             stage change" end for that lead
--   * a project status      → drips set to that status (new or changed);
--                             same stop rule
-- Sending is done by the server (api/_lib/messaging.js), which picks up due
-- enrollments with claim_due_enrollments(). Sends every few minutes are
-- driven by pg_cron (see the end of this file).
--
-- Run this in your Supabase SQL editor.

-- ─── Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS message_settings (
  company_id      UUID PRIMARY KEY REFERENCES company_profiles(id) ON DELETE CASCADE,
  from_name       TEXT,
  from_email      TEXT,               -- must be on a domain verified in Resend
  reply_to        TEXT,               -- where email replies land (your inbox)
  sms_from        TEXT,               -- Twilio number (+15551234567) or Messaging Service SID (MG…)
  timezone        TEXT NOT NULL DEFAULT 'America/Chicago',
  quiet_start     INT  NOT NULL DEFAULT 20,  -- no texts from 8pm…
  quiet_end       INT  NOT NULL DEFAULT 8,   -- …until 8am, contact's time zone = company's
  email_footer    TEXT,               -- address line etc. (CAN-SPAM needs a postal address)
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS message_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES company_profiles(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  channel     TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms')),
  subject     TEXT,
  body        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS message_sequences (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID REFERENCES company_profiles(id) ON DELETE SET NULL,
  name                  TEXT NOT NULL,
  description           TEXT,
  -- manual | lead_created | lead_stage | project_status | broadcast
  trigger_type          TEXT NOT NULL DEFAULT 'manual'
                        CHECK (trigger_type IN ('manual', 'lead_created', 'lead_stage', 'project_status', 'broadcast')),
  trigger_value         TEXT,         -- the lead stage / project status
  active                BOOLEAN NOT NULL DEFAULT false,
  stop_on_reply         BOOLEAN NOT NULL DEFAULT true,
  stop_on_stage_change  BOOLEAN NOT NULL DEFAULT true,
  created_by            TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_message_sequences_trigger ON message_sequences(trigger_type, trigger_value) WHERE active;

CREATE TABLE IF NOT EXISTS message_sequence_steps (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id    UUID NOT NULL REFERENCES message_sequences(id) ON DELETE CASCADE,
  step_order     INT  NOT NULL DEFAULT 0,
  delay_minutes  INT  NOT NULL DEFAULT 0,   -- wait after enrolling (step 1) or after the previous step
  channel        TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms')),
  subject        TEXT,
  body           TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_message_sequence_steps_seq ON message_sequence_steps(sequence_id, step_order);

CREATE TABLE IF NOT EXISTS message_enrollments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID REFERENCES company_profiles(id) ON DELETE SET NULL,
  sequence_id    UUID NOT NULL REFERENCES message_sequences(id) ON DELETE CASCADE,
  lead_id        UUID REFERENCES leads(id) ON DELETE CASCADE,
  client_id      UUID REFERENCES clients(id) ON DELETE CASCADE,
  project_id     UUID REFERENCES projects(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'stopped')),
  next_step      INT  NOT NULL DEFAULT 0,          -- index into the steps, by step_order
  next_run_at    TIMESTAMPTZ,
  enrolled_stage TEXT,                             -- lead stage / project status when it started
  enrolled_by    TEXT,                             -- staff email, or 'automation'
  stop_reason    TEXT,
  last_error     TEXT,
  enrolled_at    TIMESTAMPTZ DEFAULT now(),
  finished_at    TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ DEFAULT now(),
  CHECK (lead_id IS NOT NULL OR client_id IS NOT NULL OR project_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_message_enrollments_due ON message_enrollments(next_run_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_message_enrollments_lead ON message_enrollments(lead_id);
CREATE INDEX IF NOT EXISTS idx_message_enrollments_client ON message_enrollments(client_id);
CREATE INDEX IF NOT EXISTS idx_message_enrollments_project ON message_enrollments(project_id);
CREATE INDEX IF NOT EXISTS idx_message_enrollments_seq ON message_enrollments(sequence_id, status);
-- Never two running copies of the same drip for the same record.
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_enrollments_active ON message_enrollments
  (sequence_id, COALESCE(lead_id, '00000000-0000-0000-0000-000000000000'),
   COALESCE(client_id, '00000000-0000-0000-0000-000000000000'),
   COALESCE(project_id, '00000000-0000-0000-0000-000000000000'))
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID REFERENCES company_profiles(id) ON DELETE SET NULL,
  enrollment_id  UUID REFERENCES message_enrollments(id) ON DELETE SET NULL,
  sequence_id    UUID REFERENCES message_sequences(id) ON DELETE SET NULL,
  step_id        UUID REFERENCES message_sequence_steps(id) ON DELETE SET NULL,
  lead_id        UUID REFERENCES leads(id) ON DELETE SET NULL,
  client_id      UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id     UUID REFERENCES projects(id) ON DELETE SET NULL,
  channel        TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  direction      TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound', 'inbound')),
  to_address     TEXT,
  from_address   TEXT,
  subject        TEXT,
  body           TEXT,
  -- sent | delivered | opened | clicked | bounced | complained | failed | skipped | received
  status         TEXT NOT NULL DEFAULT 'sent',
  provider_id    TEXT,               -- Resend email id / Twilio message SID
  error          TEXT,
  sent_by        TEXT,               -- staff email, or 'automation'
  read_at        TIMESTAMPTZ,        -- inbound: when staff saw it
  opened_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_lead ON messages(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_client ON messages(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_provider ON messages(provider_id);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(direction) WHERE direction = 'inbound' AND read_at IS NULL;

CREATE TABLE IF NOT EXISTS message_opt_outs (
  channel     TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  address     TEXT NOT NULL,         -- lowercased email, or phone as +1XXXXXXXXXX
  reason      TEXT,                  -- unsubscribe | stop | bounced | complained | manual
  created_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (channel, address)
);

-- updated_at
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['message_settings', 'message_templates', 'message_sequences',
                           'message_sequence_steps', 'message_enrollments', 'messages'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t || '_updated_at', t);
  END LOOP;
END $$;

-- ─── Access: staff only; viewers read-only; company tagging ───────────────

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['message_settings', 'message_templates', 'message_sequences',
                           'message_sequence_steps', 'message_enrollments', 'messages', 'message_opt_outs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "staff_only" ON %I', t);
    EXECUTE format('CREATE POLICY "staff_only" ON %I FOR ALL TO authenticated USING ((SELECT public.is_staff())) WITH CHECK ((SELECT public.is_staff()))', t);
    EXECUTE format('DROP TRIGGER IF EXISTS viewer_read_only ON %I', t);
    EXECUTE format('CREATE TRIGGER viewer_read_only BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION public.block_viewer_writes()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['message_templates', 'message_sequences', 'message_enrollments', 'messages'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS inherit_company_id ON %I', t);
    EXECUTE format('CREATE TRIGGER inherit_company_id BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION public.inherit_company_id()', t);
  END LOOP;
END $$;

-- ─── Enrolling ─────────────────────────────────────────────────────────────

-- Enrolls one record in one drip. Automatic enrolling skips a record that has
-- ever been through this drip (re-entering a stage doesn't resend it);
-- p_force (manual / broadcast) only skips one that's in it right now.
-- Internal: used by the triggers below, which can fire for any signed-in user
-- (a PM portal login changing a project status). Not callable from the app.
CREATE OR REPLACE FUNCTION public.messaging_enroll(
  p_sequence_id UUID, p_lead_id UUID, p_client_id UUID, p_project_id UUID,
  p_stage TEXT, p_by TEXT, p_force BOOLEAN DEFAULT false
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  first_delay INT;
  new_id UUID;
  seq_company UUID;
BEGIN
  SELECT company_id INTO seq_company FROM message_sequences WHERE id = p_sequence_id;
  SELECT delay_minutes INTO first_delay FROM message_sequence_steps
    WHERE sequence_id = p_sequence_id ORDER BY step_order, created_at LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;   -- a drip with no steps does nothing

  IF EXISTS (
    SELECT 1 FROM message_enrollments e
    WHERE e.sequence_id = p_sequence_id
      AND e.lead_id IS NOT DISTINCT FROM p_lead_id
      AND e.client_id IS NOT DISTINCT FROM p_client_id
      AND e.project_id IS NOT DISTINCT FROM p_project_id
      AND (e.status = 'active' OR NOT p_force)
  ) THEN RETURN NULL; END IF;

  INSERT INTO message_enrollments (company_id, sequence_id, lead_id, client_id, project_id,
                                   next_step, next_run_at, enrolled_stage, enrolled_by)
  VALUES (seq_company, p_sequence_id, p_lead_id, p_client_id, p_project_id,
          0, now() + make_interval(mins => COALESCE(first_delay, 0)), p_stage, COALESCE(p_by, 'automation'))
  ON CONFLICT DO NOTHING
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.messaging_enroll(UUID, UUID, UUID, UUID, TEXT, TEXT, BOOLEAN) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_enroll(UUID, UUID, UUID, UUID, TEXT, TEXT, BOOLEAN) TO service_role;

-- "Add to drip" from a lead / client page: staff only (sub, PM and customer
-- portal logins are signed in too).
CREATE OR REPLACE FUNCTION public.enroll_in_sequence(
  p_sequence_id UUID, p_lead_id UUID, p_client_id UUID, p_project_id UUID,
  p_stage TEXT, p_by TEXT, p_force BOOLEAN DEFAULT false
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can add people to a drip.' USING ERRCODE = '42501';
  END IF;
  RETURN public.messaging_enroll(p_sequence_id, p_lead_id, p_client_id, p_project_id, p_stage, p_by, p_force);
END $$;
REVOKE ALL ON FUNCTION public.enroll_in_sequence(UUID, UUID, UUID, UUID, TEXT, TEXT, BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.enroll_in_sequence(UUID, UUID, UUID, UUID, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

-- A drip belongs to one company, or to all when company_id is empty.
CREATE OR REPLACE FUNCTION public.messaging_lead_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s RECORD;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    UPDATE message_enrollments e
       SET status = 'stopped', stop_reason = 'Stage changed to ' || NEW.status::text, finished_at = now()
      FROM message_sequences q
     WHERE e.sequence_id = q.id AND e.lead_id = NEW.id AND e.status = 'active'
       AND q.stop_on_stage_change AND q.trigger_type <> 'broadcast'
       AND e.enrolled_stage IS DISTINCT FROM NEW.status::text;
  END IF;

  FOR s IN
    SELECT id FROM message_sequences
     WHERE active
       AND (company_id IS NULL OR company_id = NEW.company_id)
       AND ((TG_OP = 'INSERT' AND trigger_type = 'lead_created')
         OR (trigger_type = 'lead_stage' AND trigger_value = NEW.status::text))
  LOOP
    PERFORM public.messaging_enroll(s.id, NEW.id, NEW.linked_contact_id, NULL, NEW.status::text, 'automation', false);
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS messaging_lead ON leads;
CREATE TRIGGER messaging_lead AFTER INSERT OR UPDATE OF status ON leads
  FOR EACH ROW EXECUTE FUNCTION public.messaging_lead_trigger();

CREATE OR REPLACE FUNCTION public.messaging_project_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s RECORD;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    UPDATE message_enrollments e
       SET status = 'stopped', stop_reason = 'Project status changed to ' || NEW.status::text, finished_at = now()
      FROM message_sequences q
     WHERE e.sequence_id = q.id AND e.project_id = NEW.id AND e.status = 'active'
       AND q.stop_on_stage_change AND q.trigger_type = 'project_status'
       AND e.enrolled_stage IS DISTINCT FROM NEW.status::text;
  END IF;

  FOR s IN
    SELECT id FROM message_sequences
     WHERE active AND trigger_type = 'project_status' AND trigger_value = NEW.status::text
       AND (company_id IS NULL OR company_id = NEW.company_id)
  LOOP
    PERFORM public.messaging_enroll(s.id, NULL, NEW.client_id, NEW.id, NEW.status::text, 'automation', false);
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS messaging_project ON projects;
CREATE TRIGGER messaging_project AFTER INSERT OR UPDATE OF status ON projects
  FOR EACH ROW EXECUTE FUNCTION public.messaging_project_trigger();

-- ─── Sending queue ─────────────────────────────────────────────────────────

-- Hands the sender up to p_limit due enrollments and pushes their next_run_at
-- 10 minutes out, so two overlapping runs can never send the same step twice.
-- The sender sets the real next_run_at after sending.
CREATE OR REPLACE FUNCTION public.claim_due_enrollments(p_limit INT DEFAULT 50)
RETURNS SETOF message_enrollments
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE message_enrollments e SET next_run_at = now() + interval '10 minutes'
   WHERE e.id IN (
     SELECT x.id FROM message_enrollments x
      JOIN message_sequences q ON q.id = x.sequence_id AND q.active
      WHERE x.status = 'active' AND x.next_run_at <= now()
      ORDER BY x.next_run_at
      LIMIT p_limit
      FOR UPDATE OF x SKIP LOCKED)
  RETURNING e.*;
$$;
REVOKE ALL ON FUNCTION public.claim_due_enrollments(INT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_enrollments(INT) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ─── Every-5-minutes sender (run AFTER setting CRON_SECRET in Vercel) ──────
-- Vercel's free plan only runs its own crons once a day, so Supabase calls
-- the sender instead. Enable the pg_cron and pg_net extensions (Database →
-- Extensions) first, replace YOUR_CRON_SECRET with the CRON_SECRET value in
-- Vercel, then run:
--
-- SELECT cron.schedule('messaging-tick', '*/5 * * * *', $cron$
--   SELECT net.http_get(
--     url := 'https://clardy.io/api/cron?action=messaging-tick',
--     headers := '{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb,
--     timeout_milliseconds := 60000);
-- $cron$);
