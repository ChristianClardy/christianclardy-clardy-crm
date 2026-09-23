// Serverless function to invite a new user via Supabase Auth admin API.
// Uses the service role key (server-side only — never exposed to the browser).
//
// Callers must be signed-in staff (Authorization: Bearer <access token>), as
// decided by the database's is_staff() (see 034_subcontractor_portal.sql).
//   - Staff invite: emails a set-password link and adds the login to the staff
//     organization. Re-inviting an existing login just grants staff access.
//   - Subcontractor invite (`subcontractor_id`): creates a Builder Portal login
//     limited to that sub's assigned jobs.

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminHeaders = () => ({
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
});

async function rpc(fn, args, headers = adminHeaders()) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`${fn} failed: ${err.message || res.statusText}`);
  }
  return res.json();
}

async function insertRow(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || res.statusText);
  }
}

// Returns the calling user if the database says they're staff, else null.
async function getStaffCaller(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  if (!user?.id) return null;
  // Evaluate is_staff() as the caller, not as the service role.
  const isStaff = await rpc('is_staff', {}, { apikey: SERVICE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
  return isStaff === true ? user : null;
}

async function grantStaff(userId, email) {
  const orgId = await rpc('staff_org_id');
  const existing = await fetch(
    `${SUPABASE_URL}/rest/v1/organization_members?select=id&user_id=eq.${userId}&organization_id=eq.${orgId}`,
    { headers: adminHeaders() }
  ).then((r) => r.json());
  if (existing.length) {
    await fetch(`${SUPABASE_URL}/rest/v1/organization_members?id=eq.${existing[0].id}`, {
      method: 'PATCH',
      headers: { ...adminHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'active' }),
    });
    return;
  }
  await insertRow('organization_members', {
    organization_id: orgId,
    user_id: userId,
    role: 'user',
    status: 'active',
    invited_email: email.toLowerCase(),
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  if (!SERVICE_KEY) {
    res.status(500).json({ error: 'Server misconfiguration: missing service key.' });
    return;
  }

  const { email, full_name, subcontractor_id } = req.body || {};

  if (!email) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }

  try {
    const caller = await getStaffCaller(req);
    if (!caller) {
      res.status(401).json({ error: 'Only signed-in staff can send invites.' });
      return;
    }

    const metadata = { ...(full_name ? { full_name } : {}), ...(subcontractor_id ? { portal_role: 'subcontractor' } : {}) };
    const inviteRes = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ email, data: metadata }),
    });
    const payload = await inviteRes.json();

    if (!inviteRes.ok) {
      const msg = payload?.msg || payload?.message || payload?.error_description || 'Invite failed.';
      const taken = /already.*registered|already.*exists/i.test(msg);
      if (taken && !subcontractor_id) {
        // Existing login (e.g. an earlier invite that never finished setup):
        // grant staff access instead of sending a second account email.
        const existingId = await rpc('auth_user_id_by_email', { p_email: email });
        if (!existingId) throw new Error(msg);
        await grantStaff(existingId, email);
        res.status(200).json({ success: true, existing: true });
        return;
      }
      res.status(inviteRes.status).json({
        error: taken
          ? 'That email already has a Clardy login. Use a different email for the subcontractor.'
          : msg,
      });
      return;
    }

    const userId = payload?.id || payload?.user?.id;
    if (!userId) throw new Error('Invite sent but no user id came back; access was not granted.');

    try {
      if (subcontractor_id) {
        await insertRow('subcontractor_portal_users', {
          user_id: userId,
          subcontractor_id,
          email: email.toLowerCase(),
          full_name: full_name || null,
          invited_by: caller.email,
        });
      } else {
        await grantStaff(userId, email);
      }
    } catch (linkErr) {
      // Don't leave a half-set-up login behind; the invite can simply be re-sent.
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: adminHeaders() });
      throw new Error(`Could not grant access: ${linkErr.message}`);
    }

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
