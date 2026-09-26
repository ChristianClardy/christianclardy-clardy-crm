-- Builder Portal (project managers): job dates, punch lists, inspection
-- results, PM daily report fields, and a read-only schedule for subs.
--
-- The schedule itself stays in project_sheets.rows (Calendar, Dashboard,
-- deadline alerts, draws and Reports all read it). Rows can now carry a
-- subcontractor_id; subs read only their own rows through
-- sub_portal_schedule(), never project_sheets directly.
-- Run this in your Supabase SQL editor.

-- Projects: target completion stays in end_date. baseline_end_date is the
-- first target, kept to show how far the job has slipped.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS actual_completion_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS baseline_end_date      DATE;

-- PM daily report fields on the existing daily log (one log per job per day).
ALTER TABLE barrier_daily_logs ADD COLUMN IF NOT EXISTS weather       TEXT;
ALTER TABLE barrier_daily_logs ADD COLUMN IF NOT EXISTS temperature_f INTEGER;
ALTER TABLE barrier_daily_logs ADD COLUMN IF NOT EXISTS crew_count    INTEGER;
ALTER TABLE barrier_daily_logs ADD COLUMN IF NOT EXISTS delays        TEXT;

-- Inspections: the permit checklist items gain a result.
ALTER TABLE permit_inspection_tasks ADD COLUMN IF NOT EXISTS result          TEXT NOT NULL DEFAULT 'scheduled'; -- scheduled | passed | failed | partial | cancelled
ALTER TABLE permit_inspection_tasks ADD COLUMN IF NOT EXISTS inspector       TEXT;
ALTER TABLE permit_inspection_tasks ADD COLUMN IF NOT EXISTS result_date     DATE;
ALTER TABLE permit_inspection_tasks ADD COLUMN IF NOT EXISTS schedule_row_id TEXT;
ALTER TABLE permit_inspection_tasks ADD COLUMN IF NOT EXISTS photos          JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE permit_inspection_tasks SET result = 'passed' WHERE completed AND result = 'scheduled';

-- Punch list.
CREATE TABLE IF NOT EXISTS punch_list_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID REFERENCES company_profiles(id) ON DELETE SET NULL,
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  location         TEXT,
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'open', -- open | ready (sub says done) | closed (PM verified)
  subcontractor_id UUID REFERENCES subcontractors(id) ON DELETE SET NULL,
  due_date         DATE,
  photos           JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by       TEXT,
  closed_at        TIMESTAMPTZ,
  closed_by        TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_punch_list_project ON punch_list_items(project_id);

ALTER TABLE punch_list_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_full_access" ON punch_list_items;
CREATE POLICY "authenticated_full_access" ON punch_list_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Staff only (see 034_subcontractor_portal.sql: every table needs this).
DROP POLICY IF EXISTS "staff_only" ON punch_list_items;
CREATE POLICY "staff_only" ON punch_list_items AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.is_staff())) WITH CHECK ((SELECT public.is_staff()));

DROP TRIGGER IF EXISTS inherit_company_id ON punch_list_items;
CREATE TRIGGER inherit_company_id BEFORE INSERT ON punch_list_items
  FOR EACH ROW EXECUTE FUNCTION public.inherit_company_id();
DROP TRIGGER IF EXISTS punch_list_items_updated_at ON punch_list_items;
CREATE TRIGGER punch_list_items_updated_at BEFORE UPDATE ON punch_list_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- A sub's own booked schedule rows on jobs they're assigned to.
CREATE OR REPLACE FUNCTION public.sub_portal_schedule()
RETURNS TABLE (project_id uuid, project_name text, row_id text, task text, phase text,
               start_date text, end_date text, status text, notes text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH r AS (
    SELECT s.project_id, e.row, e.ord
    FROM project_sheets s
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.rows) = 'array' THEN s.rows ELSE '[]'::jsonb END) WITH ORDINALITY AS e(row, ord)
    WHERE public.sub_can_access_project(s.project_id)
  )
  SELECT r.project_id, p.name, r.row->>'id', r.row->>'task',
         (SELECT h.row->>'section' FROM r h
           WHERE h.project_id = r.project_id AND (h.row->>'is_section_header')::boolean AND h.ord < r.ord
           ORDER BY h.ord DESC LIMIT 1),
         r.row->>'start_date', r.row->>'end_date', r.row->>'status', r.row->>'sub_notes'
  FROM r JOIN projects p ON p.id = r.project_id
  WHERE r.row->>'subcontractor_id' = public.portal_sub_id()::text
  ORDER BY r.row->>'start_date' NULLS LAST;
$$;
REVOKE ALL ON FUNCTION public.sub_portal_schedule() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sub_portal_schedule() TO authenticated;

NOTIFY pgrst, 'reload schema';
