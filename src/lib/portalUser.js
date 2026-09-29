import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Works out what kind of login this is, so App.jsx can show the right UI:
//   portalUser — the subcontractor_portal_users row for a sub's portal login
//   pmUser     — the pm_portal_users row for a PM's Builder Portal-only login
//   customerUser — the customer_portal_users row for a homeowner's Customer Portal login
//   isStaff    — the database's is_staff() (active member of the staff org)
// None → a self-signed-up account with no access. This only picks the UI;
// the policies in 034_subcontractor_portal.sql are what enforce it.
const EMPTY = { portalUser: null, pmUser: null, customerUser: null, isStaff: true };

// One retry for a request that never reached the server (weak signal).
async function tryTwice(run) {
  const res = await run();
  if (!res.error || !/load failed|failed to fetch|network/i.test(res.error.message || '')) return res;
  await new Promise((resolve) => setTimeout(resolve, 800));
  return run();
}

export function usePortalUser(userId) {
  // forUser: which login the answer is for. Until it matches userId the hook
  // reports loading, so a fresh sign-in never renders the staff app for a
  // moment before switching to the portal.
  const [state, setState] = useState({ forUser: null, ...EMPTY });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([
      tryTwice(() => supabase.from('subcontractor_portal_users').select('*').eq('user_id', userId).maybeSingle()),
      tryTwice(() => supabase.rpc('is_staff')),
      tryTwice(() => supabase.from('pm_portal_users').select('*').eq('user_id', userId).maybeSingle()),
      tryTwice(() => supabase.from('customer_portal_users').select('*').eq('user_id', userId).maybeSingle()),
    ]).then(([{ data: portalUser }, { data: isStaff, error: staffErr }, { data: pmUser }, { data: customerUser }]) => {
      if (cancelled) return;
      // If is_staff() can't be reached (e.g. migration not applied yet), fall
      // back to today's behavior rather than locking staff out of the app.
      setState({ forUser: userId, portalUser: portalUser || null, pmUser: pmUser || null, customerUser: customerUser || null, isStaff: staffErr ? true : isStaff === true });
    });
    return () => { cancelled = true; };
  }, [userId]);

  if (!userId) return { loading: false, ...EMPTY };
  if (state.forUser !== userId) return { loading: true, ...EMPTY };
  return { loading: false, ...state };
}
