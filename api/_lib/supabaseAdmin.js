// Shared Supabase REST helper for api/ serverless functions — same
// fetch-based pattern api/docusign-send.js already uses (service-role key,
// direct PostgREST calls), factored out so the MCP tool handlers stay short.

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sbFetch(path, options = {}) {
  if (!SERVICE_KEY) throw new Error('Server misconfiguration: missing SUPABASE_SERVICE_ROLE_KEY.');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = data?.message || data?.error || res.statusText;
    throw new Error(`Supabase ${options.method || 'GET'} ${path} failed: ${message}`);
  }
  return data;
}

// filters: { column: "eq.value" } — pass PostgREST operator syntax directly
// (eq., ilike., gte., etc.) so callers keep full control per-column.
async function sbList(table, { select = '*', filters = {}, order, limit } = {}) {
  const params = new URLSearchParams();
  params.set('select', select);
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, value);
  }
  if (order) params.set('order', order);
  if (limit) params.set('limit', String(limit));
  return sbFetch(`${table}?${params.toString()}`);
}

async function sbGetById(table, id, select = '*') {
  const rows = await sbList(table, { select, filters: { id: `eq.${id}` }, limit: 1 });
  return rows[0] || null;
}

async function sbInsert(table, data) {
  const rows = await sbFetch(table, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(data),
  });
  return rows[0];
}

async function sbUpdate(table, id, data) {
  const rows = await sbFetch(`${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(data),
  });
  return rows[0];
}

module.exports = { sbFetch, sbList, sbGetById, sbInsert, sbUpdate };
