import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { DEFAULT_PERMISSIONS } from '@/lib/permissions';

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
      if (admin === true || (admin === null && user.role === 'admin')) { setPermissions({ __all: true }); return; }
      const [{ data: emp }, { saved }] = await Promise.all([
        supabase.from('employees').select('role').ilike('email', user.email).maybeSingle(),
        loadSavedRolePermissions(),
      ]);
      if (cancelled) return;
      const empRole = emp?.role || 'other';
      setPermissions({ ...(DEFAULT_PERMISSIONS[empRole] || DEFAULT_PERMISSIONS.other), ...(saved?.[empRole] || {}) });
    })().catch(() => { if (!cancelled) setPermissions({}); });
    return () => { cancelled = true; };
  }, [user?.id, user?.role, user?.email]);

  const can = (key) => {
    if (!permissions) return false;
    if (permissions.__all) return true;
    return permissions[key] ?? false;
  };

  return { can, loading: permissions === null, isAdmin: !!permissions?.__all };
}
