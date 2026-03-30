import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ACCULYNX_API = 'https://api.acculynx.com/api/v2';

function getApiKey() {
  const key = Deno.env.get('ACCULYNX_API_KEY');
  if (!key) throw new Error('ACCULYNX_API_KEY secret is not set');
  return key;
}

async function fetchStartIndex(pageStartIndex) {
  const res = await fetch(`${ACCULYNX_API}/jobs?pageSize=25&pageStartIndex=${pageStartIndex}`, {
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${getApiKey()}`,
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) throw new Error(`AccuLynx ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return {
    pageStartIndex,
    reportedPageStartIndex: data.pageStartIndex,
    ids: (data.items || []).map((item) => String(item.id)),
    firstJobName: data.items?.[0]?.jobName || null,
    lastJobName: data.items?.[data.items.length - 1]?.jobName || null,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const first = await fetchStartIndex(0);
    const second = await fetchStartIndex(25);

    return Response.json({
      first,
      second,
      same: JSON.stringify(first.ids) === JSON.stringify(second.ids),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});