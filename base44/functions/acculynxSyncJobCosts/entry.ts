import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ACCULYNX_API = "https://api.acculynx.com/api/v2";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Read API key lazily — never at module level (breaks scheduled automations)
function getApiKey() {
  const key = Deno.env.get("ACCULYNX_API_KEY");
  if (!key) throw new Error("ACCULYNX_API_KEY secret is not set");
  return key;
}

async function acculynxGet(path) {
  const res = await fetch(`${ACCULYNX_API}${path}`, {
    headers: { accept: "application/json", Authorization: `Bearer ${getApiKey()}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`AccuLynx ${res.status}: ${await res.text()}`);
  return res.json();
}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Fetch cost breakdown using estimate-level financials only (no per-item API calls).
 * This avoids timeout issues caused by dozens of sequential section/item fetches.
 */
async function getPrimaryEstimateBreakdown(jobId) {
  try {
    const estList = await acculynxGet(`/jobs/${jobId}/estimates`);
    const estimates = estList.items || estList.data || (Array.isArray(estList) ? estList : []);
    if (!estimates.length) return null;

    const chosenStub = estimates.find(e => e.isPrimary) || estimates[0];
    const detail = await acculynxGet(`/estimates/${chosenStub.id}`);

    const f = detail.financials || {};
    const laborCost = parseFloat(f.laborCost || f.totalLabor || 0);
    const materialCost = parseFloat(f.materialCost || f.totalMaterial || 0);
    const totalCost = parseFloat(f.totalCost || f.totalPrice || 0);

    const sections = [];

    if (laborCost > 0) {
      sections.push({ id: newId(), name: "Labor", collapsed: false, items: [{ id: newId(), description: "Labor (from estimate)", budgeted: laborCost, actual: 0, notes: "" }] });
    }
    if (materialCost > 0) {
      sections.push({ id: newId(), name: "Materials", collapsed: false, items: [{ id: newId(), description: "Materials (from estimate)", budgeted: materialCost, actual: 0, notes: "" }] });
    }

    // Fallback: if no labor/material split, use total cost
    if (sections.length === 0 && totalCost > 0) {
      sections.push({ id: newId(), name: "Materials", collapsed: false, items: [{ id: newId(), description: "Total Cost (from estimate)", budgeted: totalCost, actual: 0, notes: "" }] });
    }

    if (sections.length === 0) return null;

    return { estimateId: String(chosenStub.id), sections };
  } catch (err) {
    console.error(`Failed to fetch estimate for job ${jobId}: ${err.message}`);
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Validate API key early
    getApiKey();

    // Fetch approved jobs (cap at 20 pages to prevent runaway)
    let jobs = [];
    let page = 1;
    while (page <= 20) {
      const jobsRes = await acculynxGet(`/jobs?milestones=approved&pageSize=25&page=${page}`);
      const batch = jobsRes.data || jobsRes.items || (Array.isArray(jobsRes) ? jobsRes : []);
      if (!batch.length) break;
      jobs = jobs.concat(batch);
      if (batch.length < 25) break;
      page++;
      await sleep(300);
    }

    if (jobs.length === 0) {
      return Response.json({ message: "No approved jobs found", synced: 0 });
    }

    console.log(`[acculynxSyncJobCosts] Found ${jobs.length} approved jobs`);

    // Load existing projects and breakdowns
    const [existingProjects, existingBreakdowns] = await Promise.all([
      base44.asServiceRole.entities.Project.list(),
      base44.asServiceRole.entities.JobCostBreakdown.list(),
    ]);

    const projectByAccuId = {};
    for (const p of existingProjects) {
      if (p.acculynx_job_id) projectByAccuId[p.acculynx_job_id] = p;
    }
    const breakdownByProjectId = {};
    for (const b of existingBreakdowns) {
      breakdownByProjectId[b.project_id] = b;
    }

    let synced = 0;
    let errors = 0;
    const now = new Date().toISOString();

    for (const job of jobs) {
      const jobId = String(job.id || job.jobId);

      const project = projectByAccuId[jobId];
      if (!project) {
        console.log(`Skipping job ${jobId} — no matching project found`);
        continue;
      }
      if (project.sync_locked) {
        console.log(`Skipping job ${jobId} — project is locally locked`);
        continue;
      }

      const breakdown = await getPrimaryEstimateBreakdown(jobId);
      if (!breakdown) {
        errors++;
        await sleep(400);
        continue;
      }

      const payload = {
        project_id: project.id,
        acculynx_job_id: jobId,
        acculynx_estimate_id: breakdown.estimateId,
        sections: breakdown.sections,
        last_synced_at: now,
      };

      try {
        const existing = breakdownByProjectId[project.id];
        if (existing) {
          // Preserve actual costs — only update budgeted values from AccuLynx
          const mergedSections = breakdown.sections.map(newSec => {
            const oldSec = (existing.sections || []).find(s => s.name.toLowerCase() === newSec.name.toLowerCase());
            if (!oldSec) return newSec;
            return {
              ...newSec,
              collapsed: oldSec.collapsed,
              items: newSec.items.map((newItem, idx) => ({
                ...newItem,
                actual: oldSec.items[idx] ? (oldSec.items[idx].actual || 0) : 0,
              })),
            };
          });
          await base44.asServiceRole.entities.JobCostBreakdown.update(existing.id, { ...payload, sections: mergedSections });
        } else {
          await base44.asServiceRole.entities.JobCostBreakdown.create(payload);
        }
        synced++;
        console.log(`Synced breakdown for project ${project.id} (job ${jobId})`);
      } catch (err) {
        console.error(`Failed to save breakdown for project ${project.id}: ${err.message}`);
        errors++;
      }

      await sleep(400);
    }

    console.log(`[acculynxSyncJobCosts] Done. Synced: ${synced}, errors: ${errors}`);
    return Response.json({
      message: `Synced job cost breakdowns for ${synced} projects${errors > 0 ? `, ${errors} errors` : ""}`,
      synced,
      errors,
    });
  } catch (error) {
    console.error("acculynxSyncJobCosts fatal error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});