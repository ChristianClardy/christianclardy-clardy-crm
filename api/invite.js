// Serverless function to invite a new user via Supabase Auth admin API.
// Uses the service role key (server-side only — never exposed to the browser).
//
// Callers must be signed-in staff (Authorization: Bearer <access token>), as
// decided by the database's is_staff() (see 034_subcontractor_portal.sql).
//   - Staff invite: emails a set-password link and adds the login to the staff
//     organization. Re-inviting an existing login just grants staff access.
//   - Subcontractor invite (`subcontractor_id`): creates a Subcontractor Portal login
//     limited to that sub's assigned jobs.
//   - PM invite (`pm: { employee_id, all_jobs }`): creates a Builder Portal-only
//     login for a project manager, limited to their jobs and with no money
//     or CRM access (040_pm_portal_logins.sql).
//
// ?action=text-link (staff): same sub login, but instead of an email it
// returns a /join link for staff to text from their own phone. Pass
// `user_id` instead to get a fresh link for an existing sub login.
// ?action=redeem (public): trades a /join link's token for a one-time sign-in
// token (see src/pages/JoinPortal.jsx). The join token is HMAC-signed and
// only ever works for an active subcontractor login, never staff.

const crypto = require('crypto');
const { getStaffCaller } = require('./_lib/staffAuth.js');

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

const JOIN_LINK_DAYS = 7;
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const sign = (body) => b64url(crypto.createHmac('sha256', `join-link:${SERVICE_KEY}`).update(body).digest());

function makeJoinToken(userId) {
  const body = b64url(JSON.stringify({ u: userId, e: Math.floor(Date.now() / 1000) + JOIN_LINK_DAYS * 86400 }));
  return `${body}.${sign(body)}`;
}

// Returns the user id, or null if the token is forged, malformed or expired.
function readJoinToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { u, e } = JSON.parse(Buffer.from(body, 'base64url').toString());
    return u && e > Date.now() / 1000 ? u : null;
  } catch {
    return null;
  }
}

async function getRow(table, userId) {
  const rows = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?select=*&user_id=eq.${encodeURIComponent(userId)}`,
    { headers: adminHeaders() }
  ).then((r) => r.json());
  return Array.isArray(rows) ? rows[0] || null : null;
}

// A limited (non-staff) login: a sub's Subcontractor Portal login or a PM's
// Builder Portal login. Returns { kind: 'sub' | 'pm', row } or null.
async function getPortalLogin(userId) {
  const sub = await getRow('subcontractor_portal_users', userId);
  if (sub) return { kind: 'sub', row: sub };
  const pm = await getRow('pm_portal_users', userId).catch(() => null);
  return pm ? { kind: 'pm', row: pm } : null;
}

// Which limited login a request is for, from its body.
function requestedKind(body) {
  if (body.subcontractor_id) return 'sub';
  if (body.pm) return 'pm';
  return null;
}

function portalRow(kind, body, userId, email, caller) {
  const base = { user_id: userId, email: email.toLowerCase(), full_name: body.full_name || null, invited_by: caller.email };
  if (kind === 'sub') return ['subcontractor_portal_users', { ...base, subcontractor_id: body.subcontractor_id }];
  return ['pm_portal_users', { ...base, employee_id: body.pm.employee_id || null, all_jobs: !!body.pm.all_jobs }];
}

const PORTAL_ROLE = { sub: 'subcontractor', pm: 'project_manager' };

function joinUrl(req, userId) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}/join?t=${makeJoinToken(userId)}`;
}

