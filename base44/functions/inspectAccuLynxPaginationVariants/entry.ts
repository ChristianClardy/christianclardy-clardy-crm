import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ACCULYNX_API = 'https://api.acculynx.com/api/v2';

function getApiKey() {
  const key = Deno.env.get('ACCULYNX_API_KEY');
  if (!key) throw new Error('ACCULYNX_API_KEY secret is not set');
  return key;
}

async function fetchVariant(label, query) {
  const res = await fetch(`${ACCULYNX_API}/jobs?${query}`, {
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${getApiKey()}`,
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    return { label, query, error: `${res.status}: ${await res.text()}` };
  }

  const data = await res.json();
  return {
    label,
    query,
    count: data.count,
    ids: (data.items || []).slice(0, 5).map((item) => String(item.id)),
    firstJobName: data.items?.[0]?.jobName || null,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const variants = await Promise.all([
      fetchVariant('page=2', 'pageSize=25&page=2'),
      fetchVariant('pageNumber=2', 'pageSize=25&pageNumber=2'),
      fetchVariant('pageIndex=2', 'pageSize=25&pageIndex=2'),
      fetchVariant('skip=25', 'pageSize=25&skip=25'),
      fetchVariant('offset=25', 'pageSize=25&offset=25'),
      fetchVariant('pageNumber=1', 'pageSize=25&pageNumber=1'),
      fetchVariant('page=1', 'pageSize=25&page=1'),
    ]);

    return Response.json({ variants });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});