// Shared "is the caller signed-in staff?" check for api/ endpoints that use the
// service role key (which skips every database rule). Staff = the database's
// is_staff() evaluated as the caller (see 034_subcontractor_portal.sql), so
// subcontractor logins, self sign-ups and anonymous callers are all refused.
// The browser sends its Supabase access token as `Authorization: Bearer …`
// (src/lib/apiFetch.js).

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const READ_ONLY_MESSAGE = "View-only access: your login can see everything but can't make changes.";

// Returns the calling user if the database says they're staff, else null.
// `user.isViewer` = a view-only login (is_viewer(), 055), which may read but
// not change anything.
async function getStaffCaller(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || !SERVICE_KEY) return null;
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  if (!user?.id) return null;
  const staffRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_staff`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!staffRes.ok) return null;
  if ((await staffRes.json()) !== true) return null;
  const viewerRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_viewer`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  // Before 055 runs there is no is_viewer(): nobody is a viewer yet.
  user.isViewer = viewerRes.ok && (await viewerRes.json()) === true;
  return user;
}

// Sends 401 and returns null unless the caller is staff. A view-only login
// gets 403 for anything but a GET (every endpoint that changes something,
// sends a document or uploads a file is a POST/DELETE).
async function requireStaff(req, res) {
  const user = await getStaffCaller(req).catch(() => null);
  if (!user) { res.status(401).json({ error: 'Sign in with a staff account to do this.' }); return null; }
  if (user.isViewer && req.method !== 'GET') { res.status(403).json({ error: READ_ONLY_MESSAGE }); return null; }
  return user;
}

module.exports = { getStaffCaller, requireStaff, READ_ONLY_MESSAGE };
