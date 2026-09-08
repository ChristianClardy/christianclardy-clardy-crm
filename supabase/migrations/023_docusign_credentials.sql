-- Stores the DocuSign OAuth app credentials (Integration Key + Client Secret)
-- entered from Settings > DocuSign, replacing the old VITE_DOCUSIGN_CLIENT_ID /
-- DOCUSIGN_CLIENT_ID / DOCUSIGN_CLIENT_SECRET Vercel env vars.
--
-- Deliberately a separate table from company_profiles: the client_secret must
-- never be exposed to the browser, but company_profiles.settings is fetched
-- wholesale by client-side `select("id, settings")` calls all over Settings.jsx
-- using the anon key. RLS here has no policies at all, so neither the anon nor
-- the authenticated role can read or write this table through the browser —
-- only the service-role key (used server-side in api/docusign-*.js) bypasses
-- RLS and can touch it.

CREATE TABLE IF NOT EXISTS docusign_credentials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     text NOT NULL,
  client_secret text NOT NULL,
  environment   text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE docusign_credentials ENABLE ROW LEVEL SECURITY;
