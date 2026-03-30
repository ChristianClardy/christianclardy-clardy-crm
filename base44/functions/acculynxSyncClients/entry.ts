import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ACCULYNX_API = "https://api.acculynx.com/api/v2";
const API_KEY = Deno.env.get("ACCULYNX_API_KEY");

const PAGE_SIZE = 25;      // AccuLynx page size
const MAX_PAGES = 3;       // max 75 contacts per run — keeps well under timeout
const WRITE_DELAY_MS = 100; // delay between Base44 writes to avoid rate limit

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function acculynxGet(path) {
  const res = await fetch(`${ACCULYNX_API}${path}`, {
    headers: { accept: "application/json", Authorization: `Bearer ${API_KEY}` },
    signal: AbortSignal.timeout(10000), // 10s per request
  });
  if (!res.ok) throw new Error(`AccuLynx error ${res.status}: ${await res.text()}`);
  return res.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Read start page from request body (pagination across runs)
    let startPage = 1;
    try {
      const body = await req.json();
      if (body?.page) startPage = parseInt(body.page) || 1;
    } catch {
      // no body — start from page 1
    }

    // Fetch contacts page by page, up to MAX_PAGES per run
    let contacts = [];
    let lastPage = startPage;
    let hasMore = false;

    for (let page = startPage; page < startPage + MAX_PAGES; page++) {
      lastPage = page;
      let batch = [];
      try {
        const contactsRes = await acculynxGet(`/contacts?pageSize=${PAGE_SIZE}&page=${page}`);
        batch = contactsRes.data || contactsRes.items || (Array.isArray(contactsRes) ? contactsRes : []);
      } catch (err) {
        console.error(`Failed to fetch page ${page}: ${err.message}`);
        // Stop fetching but still process what we have
        hasMore = contacts.length > 0;
        break;
      }

      if (!batch.length) { hasMore = false; break; }
      contacts = contacts.concat(batch);
      if (batch.length < PAGE_SIZE) { hasMore = false; break; }
      hasMore = true;

      // Small delay between AccuLynx page fetches
      await sleep(500);
    }

    if (contacts.length === 0) {
      return Response.json({ message: "No contacts found or sync complete", synced: 0 });
    }

    // Load existing clients keyed by acculynx_contact_id
    const existingClients = await base44.asServiceRole.entities.Client.list();
    const clientByAccuId = {};
    const clientByName = {};
    for (const c of existingClients) {
      if (c.acculynx_contact_id) clientByAccuId[c.acculynx_contact_id] = c;
      if (c.name) clientByName[c.name.toLowerCase()] = c;
    }

    let synced = 0;
    let errors = 0;
    let skippedLocked = 0;

    for (const contact of contacts) {
      const contactId = contact.id || contact.contactId;
      const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.name || contact.companyName;
      if (!name) continue;

      const email = contact.emailAddresses?.[0]?.address || contact.email || "";
      const phone = contact.phoneNumbers?.[0]?.number || contact.phone || "";
      const address = [contact.address?.street, contact.address?.city, contact.address?.state, contact.address?.zip]
        .filter(Boolean).join(", ");
      const company = contact.companyName || "";

      const basePayload = {
        name,
        company,
        email,
        phone,
        address,
        acculynx_contact_id: contactId,
      };

      try {
        if (clientByAccuId[contactId]) {
          const existing = clientByAccuId[contactId];
          if (existing.sync_locked) {
            skippedLocked++;
            continue;
          }
          const payload = { ...basePayload, status: existing.status === "prospect" ? "prospect" : "active" };
          await base44.asServiceRole.entities.Client.update(existing.id, payload);
        } else if (clientByName[name.toLowerCase()]) {
          const existing = clientByName[name.toLowerCase()];
          if (existing.sync_locked) {
            skippedLocked++;
            continue;
          }
          const payload = { ...basePayload, status: existing.status === "prospect" ? "prospect" : "active" };
          await base44.asServiceRole.entities.Client.update(existing.id, payload);
          clientByAccuId[contactId] = existing;
        } else {
          const created = await base44.asServiceRole.entities.Client.create({ ...basePayload, status: "active" });
          clientByAccuId[contactId] = created;
        }
        synced++;
      } catch (err) {
        console.error(`Failed to sync contact ${name}: ${err.message}`);
        errors++;
      }

      // Throttle writes to avoid Base44 rate limit
      await sleep(WRITE_DELAY_MS);
    }

    const nextPage = hasMore ? lastPage + 1 : 1;
    return Response.json({
      message: `Synced ${synced} contacts (pages ${startPage}–${lastPage})${skippedLocked > 0 ? `, ${skippedLocked} locked skipped` : ""}${errors > 0 ? `, ${errors} errors` : ""}`,
      synced,
      skipped_locked: skippedLocked,
      errors,
      nextPage,
      hasMore,
    });
  } catch (error) {
    console.error("acculynxSyncClients fatal error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});