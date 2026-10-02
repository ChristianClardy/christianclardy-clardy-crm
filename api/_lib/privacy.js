// "Delete personal data" (privacy requests): anonymizes a client or a
// subcontractor across the app while keeping the records the business must
// hold for legal and tax reasons (projects, estimates, contracts, invoices,
// payments, AP invoices, signed agreements). Server only: runs with the
// service role from api/invite.js?action=erase, staff callers only.
// Every run is recorded in data_erasure_log (053).

const { sbFetch, sbList, sbGetById, sbInsert } = require('./supabaseAdmin.js');

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const inList = (ids) => `in.(${ids.map((id) => `"${id}"`).join(',')})`;
const count = (rows) => (Array.isArray(rows) ? rows.length : 0);

async function patch(table, filter, values) {
  const rows = await sbFetch(`${table}?${filter}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(values) });
  return count(rows);
}
async function remove(table, filter) {
  const rows = await sbFetch(`${table}?${filter}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
  return count(rows);
}
// Tolerates a table/column that doesn't exist on this database.
async function safe(fn) {
  try { return await fn(); } catch (err) { return /does not exist|schema cache|Could not find/i.test(err.message) ? 0 : Promise.reject(err); }
}

// Portal logins are removed at the auth level; their portal rows go with them.
async function deleteLogins(table, column, value) {
  const logins = await safe(() => sbList(table, { select: 'user_id', filters: { [column]: `eq.${value}` } })) || [];
  let n = 0;
  for (const { user_id } of logins) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user_id}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok && res.status !== 404) throw new Error(`Could not delete a portal login: ${res.status}`);
    await safe(() => remove(table, `user_id=eq.${user_id}`));
    n++;
  }
  return n;
}

async function eraseClient(clientId, { by, reason }) {
  const client = await sbGetById('clients', clientId);
  if (!client) throw Object.assign(new Error('Client not found.'), { status: 404 });
  const label = `Deleted client ${clientId.slice(0, 6).toUpperCase()}`;

  const leadRows = await sbList('leads', { select: 'id', filters: { linked_contact_id: `eq.${clientId}` } });
  const leadIds = [...new Set([...leadRows.map((l) => l.id), client.linked_lead_id].filter(Boolean))];
  const s = {};

  s.client = await patch('clients', `id=eq.${clientId}`, {
    name: label, contact_person: null, email: null, phone: null, address: null, company: null,
    notes: null, follow_up_notes: null, tags: null,
  });
  if (leadIds.length) {
    s.leads = await patch('leads', `id=${inList(leadIds)}`, {
      full_name: 'Deleted person', email: null, phone: null, address: null, property_address: null,
      project_description: null, notes: null, next_action: null, lost_reason_notes: null,
    });
    s.follow_ups = await safe(() => remove('lead_follow_ups', `lead_id=${inList(leadIds)}`));
    s.crm_activities = await safe(() => remove('crm_activities', `lead_id=${inList(leadIds)}`));
    s.site_visit_notes = await safe(() => patch('site_visits', `lead_id=${inList(leadIds)}`, { notes: null }));
    s.deal_descriptions = await safe(() => patch('deals', `lead_id=${inList(leadIds)}`, { description: null }));
    s.lead_comments = await safe(() => remove('comments', `entity_type=in.(lead,Lead)&entity_id=${inList(leadIds)}`));
  }
  const historyFilter = leadIds.length ? `or=(linked_client_id.eq.${clientId},linked_lead_id.${inList(leadIds)})` : `linked_client_id=eq.${clientId}`;
  s.contact_history = await safe(() => remove('contact_history', historyFilter));
  // Appointments: ones tied to a project stay (with the personal details
  // blanked) as part of the job record; the rest are removed.
  const eventFilter = leadIds.length ? `or=(linked_client_id.eq.${clientId},lead_id.${inList(leadIds)})` : `linked_client_id=eq.${clientId}`;
  s.appointments_removed = await safe(() => remove('calendar_events', `${eventFilter}&project_id=is.null&linked_project_id=is.null`));
  s.appointments_blanked = await safe(() => patch('calendar_events', eventFilter, { location: null, description: null }));
  s.client_comments = await safe(() => remove('comments', `entity_type=in.(client,Client)&entity_id=eq.${clientId}`));
  s.todo_notes = await safe(() => patch('todo_items', `linked_client_id=eq.${clientId}`, { notes: null }));
  s.portal_logins = await deleteLogins('customer_portal_users', 'client_id', clientId);

  await sbInsert('data_erasure_log', { entity_type: 'client', entity_id: clientId, label, requested_by: by, reason: reason || null, summary: s });
  return { label, summary: s };
}

async function eraseSubcontractor(subId, { by, reason }) {
  const sub = await sbGetById('subcontractors', subId);
  if (!sub) throw Object.assign(new Error('Subcontractor not found.'), { status: 404 });
  const s = {};
  // The company name stays (it's on AP invoices and signed agreements); the
  // people and contact details go.
  s.subcontractor = await patch('subcontractors', `id=eq.${subId}`, {
    contact_person: null, email: null, phone: null, address: null, notes: null,
    license_number: null, coi_url: null, status: 'inactive',
  });
  s.portal_logins = await deleteLogins('subcontractor_portal_users', 'subcontractor_id', subId);
  s.comments = await safe(() => remove('comments', `entity_type=in.(subcontractor,Subcontractor)&entity_id=eq.${subId}`));

  await sbInsert('data_erasure_log', { entity_type: 'subcontractor', entity_id: subId, label: sub.name, requested_by: by, reason: reason || null, summary: s });
  return { label: sub.name, summary: s };
}

module.exports = { eraseClient, eraseSubcontractor };
