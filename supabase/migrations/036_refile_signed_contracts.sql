-- One-time cleanup: the first two auto-saved signed contracts were filed on
-- both the lead and the client. Signed contracts now live in ONE place, the
-- project's Files tab (Contracts), so move them there and rename them to the
-- new "Signed Contract - <client> - <date>.pdf" format.
-- Run this in your Supabase SQL editor.

DELETE FROM attachments WHERE entity_type = 'lead' AND url LIKE '%/signed-contracts/%';

UPDATE attachments SET entity_type = 'project', entity_id = '4649e0f7-2201-4d49-b19e-2a0db6917e45', filename = 'Signed Contract - Lezlee Burt - 2026-09-14.pdf' WHERE entity_type = 'client' AND url LIKE '%716a8943-2022-88b9-82cc-c9b5d656c1d6%';

UPDATE attachments SET entity_type = 'project', entity_id = '3f741a2f-9398-4ef3-973b-d85bcc860c24', filename = 'Signed Contract - Tyler Roskelley - 2026-09-23.pdf' WHERE entity_type = 'client' AND url LIKE '%61055a1e-8505-8ccb-8068-379b27d8f109%';
