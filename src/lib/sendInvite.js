import { supabase } from '@/lib/supabase';

// Calls /api/invite with the signed-in user's access token (the endpoint
// rejects unauthenticated and subcontractor callers). Pass subcontractorId to
// create a Subcontractor Portal login for that subcontractor instead of a staff one.
// Pass pm ({ employee_id, all_jobs }) for a Builder Portal-only PM login.
export async function sendInvite({ email, fullName, subcontractorId, pm }) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/invite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token || ''}`,
    },
    body: JSON.stringify({ email, full_name: fullName, subcontractor_id: subcontractorId, pm }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Invite failed.');
  return json;
}

// Subcontractor Portal login for a subcontractor, delivered as a link staff text
// from their own phone instead of an email. Pass userId (and nothing else) to
// get a fresh link for an existing login. Resolves { url, email, days }.
export async function createTextInviteLink({ email, fullName, subcontractorId, pm, userId }) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/invite?action=text-link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token || ''}`,
    },
    body: JSON.stringify(userId
      ? { user_id: userId }
      : { email, full_name: fullName, subcontractor_id: subcontractorId, pm }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not create the link.');
  return json;
}
