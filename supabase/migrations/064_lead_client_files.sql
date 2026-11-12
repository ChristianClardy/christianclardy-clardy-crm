-- Files on leads and clients, carried onto the project without copying.
--
-- Attachments stay one row per file. entity_type/entity_id is where the file
-- lives now. origin_entity_type/origin_entity_id is where it was first filed
-- (a lead, a client, or a project) and does not change when the row is
-- re-linked, so the lead and client pages can still find it.
--
-- Carry rules (re-link, never insert a second row):
--   * A lead linked to a client: its files move onto that client.
--     If the client has exactly one open project (planning / in_progress /
--     on_hold), they move onto that project instead.
--   * A new project, or a project that just gained a client: files still on
--     that client and on its leads move onto this project. Files already on
--     another project stay there.
--   * A file inserted on a lead or client afterwards follows the same rule,
--     so a proposal or invoice filed by the assistant lands on the project
--     once one exists.
--   * The same stored URL already on the destination is not kept twice: the
--     source row is removed and the destination row remains.
--
-- Does not rewrite the 64 project files already in production (origin stays
-- null; they keep showing on the project). Does not touch the archived
-- March 2026 lead import, payments, draws, or messaging.
--
-- NOT applied to production by the agent. Run this file in the Supabase SQL
-- editor (or supabase db push) after review. Until it is applied, the app
-- still shows lead and client files on the project by reading those rows;
-- applying it is what makes the row itself move for every path, including
-- the assistant.

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS origin_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS origin_entity_id UUID;

COMMENT ON COLUMN attachments.origin_entity_type IS
  'Entity the file was first attached to (lead, client, project). Unchanged when the row is re-linked.';
COMMENT ON COLUMN attachments.origin_entity_id IS
  'Id the file was first attached to. Unchanged when the row is re-linked.';

CREATE INDEX IF NOT EXISTS idx_attachments_origin
  ON attachments (origin_entity_type, origin_entity_id);

-- Remember the first home, and store entity_type in lowercase so lead/client/
-- project lookups match the values the app already writes.
CREATE OR REPLACE FUNCTION public.attachments_set_origin() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.entity_type := lower(btrim(NEW.entity_type));
  IF NEW.origin_entity_type IS NULL THEN
    NEW.origin_entity_type := NEW.entity_type;
  ELSE
    NEW.origin_entity_type := lower(btrim(NEW.origin_entity_type));
  END IF;
  IF NEW.origin_entity_id IS NULL THEN
    NEW.origin_entity_id := NEW.entity_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS attachments_set_origin ON attachments;
CREATE TRIGGER attachments_set_origin
  BEFORE INSERT ON attachments
  FOR EACH ROW EXECUTE FUNCTION public.attachments_set_origin();

-- Move every file currently on one record onto another. Same URL already on
-- the destination: drop the source row (the file itself remains). Rows
-- already on the destination are left alone. SECURITY INVOKER so RLS and the
-- viewer read-only trigger still apply to the person who caused the move.
CREATE OR REPLACE FUNCTION public.carry_attachments(
  p_from_type text,
  p_from_id uuid,
  p_to_type text,
  p_to_id uuid
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  from_type text := lower(btrim(COALESCE(p_from_type, '')));
  to_type text := lower(btrim(COALESCE(p_to_type, '')));
BEGIN
  IF p_from_id IS NULL OR p_to_id IS NULL OR from_type = '' OR to_type = '' THEN
    RETURN;
  END IF;
  IF from_type = to_type AND p_from_id = p_to_id THEN
    RETURN;
  END IF;

  DELETE FROM attachments src
  WHERE lower(src.entity_type) = from_type
    AND src.entity_id = p_from_id
    AND src.url IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM attachments dst
      WHERE lower(dst.entity_type) = to_type
        AND dst.entity_id = p_to_id
        AND dst.url = src.url
        AND dst.id <> src.id
    );

  UPDATE attachments
     SET entity_type = to_type,
         entity_id = p_to_id
   WHERE lower(entity_type) = from_type
     AND entity_id = p_from_id;
END $$;

-- Where a lead's files should sit right now.
CREATE OR REPLACE FUNCTION public.carry_lead_files(p_lead_id uuid) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  open_count int;
  open_project uuid;
BEGIN
  IF p_lead_id IS NULL THEN
    RETURN;
  END IF;
  SELECT leads.linked_contact_id INTO v_client_id FROM leads WHERE leads.id = p_lead_id;
  IF v_client_id IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO open_count
  FROM projects
  WHERE projects.client_id = v_client_id
    AND projects.status::text IN ('planning', 'in_progress', 'on_hold');

  IF open_count = 1 THEN
    SELECT projects.id INTO open_project
    FROM projects
    WHERE projects.client_id = v_client_id
      AND projects.status::text IN ('planning', 'in_progress', 'on_hold')
    LIMIT 1;
    PERFORM public.carry_attachments('lead', p_lead_id, 'project', open_project);
  ELSE
    PERFORM public.carry_attachments('lead', p_lead_id, 'client', v_client_id);
  END IF;
