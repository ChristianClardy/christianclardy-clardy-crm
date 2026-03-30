import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ACCULYNX_API = "https://api.acculynx.com/api/v2";
const PAGE_SIZE = 25;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getApiKey() {
  const key = Deno.env.get("ACCULYNX_API_KEY");
  if (!key) throw new Error("ACCULYNX_API_KEY secret is not set");
  return key;
}

function authHeaders() {
  return { accept: "application/json", Authorization: `Bearer ${getApiKey()}` };
}

async function acculynxGet(path) {
  const res = await fetch(`${ACCULYNX_API}${path}`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`AccuLynx ${res.status}: ${await res.text()}`);
  return res.json();
}

async function withRetry(fn, retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = err.message?.includes("429") || err.message?.includes("Rate limit");
      if (attempt < retries) {
        await sleep(isRateLimit ? 4000 * (attempt + 1) : 800);
      } else {
        throw err;
      }
    }
  }
}

function parseNameFromJobName(jobName) {
  if (!jobName) return "";
  const colonIdx = jobName.indexOf(":");
  if (colonIdx !== -1) return jobName.slice(colonIdx + 1).trim();
  return jobName.trim();
}

async function getContactPhoneEmail(contactId) {
  try {
    const [phoneRes, emailRes] = await Promise.all([
      fetch(`${ACCULYNX_API}/contacts/${contactId}/phone-numbers`, { headers: authHeaders(), signal: AbortSignal.timeout(6000) }),
      fetch(`${ACCULYNX_API}/contacts/${contactId}/email-addresses`, { headers: authHeaders(), signal: AbortSignal.timeout(6000) }),
    ]);
    const phones = phoneRes.ok ? await phoneRes.json() : {};
    const emails = emailRes.ok ? await emailRes.json() : {};
    const primaryPhone = (phones.items || []).find(p => p.primary) || (phones.items || [])[0];
    const primaryEmail = (emails.items || []).find(e => e.primary) || (emails.items || [])[0];
    return { phone: primaryPhone?.number || "", email: primaryEmail?.address || "" };
  } catch {
    return { phone: "", email: "" };
  }
}

