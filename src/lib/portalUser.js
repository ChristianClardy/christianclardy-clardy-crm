import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Works out what kind of login this is, so App.jsx can show the right UI:
//   portalUser — the subcontractor_portal_users row for a sub's portal login
//   pmUser     — the pm_portal_users row for a PM's Builder Portal-only login
//   isStaff    — the database's is_staff() (active member of the staff org)
// None → a self-signed-up account with no access. This only picks the UI;
// the policies in 034_subcontractor_portal.sql are what enforce it.
export function usePortalUser(userId) {
  const [state, setState] = useState({ loading: !!userId, portalUser: null, pmUser: null, isStaff: true });

  useEffect(() => {
    if (!userId) { setState({ loading: false, portalUser: null, pmUser: null, isStaff: true }); return; }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    Promise.all([
      supabase.from('subcontractor_portal_users').select('*').eq('user_id', userId).maybeSingle(),
      supabase.rpc('is_staff'),
      supabase.from('pm_portal_users').select('*').eq('user_id', userId).maybeSingle(),
    ]).then(([{ data: portalUser }, { data: isStaff, error: staffErr }, { data: pmUser }]) => {
      if (cancelled) return;
      // If is_staff() can't be reached (e.g. migration not applied yet), fall
      // back to today's behavior rather than locking staff out of the app.
      setState({ loading: false, portalUser: portalUser || null, pmUser: pmUser || null, isStaff: staffErr ? true : isStaff === true });
    });
    return () => { cancelled = true; };
  }, [userId]);

  return state;
}
