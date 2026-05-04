import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

// Mirror of Settings.jsx DEFAULT_PERMISSIONS — kept in sync manually
const DEFAULT_ROLE_PERMISSIONS = {
  admin:           { material_library: true  },
  project_manager: { material_library: true  },
  office:          { material_library: true  },
  foreman:         { material_library: false },
  laborer:         { material_library: false },
  other:           { material_library: false },
};

export function useRolePermissions() {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState(null); // null = loading

  useEffect(() => {
    if (!user) { setPermissions({}); return; }

    // Auth-level admins always have full manage access
    if (user.role === 'admin') {
      setPermissions({ __all: true });
      return;
    }

    Promise.all([
      supabase.from('employees').select('role').eq('email', user.email).maybeSingle(),
      supabase.from('company_profiles').select('settings').limit(1).single(),
    ]).then(([{ data: emp }, { data: profile }]) => {
      const empRole = emp?.role || 'other';
      const savedPerms = profile?.settings?.role_permissions?.[empRole] || {};
      setPermissions({
        ...DEFAULT_ROLE_PERMISSIONS[empRole],
        ...savedPerms,
      });
    }).catch(() => setPermissions({}));
  }, [user?.id, user?.role, user?.email]);

  const can = (key) => {
    if (!permissions) return false;
    if (permissions.__all) return true;
    return permissions[key] ?? false;
  };

  return { can, loading: permissions === null };
}
