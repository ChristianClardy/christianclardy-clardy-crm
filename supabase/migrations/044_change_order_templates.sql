-- Change order templates in Settings → Templates → Change Order Templates.
--
-- A contract_templates row is now either a contract ('contract', the default,
-- so every existing template stays a contract) or a change order template
-- ('change_order'). Contract lists (lead/deal Contracts tab) show only
-- contracts; a project's change order send screen shows change order
-- templates first and picks the first one automatically.
-- Run this in your Supabase SQL editor.

ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS template_type TEXT NOT NULL DEFAULT 'contract';

NOTIFY pgrst, 'reload schema';
