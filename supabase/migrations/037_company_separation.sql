-- Keep each company's records separate, including companies added later.
--
-- 1. Every new record on a company-scoped table gets a company_id, decided in
--    the database so it holds for every path (app, API functions, imports):
--      a) Job-level parent wins: a record tied to a project, estimate, or
--         invoice always takes that job's company. A draw for a Principle
--         Roofing project is Principle Roofing's, whatever the switcher says.
--      b) Otherwise the company the app sent (the sidebar company switcher).
--      c) Otherwise the linked client's or lead's company. It's only a
--         fallback, since one client can hire more than one company.
--      d) Still none (created under "All companies" with nothing linked): the
--         first company, Principle Outdoor Living, so nothing is orphaned.
--    The app leaves company_id unset when a job-level parent is present
--    (base44Client.js), letting this trigger decide.
--
-- 2. Storage: the "Allow public reads" policy let ANYONE, logged in or not,
--    list every file in the Attachements bucket (signed contracts, job
--    photos, permits). Direct file links keep working because the bucket is
--    public; only listing is removed, and staff can still list.
-- Run this in your Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.inherit_company_id() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j jsonb := to_jsonb(NEW);
  cid uuid;
  uuid_re text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  ref text;
BEGIN
  -- a) Job-level parent always wins.
  ref := j->>'project_id';
  IF cid IS NULL AND ref ~ uuid_re THEN SELECT company_id INTO cid FROM projects WHERE id = ref::uuid; END IF;
  ref := j->>'estimate_id';
  IF cid IS NULL AND ref ~ uuid_re THEN SELECT company_id INTO cid FROM estimates WHERE id = ref::uuid; END IF;
  ref := j->>'invoice_id';
  IF cid IS NULL AND ref ~ uuid_re THEN SELECT company_id INTO cid FROM invoices WHERE id = ref::uuid; END IF;
  IF cid IS NOT NULL THEN
    NEW.company_id := cid;
    RETURN NEW;
  END IF;

  -- b) Keep what the app sent.
  IF NEW.company_id IS NOT NULL THEN RETURN NEW; END IF;

  -- c) Fall back to the linked lead's or client's company.
  ref := COALESCE(j->>'lead_id', j->>'linked_lead_id');
  IF cid IS NULL AND ref ~ uuid_re THEN SELECT company_id INTO cid FROM leads WHERE id = ref::uuid; END IF;
  ref := COALESCE(j->>'client_id', j->>'linked_client_id', j->>'linked_contact_id');
  IF cid IS NULL AND ref ~ uuid_re THEN SELECT company_id INTO cid FROM clients WHERE id = ref::uuid; END IF;

  -- d) Last resort: the first company, so nothing is left untagged.
  IF cid IS NULL THEN
    SELECT id INTO cid FROM company_profiles WHERE id = '687dd747-560c-4ce4-8d84-b181db5edbc4'; -- Principle Outdoor Living
  END IF;
  IF cid IS NULL THEN SELECT id INTO cid FROM company_profiles ORDER BY created_at LIMIT 1; END IF;
  NEW.company_id := cid;
  RETURN NEW;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'leads', 'clients', 'estimates', 'invoices', 'payments', 'calendar_events',
    'tasks', 'change_orders', 'draws', 'sub_invoices', 'projects', 'documents',
    'municipalities', 'barrier_daily_logs', 'subcontractor_barrier_acknowledgments'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'company_id') THEN
      EXECUTE format('DROP TRIGGER IF EXISTS inherit_company_id ON %I', t);
      EXECUTE format('CREATE TRIGGER inherit_company_id BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION public.inherit_company_id()', t);
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Allow public reads" ON storage.objects;
DROP POLICY IF EXISTS "staff_list_attachments" ON storage.objects;
CREATE POLICY "staff_list_attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'Attachements' AND (SELECT public.is_staff()));
