-- Keeps projects.collected_to_date and projects.remaining_balance current.
-- They were never filled in and always read $0, which made reports and the
-- Clardy.io connector say nothing had been collected. Now:
--
--   collected_to_date = every payment recorded on the project
--   remaining_balance = contract value + approved change orders − collected
--                       (never below $0)
--
-- Recalculated by the database whenever a project, one of its payments or
-- one of its change orders changes, however it changed (app, Payments page,
-- QuickBooks sync). Runs as the owner so a limited login can't zero them
-- out by not being able to see the payments.
-- Run this in your Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.project_money_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_collected numeric;
  v_changes   numeric;
BEGIN
  SELECT COALESCE(SUM(amount_received), 0) INTO v_collected
  FROM payments WHERE linked_job_id = NEW.id;
  SELECT COALESCE(SUM(amount), 0) INTO v_changes
  FROM change_orders WHERE project_id = NEW.id AND lower(status::text) = 'approved';
  NEW.collected_to_date := v_collected;
  NEW.remaining_balance := GREATEST(COALESCE(NEW.contract_value, 0) + v_changes - v_collected, 0);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS project_money_fields ON projects;
CREATE TRIGGER project_money_fields BEFORE INSERT OR UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION public.project_money_fields();

-- A payment or change order changed: re-save its project(s) so the trigger
-- above recalculates. Only touches projects whose numbers actually move.
CREATE OR REPLACE FUNCTION public.refresh_project_money() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ids uuid[];
BEGIN
  IF TG_TABLE_NAME = 'payments' THEN
    ids := ARRAY[CASE WHEN TG_OP <> 'INSERT' THEN OLD.linked_job_id END,
                 CASE WHEN TG_OP <> 'DELETE' THEN NEW.linked_job_id END];
  ELSE
    ids := ARRAY[CASE WHEN TG_OP <> 'INSERT' THEN OLD.project_id END,
                 CASE WHEN TG_OP <> 'DELETE' THEN NEW.project_id END];
  END IF;
  UPDATE projects SET collected_to_date = collected_to_date WHERE id = ANY (ids);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS refresh_project_money ON payments;
CREATE TRIGGER refresh_project_money AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION public.refresh_project_money();
DROP TRIGGER IF EXISTS refresh_project_money ON change_orders;
CREATE TRIGGER refresh_project_money AFTER INSERT OR UPDATE OR DELETE ON change_orders
  FOR EACH ROW EXECUTE FUNCTION public.refresh_project_money();

-- Fill them in for every existing project now.
UPDATE projects SET collected_to_date = collected_to_date;

NOTIFY pgrst, 'reload schema';