async function getJobEstimateValue(jobId) {
  try {
    const listRes = await fetch(`${ACCULYNX_API}/jobs/${jobId}/estimates`, { headers: authHeaders(), signal: AbortSignal.timeout(6000) });
    if (!listRes.ok) return 0;
    const listData = await listRes.json();
    const primary = (listData.items || []).find(e => e.isPrimary) || listData.items?.[0];
    if (!primary?.id) return 0;
    const detailRes = await fetch(`${ACCULYNX_API}/estimates/${primary.id}`, { headers: authHeaders(), signal: AbortSignal.timeout(6000) });
    if (!detailRes.ok) return 0;
    const detail = await detailRes.json();
    return detail.financials?.totalPrice || 0;
  } catch {
    return 0;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    getApiKey();

    // Fetch first page to get total count
    const firstPageRes = await acculynxGet(`/jobs?pageSize=${PAGE_SIZE}&pageStartIndex=0`);
    const totalJobs = firstPageRes.count || 0;
    const totalPages = Math.max(Math.ceil(totalJobs / PAGE_SIZE), 1);

    const isScheduled = body.manual !== true && body.acculynxPage === undefined;
    let jobPage;
    if (isScheduled) {
      const hourSlot = Math.floor(Date.now() / (1000 * 60 * 60));
      jobPage = (hourSlot % totalPages) + 1;
    } else {
      jobPage = body.acculynxPage || 1;
    }

    const pageStartIndex = Math.max(0, (jobPage - 1) * PAGE_SIZE);
    const pageRes = jobPage === 1 ? firstPageRes : await acculynxGet(`/jobs?pageSize=${PAGE_SIZE}&pageStartIndex=${pageStartIndex}`);
    const pageJobs = pageRes.items || [];

    console.log(`[syncProspects] page=${jobPage}/${totalPages} startIndex=${pageStartIndex} totalJobs=${totalJobs} this_page=${pageJobs.length}`);

    if (pageJobs.length === 0) {
      return Response.json({ message: "No jobs on this page", synced: 0, errors: 0, nextPage: jobPage + 1, totalPages, done: jobPage >= totalPages });
    }

    // Load existing clients indexed by job ID (service role to get all)
    const existingClients = await withRetry(() =>
      base44.asServiceRole.entities.Client.list("-created_date", 5000)
    );
    const clientByJobId = {};
    for (const c of existingClients) {
      if (c.acculynx_job_id) clientByJobId[c.acculynx_job_id] = c;
    }

    // Build all payloads first (parallel AccuLynx fetches, sequential to avoid AccuLynx rate limits)
    const payloads = [];
    for (const job of pageJobs) {
      const jobId = String(job.id);
      const clientName = parseNameFromJobName(job.jobName) || `Job ${jobId}`;
      const addr = job.locationAddress || {};
      const address = [addr.street1, addr.city, addr.state?.abbreviation, addr.zipCode].filter(Boolean).join(", ");
      const primaryContactId = job.contacts?.find(c => c.isPrimary)?.contact?.id || job.contacts?.[0]?.contact?.id;
      const milestone = typeof job.currentMilestone === "string"
        ? job.currentMilestone
        : (job.currentMilestone?.name || "prospect");
      const leadDeadReason = job.leadDeadReason?.name || job.leadDeadReason || "";

      const [contactInfo, estimateValue] = await Promise.all([
        primaryContactId ? getContactPhoneEmail(primaryContactId) : Promise.resolve({ phone: "", email: "" }),
        getJobEstimateValue(jobId),
      ]);

      const normalizedMilestone = String(milestone || "").toLowerCase();
      const workflowStage = (normalizedMilestone.includes("cancel") || normalizedMilestone.includes("dead") || Boolean(leadDeadReason))
        ? "dead_lead"
        : normalizedMilestone.includes("approved")
          ? "approved"
          : normalizedMilestone.includes("proposal")
            ? "proposal_sent"
            : normalizedMilestone.includes("contact")
              ? "contacted"
              : normalizedMilestone.includes("negotiat")
                ? "negotiating"
                : normalizedMilestone.includes("completed")
                  ? "approved"
                  : normalizedMilestone.includes("closed") || normalizedMilestone.includes("invoiced")
                    ? "approved"
                    : "new_lead";

      payloads.push({
        jobId,
        clientName,
        payload: {
          name: clientName,
          phone: contactInfo.phone,
          email: contactInfo.email,
          address,
          status: "prospect",
          workflow_stage: workflowStage,
          acculynx_job_id: jobId,
          acculynx_contact_id: primaryContactId || null,
          notes: `AccuLynx milestone: ${milestone}${leadDeadReason ? ` | Dead reason: ${leadDeadReason}` : ""}`,
          lifetime_value: estimateValue,
        },
      });
      await sleep(200); // Pace AccuLynx calls
    }

    // Split into new vs existing
    const toCreate = payloads.filter(p => !clientByJobId[p.jobId]).map(p => p.payload);
    const lockedUpdates = payloads.filter(p => clientByJobId[p.jobId]?.sync_locked);
    const toUpdate = payloads.filter(p => clientByJobId[p.jobId] && !clientByJobId[p.jobId].sync_locked);

    console.log(`[syncProspects] existingClients=${existingClients.length} toCreate=${toCreate.length} toUpdate=${toUpdate.length} locked=${lockedUpdates.length}`);
    if (toCreate[0]) {
      console.log(`[syncProspects] firstCreateJobId=${toCreate[0].acculynx_job_id}`);
    }
    if (toUpdate[0]) {
      console.log(`[syncProspects] firstUpdateJobId=${toUpdate[0].jobId}`);
    }

    let synced = 0;
    let errors = 0;

    // Bulk create new records (1 DB call instead of N)
    if (toCreate.length > 0) {
      try {
        await withRetry(() => base44.asServiceRole.entities.Client.bulkCreate(toCreate));
        synced += toCreate.length;
        console.log(`[syncProspects] bulkCreate ${toCreate.length} new records`);
      } catch (err) {
        console.error(`bulkCreate failed: ${err.message}`);
        // Fall back to one-by-one
        for (const payload of toCreate) {
          try {
            await withRetry(() => base44.asServiceRole.entities.Client.create(payload));
            synced++;
            await sleep(400);
          } catch (e) {
            console.error(`Create failed for "${payload.name}": ${e.message}`);
            errors++;
          }
        }
      }
    }

    // Update existing records sequentially with spacing
    for (const { jobId, payload } of toUpdate) {
      try {
        await withRetry(() => base44.asServiceRole.entities.Client.update(clientByJobId[jobId].id, payload));
        synced++;
        await sleep(200);
      } catch (err) {
        console.error(`Update failed for job ${jobId}: ${err.message}`);
        errors++;
      }
    }

    const done = isScheduled || jobPage >= totalPages;
    console.log(`[syncProspects] Done. page=${jobPage}/${totalPages} created=${toCreate.length} updated=${toUpdate.length} locked=${lockedUpdates.length} errors=${errors}`);
    return Response.json({ message: `Synced ${synced} prospects`, synced, skipped_locked: lockedUpdates.length, errors, nextPage: jobPage + 1, totalPages, done });

  } catch (error) {
    console.error("[syncProspects] Fatal:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});