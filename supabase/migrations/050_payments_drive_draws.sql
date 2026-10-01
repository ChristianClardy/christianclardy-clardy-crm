-- Payments drive the draw schedule.
--
-- A payment is the record of truth; each project's draws follow it:
--   - a payment aimed at a draw (payments.draw_id) pays that draw first
--   - everything else pays the oldest unpaid draws in order
--   - a fully covered draw is 'paid' with the date of the payment that
--     finished it; partly covered draws keep amount_paid < their amount
--   - extra beyond the whole schedule stays as a credit (not applied)
-- What a draw needs collected = amount minus any retainage still held.
-- reconcile_project_draws() recomputes a project from scratch, so editing or
-- deleting a payment (or a draw) can't leave anything out of step. The app
-- calls it after any payment or draw change; the QuickBooks sync calls it
-- after bringing in payments.
--
-- Also adds the 'submitted' and 'approved' draw statuses the Billing tab
-- already offers (they were rejected by the old pending/paid-only type).
-- Run this in your Supabase SQL editor.

ALTER TYPE draw_status_enum ADD VALUE IF NOT EXISTS 'submitted';
ALTER TYPE draw_status_enum ADD VALUE IF NOT EXISTS 'approved';

ALTER TABLE draws    ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS draw_id UUID REFERENCES draws(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payments_draw_id ON payments(draw_id);

CREATE OR REPLACE FUNCTION public.reconcile_project_draws(p_project_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pay   record;
  d     record;
  left_ numeric;
  take  numeric;
BEGIN
  -- Staff from the app; the server (service role, no auth.uid()) for syncs.
  IF auth.uid() IS NOT NULL AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE draws SET amount_paid = 0 WHERE project_id = p_project_id;
  -- Remember which draws were paid only so we can clear their paid date.
  CREATE TEMP TABLE IF NOT EXISTS _draw_paid_on (draw_id uuid PRIMARY KEY, paid_on date) ON COMMIT DROP;
  DELETE FROM _draw_paid_on;

  FOR pay IN
    SELECT p.id, p.draw_id, COALESCE(p.amount_received, 0) AS amount, COALESCE(p.payment_date, p.created_at::date) AS paid_on
    FROM payments p
    WHERE p.linked_job_id = p_project_id AND COALESCE(p.amount_received, 0) > 0
    ORDER BY (p.draw_id IS NULL), COALESCE(p.payment_date, p.created_at::date), p.created_at
  LOOP
    left_ := pay.amount;
    FOR d IN
      SELECT dr.id,
             COALESCE(dr.amount, 0) - CASE WHEN COALESCE(dr.retainage_released, false) THEN 0 ELSE COALESCE(dr.retainage_held, 0) END AS due,
             dr.amount_paid
      FROM draws dr
      WHERE dr.project_id = p_project_id
      ORDER BY (dr.id IS DISTINCT FROM pay.draw_id), dr.draw_number NULLS LAST, dr.due_date NULLS LAST, dr.created_at
    LOOP
      EXIT WHEN left_ <= 0;
      CONTINUE WHEN d.due <= 0 OR d.amount_paid >= d.due;
      take := LEAST(left_, d.due - d.amount_paid);
      UPDATE draws SET amount_paid = amount_paid + take WHERE id = d.id;
      left_ := left_ - take;
      IF d.amount_paid + take >= d.due - 0.005 THEN
        INSERT INTO _draw_paid_on VALUES (d.id, pay.paid_on) ON CONFLICT (draw_id) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;

  -- Paid when covered; a draw that was 'paid' but no longer is goes back to
  -- pending. Submitted / approved are left alone.
  UPDATE draws dr SET
    status = CASE
      WHEN po.draw_id IS NOT NULL THEN 'paid'::draw_status_enum
      WHEN dr.status = 'paid' THEN 'pending'::draw_status_enum
      ELSE dr.status END,
    paid_date = po.paid_on
  FROM draws d2
  LEFT JOIN _draw_paid_on po ON po.draw_id = d2.id
  WHERE dr.id = d2.id AND dr.project_id = p_project_id;
END $$;

REVOKE ALL ON FUNCTION public.reconcile_project_draws(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_project_draws(uuid) TO authenticated, service_role;

-- Bring every project's draws in line with its payments now.
SELECT public.reconcile_project_draws(id) FROM projects;

NOTIFY pgrst, 'reload schema';
