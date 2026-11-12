// POST /api/assistant-upload
//
// The external assistant has no Supabase storage access. It calls this route
// with ASSISTANT_UPLOAD_TOKEN. The service role key stays on the server: it
// uploads into the public "Attachements" bucket and inserts one attachments
// row. Migration 064's origin and carry triggers run on that insert.
//
// This route does not update leads, clients, or projects, so the messaging
// triggers (email / SMS) do not run.

const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const BUCKET = 'Attachements';
// Clardy Construction. Assistant files are tagged to this organization.
const ORGANIZATION_ID = '2c9485d2-9b17-48d4-bea7-72770c1e9eb9';
const MAX_FILE_BYTES = 25 * 1024 * 1024;
// Base64 expands a file by about 4/3. Reject a request body before it gets larger.
const MAX_REQUEST_BYTES = 34 * 1024 * 1024;
const ENTITY_TABLES = { lead: 'leads', client: 'clients', project: 'projects' };
const CATEGORIES = new Set(['photo', 'permit', 'contract', 'proposal', 'invoice', 'misc', 'other']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// SHA-256 both sides so timingSafeEqual always compares equal-length digests.
// A wrong length, or a huge bearer value, cannot skip the comparison or make
// it shorter for the real secret.
function tokensMatch(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  if (!expected || !provided) return false;
  if (provided.length > 512 || expected.length > 512) return false;
  const a = crypto.createHash('sha256').update(provided, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

function bearerToken(header) {
  if (typeof header !== 'string') return '';
  const match = header.match(/^Bearer\s+(\S+)\s*$/i);
  return match ? match[1] : '';
}

function storagePath(filename) {
  const base = String(filename || '').split(/[/\\]/).pop() || '';
  const rawExt = base.includes('.') ? base.split('.').pop() : 'bin';
  const ext = String(rawExt).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
  const rand = crypto.randomBytes(8).toString('hex');
  return `uploads/${Date.now()}-${rand}.${ext}`;
}

function cleanFilename(filename) {
  const name = String(filename || '').split(/[/\\]/).pop().replace(/[\u0000-\u001f]/g, '').trim();
  if (!name || name.length > 180) throw httpError(400, 'filename is required and must be 180 characters or less.');
  return name;
}

function cleanCategory(category) {
  if (category == null || String(category).trim() === '') return 'other';
  const value = String(category).trim().toLowerCase();
  if (!CATEGORIES.has(value)) {
    throw httpError(400, `category must be one of: ${[...CATEGORIES].join(', ')}.`);
  }
  return value;
}

function requireUuid(value, label) {
  const id = String(value || '').trim();
  if (!UUID_RE.test(id)) throw httpError(400, `${label} must be a uuid.`);
  return id;
}

function isDriveUrl(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
  return host === 'drive.google.com'
    || host === 'docs.google.com'
    || host === 'drive.usercontent.google.com';
}

function isPrivateAddress(address) {
  const normalized = String(address).toLowerCase().split('%')[0];
  if (net.isIPv4(normalized)) {
    const [a, b] = normalized.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (net.isIPv6(normalized)) {
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80')) return true;
    const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true;
}

async function assertPublicUrl(raw, lookupFn) {
  let url;
  try { url = new URL(raw); } catch { throw httpError(400, 'source_url is not a valid URL.'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw httpError(400, 'source_url must be http or https.');
  if (url.username || url.password) throw httpError(400, 'source_url must not include credentials.');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host === 'metadata.google.internal') {
    throw httpError(400, 'source_url host is not allowed.');
  }
  let addresses = [];
  try {
    addresses = net.isIP(host) ? [host] : (await lookupFn(host, { all: true })).map((row) => row.address);
  } catch {
    throw httpError(400, 'source_url host is not allowed.');
  }
  if (!addresses.length || addresses.some(isPrivateAddress)) throw httpError(400, 'source_url host is not allowed.');
  return url;
}

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  return headers[name] || headers[name.toLowerCase()] || '';
}

async function readLimitedBody(response) {
  const declared = Number(headerValue(response.headers, 'content-length'));
  if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) throw httpError(413, 'File is larger than 25 MB.');
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length > MAX_FILE_BYTES) throw httpError(413, 'File is larger than 25 MB.');
    return buf;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_FILE_BYTES) {
      await reader.cancel().catch(() => {});
      throw httpError(413, 'File is larger than 25 MB.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function downloadSource(rawUrl, fetchImpl, lookupFn) {
  let current = rawUrl;
  for (let hop = 0; hop < 4; hop++) {
    const url = await assertPublicUrl(current, lookupFn);
    const response = await fetchImpl(url.toString(), {
      redirect: 'manual',
      headers: { Accept: '*/*' },
      signal: AbortSignal.timeout(30000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = headerValue(response.headers, 'location');
      if (!location) throw httpError(400, 'source_url redirect had no destination.');
      current = new URL(location, url).toString();
      continue;
    }
    if (!response.ok) throw httpError(400, `Could not download source_url (${response.status}).`);
    const responseType = headerValue(response.headers, 'content-type').split(';')[0].trim().toLowerCase();
    if (responseType === 'text/html' || responseType === 'application/xhtml+xml') {
      throw httpError(400, 'source_url returned a web page, not a file. Use a direct download link.');
    }
    const buffer = await readLimitedBody(response);
    return { buffer, responseType };
  }
  throw httpError(400, 'source_url redirected too many times.');
}

function decodeBase64(value) {
  const raw = String(value || '').trim().replace(/^data:[^,]+,/, '');
  if (!raw) throw httpError(400, 'file_base64 is empty.');
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer.length) throw httpError(400, 'file_base64 is empty.');
  if (buffer.length > MAX_FILE_BYTES) throw httpError(413, 'File is larger than 25 MB.');
  return buffer;
}

function field(fields, name) {
  const value = fields?.[name];
  return Array.isArray(value) ? value[0] : value;
}

async function readMultipart(req) {
  const length = Number(req.headers['content-length']);
  if (Number.isFinite(length) && length > MAX_REQUEST_BYTES) throw httpError(413, 'Request is larger than 25 MB.');
  const { IncomingForm } = await import('formidable');
  const fs = require('fs');
  const form = new IncomingForm({ maxFileSize: MAX_FILE_BYTES, maxFieldsSize: 1024 * 1024, multiples: false });
  let parsed;
  try {
    parsed = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })));
    });
  } catch (err) {
    if (err.httpCode === 413 || /maxFileSize|maxTotalFileSize/i.test(err.message || '')) {
      throw httpError(413, 'File is larger than 25 MB.');
    }
    throw httpError(400, 'Could not read the uploaded file.');
  }
  const file = Array.isArray(parsed.files.file) ? parsed.files.file[0] : parsed.files.file;
  if (!file) throw httpError(400, 'Attach the file in the "file" field.');
  const buffer = fs.readFileSync(file.filepath);
  if (buffer.length > MAX_FILE_BYTES) throw httpError(413, 'File is larger than 25 MB.');
  return {
    buffer,
    filename: field(parsed.fields, 'filename') || file.originalFilename,
    fileType: field(parsed.fields, 'file_type') || file.mimetype,
    entityType: field(parsed.fields, 'entity_type'),
    entityId: field(parsed.fields, 'entity_id'),
    category: field(parsed.fields, 'category'),
    replaceAttachmentId: field(parsed.fields, 'replace_attachment_id'),
  };
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_REQUEST_BYTES) {
        reject(httpError(413, 'Request is larger than 25 MB.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const length = Number(req.headers['content-length'] || req.headers['Content-Length']);
  if (Number.isFinite(length) && length > MAX_REQUEST_BYTES) throw httpError(413, 'Request is larger than 25 MB.');
  let body = req.body;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { throw httpError(400, 'Request body is not valid JSON.'); }
  }
  if (body == null) {
    const raw = await readRaw(req);
    if (!raw.length) throw httpError(400, 'Request body is empty.');
    try { body = JSON.parse(raw.toString('utf8')); } catch { throw httpError(400, 'Request body is not valid JSON.'); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Request body must be a JSON object.');
  const sources = [body.file_base64, body.source_url].filter((value) => value != null && String(value).trim() !== '');
  if (sources.length !== 1) throw httpError(400, 'Send exactly one of file_base64 or source_url.');
  let buffer;
  let responseType = '';
  if (body.file_base64 != null && String(body.file_base64).trim() !== '') {
    buffer = decodeBase64(body.file_base64);
  }
  return { body, buffer, responseType, needsDownload: body.source_url != null && String(body.source_url).trim() !== '' };
}

function serviceHeaders(serviceKey, extra = {}) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    ...extra,
  };
}

async function restJson(fetchImpl, serviceKey, path, options = {}) {
  const response = await fetchImpl(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: serviceHeaders(serviceKey, { 'Content-Type': 'application/json', ...(options.headers || {}) }),
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!response.ok) {
    const detail = data?.message || data?.error || response.statusText;
    const err = httpError(502, `Database request failed: ${detail}`);
    err.detail = detail;
    throw err;
  }
  return data;
}

async function entityExists(fetchImpl, serviceKey, entityType, entityId) {
  const table = ENTITY_TABLES[entityType];
  const rows = await restJson(fetchImpl, serviceKey, `${table}?id=eq.${entityId}&select=id&limit=1`);
  if (!Array.isArray(rows) || !rows[0]) throw httpError(404, `No ${entityType} with that id.`);
}

async function uploadObject(fetchImpl, serviceKey, path, buffer, mime) {
  const response = await fetchImpl(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: serviceHeaders(serviceKey, {
      'Content-Type': mime,
      'Cache-Control': '3600',
      'x-upsert': 'false',
    }),
    body: buffer,
  });
  if (!response.ok) {
    const detail = await response.text();
    const err = httpError(502, 'Storage upload failed.');
    err.detail = detail;
    throw err;
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function deleteObject(fetchImpl, serviceKey, path) {
  await fetchImpl(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'DELETE',
    headers: serviceHeaders(serviceKey),
  }).catch(() => {});
}

function mimeOf(fileType, responseType) {
  const value = String(fileType || responseType || 'application/octet-stream').split(';')[0].trim().toLowerCase();
  return value || 'application/octet-stream';
}

async function handleAssistantUpload(req, res, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const lookupFn = deps.lookup || ((host, opts) => dns.lookup(host, opts));
  const token = deps.token !== undefined ? deps.token : process.env.ASSISTANT_UPLOAD_TOKEN;
  const serviceKey = deps.serviceKey !== undefined ? deps.serviceKey : process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    if (!token || !serviceKey) throw httpError(500, 'Assistant upload is not configured.');
    const presented = bearerToken(req.headers?.authorization || req.headers?.Authorization);
    if (!tokensMatch(presented, token)) throw httpError(401, 'Unauthorized');
    if (req.method !== 'POST') throw httpError(405, 'Method not allowed');

    const contentType = String(req.headers?.['content-type'] || '');
    let input;
    if (contentType.includes('multipart/form-data')) {
      input = await readMultipart(req);
    } else if (contentType.includes('application/json') || req.body != null) {
      const parsed = await readJson(req);
      input = {
        buffer: parsed.buffer,
        filename: parsed.body.filename,
        fileType: parsed.body.file_type,
        entityType: parsed.body.entity_type,
        entityId: parsed.body.entity_id,
        category: parsed.body.category,
        replaceAttachmentId: parsed.body.replace_attachment_id,
        responseType: parsed.responseType,
      };
      if (parsed.needsDownload) {
        const downloaded = await downloadSource(parsed.body.source_url, fetchImpl, lookupFn);
        input.buffer = downloaded.buffer;
        input.responseType = downloaded.responseType;
      }
    } else {
      throw httpError(415, 'Send multipart/form-data or application/json.');
    }

    const entityType = String(input.entityType || '').trim().toLowerCase();
    if (!ENTITY_TABLES[entityType]) throw httpError(400, 'entity_type must be lead, client, or project.');
    const entityId = requireUuid(input.entityId, 'entity_id');
    const filename = cleanFilename(input.filename);
    const category = cleanCategory(input.category);
    const mime = mimeOf(input.fileType, input.responseType);
    if (!input.buffer || !input.buffer.length) throw httpError(400, 'The file is empty.');
    if (input.buffer.length > MAX_FILE_BYTES) throw httpError(413, 'File is larger than 25 MB.');

    await entityExists(fetchImpl, serviceKey, entityType, entityId);

    let existing = null;
    if (input.replaceAttachmentId != null && String(input.replaceAttachmentId).trim() !== '') {
      const replaceId = requireUuid(input.replaceAttachmentId, 'replace_attachment_id');
      const rows = await restJson(fetchImpl, serviceKey, `attachments?id=eq.${replaceId}&select=id,url,entity_type,entity_id,filename,category,organization_id&limit=1`);
      existing = Array.isArray(rows) ? rows[0] : null;
      if (!existing) throw httpError(404, 'No attachment with that id.');
      if (!isDriveUrl(existing.url)) {
        throw httpError(400, 'replace_attachment_id only updates a row whose url is a Google Drive or Docs link. Upload a new file instead.');
      }
      if (String(existing.entity_type || '').toLowerCase() !== entityType || existing.entity_id !== entityId) {
        throw httpError(409, `That file is on ${existing.entity_type} ${existing.entity_id}. Pass those ids to replace it.`);
      }
    }

    const path = storagePath(filename);
    let publicUrl;
    try {
      publicUrl = await uploadObject(fetchImpl, serviceKey, path, input.buffer, mime);
    } catch (err) {
      console.error('Assistant storage upload failed:', err.detail || err.message);
      throw err;
    }

    let savedId = existing?.id || null;
    try {
      if (existing) {
        const patch = { url: publicUrl, file_type: mime, file_size: input.buffer.length, filename };
        if (input.category != null && String(input.category).trim() !== '') patch.category = category;
        if (!existing.organization_id) patch.organization_id = ORGANIZATION_ID;
        await restJson(fetchImpl, serviceKey, `attachments?id=eq.${existing.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(patch),
        });
      } else {
        const created = await restJson(fetchImpl, serviceKey, 'attachments', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            entity_type: entityType,
            entity_id: entityId,
            filename,
            url: publicUrl,
            file_type: mime,
            file_size: input.buffer.length,
            uploaded_by: 'Assistant',
            category,
            organization_id: ORGANIZATION_ID,
          }),
        });
        savedId = Array.isArray(created) ? created[0]?.id : null;
      }
    } catch (err) {
      await deleteObject(fetchImpl, serviceKey, path);
      console.error('Assistant attachment save failed:', err.detail || err.message);
      throw httpError(502, 'Could not save the attachment.');
    }

    // Re-read after insert. The carry trigger may have moved the row onto a
    // project, and INSERT RETURNING does not include that AFTER trigger update.
    const rows = savedId
      ? await restJson(fetchImpl, serviceKey, `attachments?id=eq.${savedId}&select=id,url,filename,entity_type,entity_id,category,file_type,file_size&limit=1`)
      : [];
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.id) throw httpError(502, 'The file uploaded but the attachment row could not be read back.');

    res.status(200).json({
      id: row.id,
      url: row.url || publicUrl,
      filename: row.filename || filename,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      category: row.category || category,
      file_type: row.file_type || mime,
      file_size: row.file_size || input.buffer.length,
      replaced: Boolean(existing),
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('Assistant upload error:', err.detail || err.message);
    if (!res.headersSent && !res.writableEnded) {
      res.status(status).json({ error: err.status ? err.message : 'Upload failed.' });
    }
  }
}

module.exports = {
  handleAssistantUpload,
  tokensMatch,
  bearerToken,
  storagePath,
  isDriveUrl,
  isPrivateAddress,
  ORGANIZATION_ID,
  BUCKET,
  MAX_FILE_BYTES,
};
