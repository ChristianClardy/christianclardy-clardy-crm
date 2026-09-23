import { supabase } from '@/lib/supabase';

// Calls /api/invite with the signed-in user's access token (the endpoint
// rejects unauthenticated and subcontractor callers). Pass subcontractorId to
// create a Builder Portal login for that subcontractor instead of a staff one.
export async function sendInvite({ email, fullName, subcontractorId }) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/invite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token || ''}`,
    },
    body: JSON.stringify({ email, full_name: fullName, subcontractor_id: subcontractorId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Invite failed.');
  return json;
}
