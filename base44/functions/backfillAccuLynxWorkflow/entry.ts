import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ACCULYNX_API = 'https://api.acculynx.com/api/v2';
const PAGE_SIZE = 25;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiKey() {
  const key = Deno.env.get('ACCULYNX_API_KEY');
  if (!key) throw new Error('ACCULYNX_API_KEY secret is not set');
  return key;
}

async function withRetry(fn, retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries) throw error;
      await sleep(1500 * (attempt + 1));
    }
  }
}

async function acculynxGet(path) {
  const res = await fetch(`${ACCULYNX_API}${path}`, {
    headers: { accept: 'application/json', Authorization: `Bearer ${getApiKey()}` },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`AccuLynx ${res.status}: ${await res.text()}`);
  return res.json();
}

function getWorkflowStage(milestone, leadDeadReason) {
  const normalizedMilestone = String(milestone || '').toLowerCase();
  return (normalizedMilestone.includes('cancel') || normalizedMilestone.includes('dead') || Boolean(leadDeadReason))
    ? 'dead_lead'
    : normalizedMilestone.includes('approved')
      ? 'approved'
      : normalizedMilestone.includes('proposal')
        ? 'proposal_sent'
        : normalizedMilestone.includes('contact')
          ? 'contacted'
          : normalizedMilestone.includes('negotiat')
            ? 'negotiating'
            : 'new_lead';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const clients = await base44.asServiceRole.entities.Client.list('-updated_date', 5000);
    const clientByJobId = Object.fromEntries(
      clients.filter((client) => client.acculynx_job_id).map((client) => [client.acculynx_job_id, client])
    );

    const firstPage = await acculynxGet(`/jobs?pageSize=${PAGE_SIZE}&pageStartIndex=0`);
    const totalJobs = firstPage.count || 0;
    const totalPages = Math.max(Math.ceil(totalJobs / PAGE_SIZE), 1);
    const startPage = Math.max(1, Number(body.startPage || 1));
    const maxPages = Math.max(1, Number(body.maxPages || totalPages));
    const endPage = Math.min(totalPages, startPage + maxPages - 1);

    let updated = 0;
    for (let page = startPage; page <= endPage; page++) {
      const startIndex = (page - 1) * PAGE_SIZE;
      const pageData = page === 1 ? firstPage : await acculynxGet(`/jobs?pageSize=${PAGE_SIZE}&pageStartIndex=${startIndex}`);

      for (const job of pageData.items || []) {
        const jobId = String(job.id);
        const client = clientByJobId[jobId];
        if (!client || client.sync_locked) continue;

        const milestone = typeof job.currentMilestone === 'string' ? job.currentMilestone : (job.currentMilestone?.name || 'prospect');
        const leadDeadReason = job.leadDeadReason?.name || job.leadDeadReason || '';
        const workflowStage = getWorkflowStage(milestone, leadDeadReason);

        await withRetry(() => base44.asServiceRole.entities.Client.update(client.id, {
          workflow_stage: workflowStage,
          notes: `AccuLynx milestone: ${milestone}${leadDeadReason ? ` | Dead reason: ${leadDeadReason}` : ''}`,
          status: 'prospect',
        }));
        updated++;
        await sleep(200);
      }
    }

    return Response.json({ updated, totalPages, totalJobs, startPage, endPage, nextPage: endPage < totalPages ? endPage + 1 : null });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});