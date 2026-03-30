import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ACCULYNX_API = "https://api.acculynx.com/api/v2";
const API_KEY = Deno.env.get("ACCULYNX_API_KEY");
const DELAY_MS = 150;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function acculynxGet(path) {
  const res = await fetch(`${ACCULYNX_API}${path}`, {
    headers: { accept: "application/json", Authorization: `Bearer ${API_KEY}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`AccuLynx error ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Fetch full contact details including phone and email from AccuLynx sub-endpoints. */
async function getContactDetails(contactId) {
  try {
    const [contactRes, phoneRes, emailRes] = await Promise.all([
      fetch(`${ACCULYNX_API}/contacts/${contactId}`, {
        headers: { accept: "application/json", Authorization: `Bearer ${API_KEY}` },
        signal: AbortSignal.timeout(10000),
      }),
      fetch(`${ACCULYNX_API}/contacts/${contactId}/phone-numbers`, {
        headers: { accept: "application/json", Authorization: `Bearer ${API_KEY}` },
        signal: AbortSignal.timeout(10000),
      }),
      fetch(`${ACCULYNX_API}/contacts/${contactId}/email-addresses`, {
        headers: { accept: "application/json", Authorization: `Bearer ${API_KEY}` },
        signal: AbortSignal.timeout(10000),
      }),
    ]);

    const contact = contactRes.ok ? await contactRes.json() : {};
    const phones = phoneRes.ok ? await phoneRes.json() : {};
    const emails = emailRes.ok ? await emailRes.json() : {};

    const primaryPhone = (phones.items || []).find(p => p.primary) || (phones.items || [])[0];
    const primaryEmail = (emails.items || []).find(e => e.primary) || (emails.items || [])[0];

    const addr = contact.mailingAddress || contact.billingAddress || {};
    const address = [addr.street1, addr.city, addr.state?.abbreviation, addr.zipCode]
      .filter(Boolean).join(", ");

    const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.companyName || "";

    return {
      fullName,
      phone: primaryPhone?.number || "",
      email: primaryEmail?.address || "",
      address,
      company: contact.companyName || "",
    };
  } catch {
    return {};
  }
}

/** Fetch the financial totals for a job by looking at its estimates.
 *  Returns { contract_value, original_costs } using the primary estimate,
 *  or the estimate with the highest totalPrice as fallback. */
async function getJobFinancials(jobId) {
  try {
    const estList = await acculynxGet(`/jobs/${jobId}/estimates`);
    const items = estList.items || estList.data || (Array.isArray(estList) ? estList : []);
    if (!items.length) return {};

    // Fetch full detail for each estimate (they only return stubs in the list)
    const details = [];
    for (const stub of items) {
      try {
        const detail = await acculynxGet(`/estimates/${stub.id}`);
        details.push(detail);
      } catch {
        // skip if a single estimate fails
      }
      await sleep(100);
    }

    if (!details.length) return {};

    // Prefer the primary estimate; fall back to highest totalPrice
    let chosen = details.find(d => d.isPrimary);
    if (!chosen) {
      chosen = details.reduce((best, d) =>
        (d.financials?.totalPrice || 0) > (best.financials?.totalPrice || 0) ? d : best
      , details[0]);
    }

    const f = chosen.financials || {};
    return {
      contract_value: parseFloat(f.totalPrice) || 0,
      original_costs: parseFloat(f.totalCost) || 0,
    };
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Fetch all approved jobs from AccuLynx with pagination
    let jobs = [];
    let page = 1;
    while (true) {
      const jobsRes = await acculynxGet(`/jobs?milestones=approved&pageSize=25&page=${page}`);
      const batch = jobsRes.data || jobsRes.items || (Array.isArray(jobsRes) ? jobsRes : []);
      if (!batch.length) break;
      jobs = jobs.concat(batch);
      if (batch.length < 25) break;
      page++;
      await sleep(DELAY_MS);
    }

    if (jobs.length === 0) {
      return Response.json({ message: "No approved jobs found", synced: 0 });
    }

    // Load existing projects keyed by acculynx_job_id
    const existingProjects = await base44.asServiceRole.entities.Project.list();
    const projectByAccuId = {};
    for (const p of existingProjects) {
      if (p.acculynx_job_id) projectByAccuId[p.acculynx_job_id] = p;
    }

    // Load existing clients keyed by name
    const existingClients = await base44.asServiceRole.entities.Client.list();
    const clientByName = {};
    const clientByAccuId = {};
    for (const c of existingClients) {
      if (c.name) clientByName[c.name.toLowerCase()] = c;
      if (c.acculynx_contact_id) clientByAccuId[c.acculynx_contact_id] = c;
    }

    let synced = 0;
    let skippedLocked = 0;

    for (const job of jobs) {
      const jobId = job.id || job.jobId;
      const jobName = job.jobName || job.name || `AccuLynx Job ${jobId}`;

      // Primary contact name
      const primaryContact = job.contacts?.find(c => c.isPrimary) || job.contacts?.[0];
      const primaryContactAccuId = primaryContact?.contact?.id;
      const address = [
        job.locationAddress?.street1,
        job.locationAddress?.city,
        job.locationAddress?.state?.abbreviation,
        job.locationAddress?.zipCode,
      ].filter(Boolean).join(", ");

      const projectManager = job.assignedRepresentative?.name || job.assignedTo || "";
      const startDate = job.startDate ? job.startDate.split("T")[0] : null;
      const endDate = job.completionDate ? job.completionDate.split("T")[0] : null;

      // Resolve client — fetch full contact details and upsert
      let clientId = null;
      if (primaryContactAccuId) {
        const contactDetails = await getContactDetails(primaryContactAccuId);
        await sleep(100);
        const contactName = contactDetails.fullName || job.jobName?.split(":")?.[1]?.trim() || job.jobName || "";

        const clientPayload = {
          name: contactName || job.jobName,
          phone: contactDetails.phone || "",
          email: contactDetails.email || "",
          address: contactDetails.address || address,
          company: contactDetails.company || "",
          status: "active",
          acculynx_contact_id: primaryContactAccuId,
        };

        if (clientByAccuId[primaryContactAccuId]) {
          if (!clientByAccuId[primaryContactAccuId].sync_locked) {
            await base44.asServiceRole.entities.Client.update(clientByAccuId[primaryContactAccuId].id, clientPayload);
          } else {
            skippedLocked++;
          }
          clientId = clientByAccuId[primaryContactAccuId].id;
        } else {
          const created = await base44.asServiceRole.entities.Client.create(clientPayload);
          clientByAccuId[primaryContactAccuId] = created;
          clientId = created.id;
        }
        await sleep(DELAY_MS);
      }

      // Fetch financial data from estimates
      const financials = await getJobFinancials(jobId);

      const projectPayload = {
        name: jobName,
        client_id: clientId || "",
        address: address,
        contract_value: financials.contract_value || 0,
        original_costs: financials.original_costs || 0,
        project_manager: projectManager,
        status: "in_progress",
        start_date: startDate,
        end_date: endDate,
        acculynx_job_id: jobId,
      };

      if (projectByAccuId[jobId]) {
        if (projectByAccuId[jobId].sync_locked) {
          skippedLocked++;
          await sleep(DELAY_MS);
          continue;
        } else {
          await base44.asServiceRole.entities.Project.update(projectByAccuId[jobId].id, projectPayload);
        }
      } else {
        const created = await base44.asServiceRole.entities.Project.create(projectPayload);
        projectByAccuId[jobId] = created;
      }

      synced++;
      await sleep(DELAY_MS);
    }

    return Response.json({ message: `Synced ${synced} approved jobs from AccuLynx`, synced, skipped_locked: skippedLocked });
  } catch (error) {
    console.error("acculynxSyncJobs error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});