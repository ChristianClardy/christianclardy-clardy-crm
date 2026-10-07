-- Visual workflows for drips (Automations → Drips → workflow builder).
--
-- A drip's steps become a workflow: a tree of nodes stored as JSON on
-- message_sequences.workflow —
--   email / sms           send a message
--   wait                  pause for minutes / hours / days
--   condition             if/else (opened, clicked, replied, lead stage, a
--                         field) with a "yes" and a "no" branch that join
--                         back up afterwards
--   action                change lead stage, create a to-do, notify someone,
--                         add to another drip
--   end                   finish the drip here
-- The sender walks it (api/_lib/messaging.js). Drips saved before this
-- (message_sequence_steps) keep working: the sender reads them as a simple
-- workflow until they're opened and saved in the builder.
--
-- Run after 057, in your Supabase SQL editor.

ALTER TABLE message_sequences   ADD COLUMN IF NOT EXISTS workflow JSONB;
ALTER TABLE message_enrollments ADD COLUMN IF NOT EXISTS current_node TEXT;     -- node to run next (or the wait it's sitting in)
ALTER TABLE message_enrollments ADD COLUMN IF NOT EXISTS in_wait BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE messages            ADD COLUMN IF NOT EXISTS node_id TEXT;
CREATE INDEX IF NOT EXISTS idx_message_enrollments_node ON message_enrollments(sequence_id, current_node) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_messages_node ON messages(sequence_id, node_id);

-- Same as 057, plus: a drip with a workflow starts right away (its own wait
-- nodes do the waiting) and counts as having steps.
CREATE OR REPLACE FUNCTION public.messaging_enroll(
  p_sequence_id UUID, p_lead_id UUID, p_client_id UUID, p_project_id UUID,
  p_stage TEXT, p_by TEXT, p_force BOOLEAN DEFAULT false
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  first_delay INT;
  new_id UUID;
  seq_company UUID;
  flow JSONB;
BEGIN
  SELECT company_id, workflow INTO seq_company, flow FROM message_sequences WHERE id = p_sequence_id;
  IF jsonb_typeof(flow -> 'nodes') = 'array' AND jsonb_array_length(flow -> 'nodes') > 0 THEN
    first_delay := 0;
  ELSE
    SELECT delay_minutes INTO first_delay FROM message_sequence_steps
      WHERE sequence_id = p_sequence_id ORDER BY step_order, created_at LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;   -- a drip with no steps does nothing
  END IF;

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

NOTIFY pgrst, 'reload schema';
