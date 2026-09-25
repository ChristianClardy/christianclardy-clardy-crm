import { supabase } from '@/lib/supabase';

// fetch() for our own /api/ endpoints, with the signed-in user's access token
// attached. Endpoints that act with the service role check it is staff
// (api/_lib/staffAuth.js) and refuse the request without it.
export async function apiFetch(url, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${session?.access_token || ''}` },
  });
}
