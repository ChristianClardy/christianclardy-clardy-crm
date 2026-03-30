import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ACCULYNX_API = "https://api.acculynx.com/api/v2";

function getApiKey() {
  const key = Deno.env.get("ACCULYNX_API_KEY");
  if (!key) throw new Error("ACCULYNX_API_KEY secret is not set");
  return key;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const headers = { accept: "application/json", Authorization: `Bearer ${getApiKey()}` };

    // Get first contact
    const listRes = await fetch(`${ACCULYNX_API}/contacts?pageSize=1&page=1`, { headers });
    const listData = await listRes.json();
    const firstContact = listData.items?.[0];
    if (!firstContact) return Response.json({ error: "No contacts found" });

    const contactId = body.contactId || firstContact.id;

    // Check full job object for financial fields
    const jobsRes = await fetch(`${ACCULYNX_API}/jobs?pageSize=2&page=1`, { headers });
    const jobsData = await jobsRes.json();
    const firstJob = jobsData.items?.[0];
    if (!firstJob) return Response.json({ error: "no jobs" });
    
    // Also check job detail endpoint
    const jobDetailRes = await fetch(`${ACCULYNX_API}/jobs/${firstJob.id}`, { headers });
    const jobDetail = jobDetailRes.ok ? await jobDetailRes.json() : { error: "no detail endpoint" };
    
    // Also check estimates for this job
    const estimatesRes = await fetch(`${ACCULYNX_API}/jobs/${firstJob.id}/estimates`, { headers });
    const estimatesData = estimatesRes.ok ? await estimatesRes.json() : { error: "no estimates" };
    
    // Find a job with estimates
    let jobWithEstimate = null;
    let jobEstimates = null;
    for (const job of jobsData.items || []) {
      const estRes = await fetch(`${ACCULYNX_API}/jobs/${job.id}/estimates`, { headers });
      const estData = estRes.ok ? await estRes.json() : {};
      if ((estData.count || 0) > 0) {
        jobWithEstimate = job;
        jobEstimates = estData;
        break;
      }
    }
    // Search more pages if needed
    if (!jobWithEstimate) {
      const page5 = await fetch(`${ACCULYNX_API}/jobs?pageSize=25&page=5`, { headers });
      const page5Data = await page5.json();
      for (const job of page5Data.items || []) {
        const estRes = await fetch(`${ACCULYNX_API}/jobs/${job.id}/estimates`, { headers });
        const estData = estRes.ok ? await estRes.json() : {};
        if ((estData.count || 0) > 0) {
          jobWithEstimate = job;
          jobEstimates = estData;
          break;
        }
      }
    }
    const estId = jobEstimates?.items?.[0]?.id;
    let estDetail = null;
    if (estId) {
      const detRes = await fetch(`${ACCULYNX_API}/estimates/${estId}`, { headers });
      estDetail = detRes.ok ? await detRes.json() : { error: await detRes.text() };
    }
    return Response.json({
      estimate_id: estId,
      estimate_detail_keys: estDetail ? Object.keys(estDetail) : null,
      estimate_detail: estDetail,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});