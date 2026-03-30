import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ACCULYNX_API = 'https://api.acculynx.com/api/v2';

function getApiKey() {
  const key = Deno.env.get('ACCULYNX_API_KEY');
  if (!key) throw new Error('ACCULYNX_API_KEY secret is not set');
  return key;
}

async function acculynxGet(path) {
  const res = await fetch(`${ACCULYNX_API}${path}`, {
    headers: { accept: 'application/json', Authorization: `Bearer ${getApiKey()}` },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`AccuLynx ${res.status}: ${await res.text()}`);
  return res.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const list = await acculynxGet('/jobs?pageSize=5&pageStartIndex=0');
    const ids = (list.items || []).slice(0, 5).map((item) => String(item.id));

    const details = await Promise.all(ids.map(async (id) => {
      const detail = await acculynxGet(`/jobs/${id}`);
      return {
        id,
        jobName: detail.jobName,
        currentMilestone: detail.currentMilestone,
        status: detail.status,
        keys: Object.keys(detail),
      };
    }));

    return Response.json({ details });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});