import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { DEFAULT_PERMISSIONS, READ_ONLY_ROLES } from '@/lib/permissions';
import { setReadOnly } from '@/lib/readOnly';

// Which modules the signed-in staff member may use (Settings → Permissions).
// Admin = an admin member of the staff organization, as the database decides
// it (is_admin(), 054); admins can use everything. Everyone else gets their
// employee role's saved switches over the defaults in src/lib/permissions.js. The database enforces
// the sensitive ones (Municipalities) on its own; this only drives the UI.


// Saved switches live on the oldest company profile that has any (054 reads the same row).
export async function loadSavedRolePermissions() {
  const { data } = await supabase.from('company_profiles').select('id, settings').order('created_at').limit(50);
  const withPerms = (data || []).find((p) => p.settings?.role_permissions);
  return { profile: withPerms || (data || [])[0] || null, saved: withPerms?.settings?.role_permissions || null };
}

// Admin-only "Preview as role": a tab opened with ?viewAs=<role> shows the app
// the way that role sees it (sidebar, pages, project tabs). Kept per tab in
// sessionStorage; only changes what's shown, never what the database allows.
const PREVIEW_KEY = 'clardy_view_as';
(() => {
  try {
    const params = new URLSearchParams(window.location.search);
    const role = params.get('viewAs');
    if (role === null) return;
    if (role) sessionStorage.setItem(PREVIEW_KEY, role); else sessionStorage.removeItem(PREVIEW_KEY);
    params.delete('viewAs');
    const qs = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
  } catch { /* storage unavailable: no preview */ }
})();
export function previewRole() {
  try { return sessionStorage.getItem(PREVIEW_KEY) || null; } catch { return null; }
}
export function exitPreview() {
  try { sessionStorage.removeItem(PREVIEW_KEY); } catch { /* ignore */ }
  window.location.reload();
}

let adminCheck = null;
export function isAdmin({ refresh = false } = {}) {
  if (!adminCheck || refresh) adminCheck = supabase.rpc('is_admin').then(({ data, error }) => (error ? null : data === true));
  return adminCheck;
}

export function useRolePermissions() {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState(null); // null = loading

  useEffect(() => {
    if (!user) { setPermissions({}); return; }
    let cancelled = false;
    (async () => {
      // null = is_admin() isn't in the database yet: fall back to the old
      // user-metadata check so nobody is locked out before 054 runs.
      const admin = await isAdmin();
      if (cancelled) return;
      const preview = previewRole();
      if ((admin === true || (admin === null && user.role === 'admin')) && preview && DEFAULT_PERMISSIONS[preview] && preview !== 'admin') {
        const { saved } = await loadSavedRolePermissions();
        if (cancelled) return;
        setReadOnly(READ_ONLY_ROLES.has(preview));
        setPermissions({ ...DEFAULT_PERMISSIONS[preview], ...(saved?.[preview] || {}), __preview: preview, __readOnly: READ_ONLY_ROLES.has(preview) });
        return;
      }
      if (admin === true || (admin === null && user.role === 'admin')) { setReadOnly(false); setPermissions({ __all: true }); return; }
      const [{ data: emp }, { saved }] = await Promise.all([
        supabase.from('employees').select('role').ilike('email', user.email).maybeSingle(),
        loadSavedRolePermissions(),
      ]);
      if (cancelled) return;
      const empRole = emp?.role || 'other';
      setReadOnly(READ_ONLY_ROLES.has(empRole));
      setPermissions({ ...(DEFAULT_PERMISSIONS[empRole] || DEFAULT_PERMISSIONS.other), ...(saved?.[empRole] || {}), __readOnly: READ_ONLY_ROLES.has(empRole) });
    })().catch(() => { if (!cancelled) setPermissions({}); });
    return () => { cancelled = true; };
  }, [user?.id, user?.role, user?.email]);

  const can = (key) => {
    if (!permissions) return false;
    if (permissions.__all) return true;
    return permissions[key] ?? false;
  };

  return { can, loading: permissions === null, isAdmin: !!permissions?.__all, previewing: permissions?.__preview || null, readOnly: !!permissions?.__readOnly };
}
