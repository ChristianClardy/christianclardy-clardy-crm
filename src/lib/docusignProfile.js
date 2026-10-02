import { supabase } from '@/lib/supabase';

// The company profile that holds the DocuSign connection (settings.docusign).
// There can be more than one profile, so "any one row" can land on one
// without it; this matches what the server uses (api/_lib/docusign.js).
export async function loadDocuSignProfile() {
  const { data } = await supabase.from('company_profiles').select('id, settings').order('created_at').limit(50);
  const rows = data || [];
  return rows.find((p) => p.settings?.docusign?.access_token) || rows.find((p) => p.settings?.docusign) || rows[0] || null;
}