END $$;

-- Files still on the contact (and that contact's leads) move onto this project.
CREATE OR REPLACE FUNCTION public.carry_client_files_to_project(p_client_id uuid, p_project_id uuid) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
BEGIN
  IF p_client_id IS NULL OR p_project_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.carry_attachments('client', p_client_id, 'project', p_project_id);

  FOR v_lead_id IN
    SELECT l.id FROM leads l WHERE l.linked_contact_id = p_client_id
    UNION
    SELECT c.linked_lead_id FROM clients c
    WHERE c.id = p_client_id AND c.linked_lead_id IS NOT NULL
  LOOP
    PERFORM public.carry_attachments('lead', v_lead_id, 'project', p_project_id);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.carry_files_on_lead_link() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.linked_contact_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.linked_contact_id IS NOT DISTINCT FROM OLD.linked_contact_id THEN
    RETURN NEW;
  END IF;
  PERFORM public.carry_lead_files(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS carry_files_on_lead_link ON leads;
CREATE TRIGGER carry_files_on_lead_link
  AFTER INSERT OR UPDATE OF linked_contact_id ON leads
  FOR EACH ROW EXECUTE FUNCTION public.carry_files_on_lead_link();

CREATE OR REPLACE FUNCTION public.carry_files_on_client_link() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  open_count int;
  open_project uuid;
BEGIN
  IF NEW.linked_lead_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.linked_lead_id IS NOT DISTINCT FROM OLD.linked_lead_id THEN
    RETURN NEW;
  END IF;
  -- The lead row may not point back at this client yet (the contact is often
  -- created first). File the lead's documents here, or onto the only open job.
  SELECT count(*) INTO open_count
  FROM projects
  WHERE projects.client_id = NEW.id
    AND projects.status::text IN ('planning', 'in_progress', 'on_hold');
  IF open_count = 1 THEN
    SELECT projects.id INTO open_project
    FROM projects
    WHERE projects.client_id = NEW.id
      AND projects.status::text IN ('planning', 'in_progress', 'on_hold')
    LIMIT 1;
    PERFORM public.carry_attachments('lead', NEW.linked_lead_id, 'project', open_project);
  ELSE
    PERFORM public.carry_attachments('lead', NEW.linked_lead_id, 'client', NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS carry_files_on_client_link ON clients;
CREATE TRIGGER carry_files_on_client_link
  AFTER INSERT OR UPDATE OF linked_lead_id ON clients
  FOR EACH ROW EXECUTE FUNCTION public.carry_files_on_client_link();

CREATE OR REPLACE FUNCTION public.carry_files_on_project() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.client_id IS NOT DISTINCT FROM OLD.client_id THEN
    RETURN NEW;
  END IF;
  PERFORM public.carry_client_files_to_project(NEW.client_id, NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS carry_files_on_project ON projects;
CREATE TRIGGER carry_files_on_project
  AFTER INSERT OR UPDATE OF client_id ON projects
  FOR EACH ROW EXECUTE FUNCTION public.carry_files_on_project();

-- A file added after the link already exists (manual upload, or the assistant
-- filing a proposal / invoice) follows the same rule immediately.
CREATE OR REPLACE FUNCTION public.carry_files_on_attachment() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  open_count int;
  open_project uuid;
BEGIN
  IF lower(NEW.entity_type) = 'lead' THEN
    PERFORM public.carry_lead_files(NEW.entity_id);
  ELSIF lower(NEW.entity_type) = 'client' THEN
    SELECT count(*) INTO open_count
    FROM projects
    WHERE projects.client_id = NEW.entity_id
      AND projects.status::text IN ('planning', 'in_progress', 'on_hold');
    IF open_count = 1 THEN
      SELECT projects.id INTO open_project
      FROM projects
      WHERE projects.client_id = NEW.entity_id
        AND projects.status::text IN ('planning', 'in_progress', 'on_hold')
      LIMIT 1;
      PERFORM public.carry_attachments('client', NEW.entity_id, 'project', open_project);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS carry_files_on_attachment ON attachments;
CREATE TRIGGER carry_files_on_attachment
  AFTER INSERT ON attachments
  FOR EACH ROW EXECUTE FUNCTION public.carry_files_on_attachment();

REVOKE ALL ON FUNCTION public.attachments_set_origin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.carry_attachments(text, uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.carry_lead_files(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.carry_client_files_to_project(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.carry_files_on_lead_link() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.carry_files_on_client_link() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.carry_files_on_project() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.carry_files_on_attachment() FROM PUBLIC, anon;

-- The person who saved the lead/client/project/file is the one the trigger
-- runs as, so they need EXECUTE. RLS still decides which rows they can move.
GRANT EXECUTE ON FUNCTION public.attachments_set_origin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.carry_attachments(text, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.carry_lead_files(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.carry_client_files_to_project(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.carry_files_on_lead_link() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.carry_files_on_client_link() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.carry_files_on_project() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.carry_files_on_attachment() TO authenticated, service_role;