async function handleTextLink(req, res, caller) {
  const body = req.body || {};
  const { email, full_name, subcontractor_id, user_id } = body;

  // Fresh link for someone who already has a login.
  if (user_id) {
    const login = await getPortalLogin(user_id);
    if (!login) return res.status(404).json({ error: 'Links only work for Subcontractor Portal and Builder Portal logins.' });
    if (!login.row.active) return res.status(400).json({ error: 'Turn this login back on before sending a link.' });
    return res.status(200).json({ url: joinUrl(req, user_id), email: login.row.email, days: JOIN_LINK_DAYS });
  }

  const kind = requestedKind(body);
  if (!email || !kind) return res.status(400).json({ error: 'Email and who the login is for are required.' });

  // Create the login without sending Supabase's invite email.
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({
      email,
      email_confirm: true,
      user_metadata: { ...(full_name ? { full_name } : {}), portal_role: PORTAL_ROLE[kind] },
    }),
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    const msg = created?.msg || created?.message || created?.error_description || 'Could not create the login.';
    if (/already.*registered|already.*exists/i.test(msg)) {
      // Already the same kind of login (same sub, or a PM login)? Just hand out a new link.
      const existingId = await rpc('auth_user_id_by_email', { p_email: email });
      const existing = existingId && (await getPortalLogin(existingId));
      const same = existing && existing.kind === kind && (kind === 'pm' || existing.row.subcontractor_id === subcontractor_id);
      if (same) {
        if (!existing.row.active) return res.status(400).json({ error: 'That login is turned off. Turn it back on first.' });
        return res.status(200).json({ url: joinUrl(req, existingId), email: existing.row.email, days: JOIN_LINK_DAYS, existing: true });
      }
      return res.status(400).json({ error: 'That email already has a Clardy login. Use a different email.' });
    }
    return res.status(createRes.status).json({ error: msg });
  }

  const userId = created?.id || created?.user?.id;
  if (!userId) throw new Error('Login created but no user id came back; access was not granted.');
  try {
    await insertRow(...portalRow(kind, body, userId, email, caller));
  } catch (linkErr) {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: adminHeaders() });
    throw new Error(`Could not grant access: ${linkErr.message}`);
  }
  return res.status(200).json({ url: joinUrl(req, userId), email: email.toLowerCase(), days: JOIN_LINK_DAYS });
}

async function handleRedeem(req, res) {
  const expired = 'This link has expired or is not valid. Ask your project manager to text you a new one.';
  const userId = readJoinToken((req.body || {}).t);
  if (!userId) return res.status(400).json({ error: expired });

  const login = await getPortalLogin(userId);
  if (!login) return res.status(400).json({ error: expired });
  const portalUser = login.row;
  if (!portalUser.active) {
    return res.status(403).json({ error: `Your ${login.kind === 'pm' ? 'Builder' : 'Subcontractor'} Portal access has been turned off. Contact your office.` });
  }

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, { headers: adminHeaders() });
  const user = await userRes.json();
  if (!userRes.ok || !user?.email) return res.status(400).json({ error: expired });

  const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ type: 'magiclink', email: user.email }),
  });
  const link = await linkRes.json();
  const tokenHash = link?.hashed_token || link?.properties?.hashed_token;
  if (!linkRes.ok || !tokenHash) throw new Error(link?.msg || link?.message || 'Could not start sign-in.');

  return res.status(200).json({ token_hash: tokenHash, email: user.email, full_name: portalUser.full_name || null, portal: login.kind });
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

  const action = req.query?.action;
  if (action === 'redeem') {
    try {
      await handleRedeem(req, res);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }
  if (action === 'text-link') {
    try {
      const caller = await getStaffCaller(req);
      if (!caller) return res.status(401).json({ error: 'Only signed-in staff can send invites.' });
      await handleTextLink(req, res, caller);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  const body = req.body || {};
  const { email, full_name } = body;
  const kind = requestedKind(body);

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

    const metadata = { ...(full_name ? { full_name } : {}), ...(kind ? { portal_role: PORTAL_ROLE[kind] } : {}) };
    const inviteRes = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ email, data: metadata }),
    });
    const payload = await inviteRes.json();

    if (!inviteRes.ok) {
      const msg = payload?.msg || payload?.message || payload?.error_description || 'Invite failed.';
      const taken = /already.*registered|already.*exists/i.test(msg);
      if (taken && !kind) {
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
          ? 'That email already has a Clardy login. Use a different email.'
          : msg,
      });
      return;
    }

    const userId = payload?.id || payload?.user?.id;
    if (!userId) throw new Error('Invite sent but no user id came back; access was not granted.');

    try {
      if (kind) {
        await insertRow(...portalRow(kind, body, userId, email, caller));
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
