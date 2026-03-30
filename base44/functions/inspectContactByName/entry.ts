import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ACCULYNX_API = 'https://api.acculynx.com/api/v2';
const PAGE_SIZE = 25;

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

function normalizeName(name) {
  return (name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function getAccuLynxMilestone(notes) {
  const match = (notes || '').match(/AccuLynx milestone:\s*(.*)/i);
  return (match?.[1] || '').trim().toLowerCase();
}

function getBucket(client) {
  const milestone = getAccuLynxMilestone(client.notes);
  const stage = client.workflow_stage || 'new_lead';
  if (stage === 'dead_lead') return 'archived';
  if (milestone.includes('closed') || milestone.includes('close') || milestone.includes('invoiced')) return 'closed';
  if (milestone.includes('completed') || milestone.includes('complete')) return 'completed';
  if (stage === 'approved' || milestone.includes('approved')) return 'approved';
  if ((client.lifetime_value || 0) > 0) return 'prospects';
  return 'leads';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const searchName = body.name || '';
    const normalizedSearch = normalizeName(searchName);

    const clients = await base44.asServiceRole.entities.Client.list('-updated_date', 5000);
    const dbMatches = clients
      .filter((client) => normalizeName(client.name).includes(normalizedSearch))
      .map((client) => ({
        id: client.id,
        name: client.name,
        workflow_stage: client.workflow_stage,
        status: client.status,
        bucket: getBucket(client),
        acculynx_job_id: client.acculynx_job_id,
        lifetime_value: client.lifetime_value || 0,
        notes: client.notes || '',
        updated_date: client.updated_date,
      }));

    const firstPage = await acculynxGet(`/jobs?pageSize=${PAGE_SIZE}&pageStartIndex=0`);
    const totalJobs = firstPage.count || 0;
    const totalPages = Math.max(Math.ceil(totalJobs / PAGE_SIZE), 1);

    const acculynxMatches = [];
    for (let page = 1; page <= totalPages; page++) {
      const startIndex = (page - 1) * PAGE_SIZE;
      const pageData = page === 1 ? firstPage : await acculynxGet(`/jobs?pageSize=${PAGE_SIZE}&pageStartIndex=${startIndex}`);
      for (const job of pageData.items || []) {
        const milestone = typeof job.currentMilestone === 'string' ? job.currentMilestone : (job.currentMilestone?.name || '');
        const full = normalizeName(job.jobName?.includes(':') ? job.jobName.split(':').slice(1).join(':') : job.jobName);
        if (full.includes(normalizedSearch)) {
          acculynxMatches.push({
            id: String(job.id),
            jobName: job.jobName,
            currentMilestone: milestone,
            leadDeadReason: job.leadDeadReason?.name || job.leadDeadReason || '',
          });
        }
      }
    }

    return Response.json({
      searchName,
      dbMatches,
      acculynxMatches,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});