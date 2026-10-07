import { supabase } from '@/lib/supabase';

// Calls /api/invite with the signed-in user's access token (the endpoint
// rejects unauthenticated and subcontractor callers). Pass subcontractorId to
// create a Subcontractor Portal login for that subcontractor instead of a staff one.
// Pass pm ({ employee_id, all_jobs }) for a Builder Portal-only PM login, or
// customer ({ client_id }) for a homeowner's Customer Portal login.
export async function sendInvite({ email, fullName, subcontractorId, pm, customer }) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/invite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token || ''}`,
    },
    body: JSON.stringify({ email, full_name: fullName, subcontractor_id: subcontractorId, pm, customer }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Invite failed.');
  return json;
}

// Subcontractor Portal login for a subcontractor, delivered as a link staff text
// from their own phone instead of an email. Pass userId (and nothing else) to
// get a fresh link for an existing login. Resolves { url, email, days }.
export async function createTextInviteLink({ email, fullName, subcontractorId, pm, customer, userId }) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/invite?action=text-link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token || ''}`,
    },
    body: JSON.stringify(userId
      ? { user_id: userId }
      : { email, full_name: fullName, subcontractor_id: subcontractorId, pm, customer }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not create the link.');
  return json;
}

// Staff login delivered as a link to copy and text instead of an email (for
// when Supabase can't send email). Resolves { url, existing }.
export async function createStaffInviteLink({ email, fullName }) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/invite?action=staff-link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token || ''}`,
    },
    body: JSON.stringify({ email, full_name: fullName }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not create the link.');
  return json;
}
