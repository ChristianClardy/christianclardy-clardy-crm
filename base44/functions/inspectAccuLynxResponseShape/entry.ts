import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ACCULYNX_API = 'https://api.acculynx.com/api/v2';

function getApiKey() {
  const key = Deno.env.get('ACCULYNX_API_KEY');
  if (!key) throw new Error('ACCULYNX_API_KEY secret is not set');
  return key;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const res = await fetch(`${ACCULYNX_API}/jobs?pageSize=25&page=1`, {
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${getApiKey()}`,
      },
      signal: AbortSignal.timeout(12000),
    });

    const data = await res.json();

    return Response.json({
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      topLevelKeys: Object.keys(data),
      meta: {
        count: data.count,
        page: data.page,
        pageNumber: data.pageNumber,
        pageSize: data.pageSize,
        totalPages: data.totalPages,
        next: data.next,
        nextPage: data.nextPage,
        links: data.links,
      },
      sample: data.items?.[0] || null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});