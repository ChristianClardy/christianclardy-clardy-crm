const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { once } = require('events');
const {
  handleAssistantUpload,
  tokensMatch,
  storagePath,
  isDriveUrl,
  isPrivateAddress,
  ORGANIZATION_ID,
} = require('./assistantUpload.js');

const TOKEN = 'assistant-test-token';
const SERVICE = 'service-role-test';
const LEAD = '11111111-1111-1111-1111-111111111111';
const FILE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function mockRes() {
  return {
    statusCode: 0,
    body: null,
    headersSent: false,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

function headers(extra = {}) {
  return { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, ...extra };
}

function jsonResponse(status, body, headerMap = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headerMap[String(name).toLowerCase()] || null },
    text: async () => text,
  };
}

function fileResponse(bytes, headerMap = { 'content-type': 'application/pdf' }) {
  const data = Buffer.from(bytes);
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => headerMap[String(name).toLowerCase()] || null },
    body: {
      getReader() {
        let sent = false;
        return {
          async read() {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: data };
          },
          async cancel() {},
        };
      },
    },
    text: async () => '',
  };
}

// Supabase stand-in. Records every call and never touches the network.
function backend(options = {}) {
  const calls = [];
  const state = { inserted: null, patched: null };
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || 'GET';
    const target = String(url);
    calls.push({ url: target, method, body: init.body, headers: init.headers });
    if (target.includes('/messages') || target.includes('resend') || target.includes('twilio')) {
      throw new Error(`Unexpected outbound message call: ${target}`);
    }
    if (target.includes('/storage/v1/object/Attachements/') && method === 'POST') return jsonResponse(200, { Key: 'ok' });
    if (target.includes('/storage/v1/object/Attachements/') && method === 'DELETE') return jsonResponse(200, '');
    if (target.includes('/rest/v1/leads')) return jsonResponse(200, options.missingLead ? [] : [{ id: LEAD }]);
    if (target.includes('/rest/v1/clients') || target.includes('/rest/v1/projects')) return jsonResponse(200, [{ id: LEAD }]);
    if (target.includes('/rest/v1/attachments') && method === 'POST') {
      state.inserted = JSON.parse(init.body);
      return jsonResponse(201, [{ id: FILE, ...state.inserted }]);
    }
    if (target.includes('/rest/v1/attachments') && method === 'PATCH') {
      state.patched = JSON.parse(init.body);
      return jsonResponse(200, [{ id: FILE }]);
    }
    if (target.includes('/rest/v1/attachments') && target.includes('organization_id')) {
      return jsonResponse(200, options.driveRow ? [options.driveRow] : []);
    }
    if (target.includes('/rest/v1/attachments') && method === 'GET') {
      const moved = options.carried || {};
      return jsonResponse(200, [{
        id: FILE,
        url: state.patched?.url || state.inserted?.url,
        filename: state.patched?.filename || state.inserted?.filename || 'Proposal.pdf',
        entity_type: moved.entity_type || state.inserted?.entity_type || 'lead',
        entity_id: moved.entity_id || state.inserted?.entity_id || LEAD,
        category: state.patched?.category || state.inserted?.category || 'other',
        file_type: state.patched?.file_type || state.inserted?.file_type,
        file_size: state.patched?.file_size || state.inserted?.file_size,
      }]);
    }
    if (!target.includes('supabase.co')) {
      return options.download || fileResponse('%PDF-1.4 proposal');
    }
    throw new Error(`Unexpected fetch ${method} ${target}`);
  };
  return { fetchImpl, calls, state };
}

async function postJson(body, extra = {}) {
  const res = mockRes();
  const deps = extra.deps || backend();
  await handleAssistantUpload({
    method: 'POST',
    headers: headers(extra.headers),
    body,
  }, res, {
    token: TOKEN,
    serviceKey: SERVICE,
    fetch: deps.fetchImpl,
    lookup: extra.lookup || (async () => [{ address: '8.8.8.8' }]),
  });
  return { res, deps };
}

test('token comparison is equal only for the same secret', () => {
  assert.equal(tokensMatch(TOKEN, TOKEN), true);
  assert.equal(tokensMatch(TOKEN, TOKEN + 'x'), false);
  assert.equal(tokensMatch('short', TOKEN), false);
  assert.equal(tokensMatch('', TOKEN), false);
  assert.equal(tokensMatch(TOKEN, ''), false);
  assert.match(storagePath('Proposal.PDF'), /^uploads\/\d+-[0-9a-f]{16}\.pdf$/);
  assert.equal(isDriveUrl('https://drive.google.com/file/d/abc/view'), true);
  assert.equal(isDriveUrl('https://docs.google.com/document/d/abc/edit'), true);
  assert.equal(isDriveUrl('https://fneasddxtejasvsojgcu.supabase.co/storage/v1/object/public/Attachements/uploads/a.pdf'), false);
  assert.equal(isPrivateAddress('127.0.0.1'), true);
  assert.equal(isPrivateAddress('10.1.2.3'), true);
  assert.equal(isPrivateAddress('169.254.169.254'), true);
  assert.equal(isPrivateAddress('8.8.8.8'), false);
  assert.equal(isPrivateAddress('::1'), true);
});

test('rejects anything except the assistant bearer token', async () => {
  const cases = [
    { authorization: '' },
    { authorization: 'Bearer wrong-token' },
    { authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.user-session' },
    { authorization: 'Basic ' + TOKEN },
  ];
  for (const headers of cases) {
    const res = mockRes();
    let called = false;
    await handleAssistantUpload({
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: {},
    }, res, { token: TOKEN, serviceKey: SERVICE, fetch: async () => { called = true; } });
    assert.equal(res.statusCode, 401);
    assert.equal(called, false);
  }
});

test('reports missing configuration without accepting a token', async () => {
  const res = mockRes();
  await handleAssistantUpload({
    method: 'POST',
    headers: headers(),
    body: {},
  }, res, { token: '', serviceKey: SERVICE, fetch: async () => { throw new Error('should not fetch'); } });
  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /not configured/);
});

test('files a base64 proposal on a lead and tags the Clardy organization', async () => {
  const { res, deps } = await postJson({
    entity_type: 'Lead',
    entity_id: LEAD,
    filename: 'Proposal - Hale Patio.pdf',
    category: 'proposal',
    file_type: 'application/pdf',
    file_base64: Buffer.from('%PDF-1.4 proposal').toString('base64'),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, FILE);
  assert.equal(res.body.entity_type, 'lead');
  assert.equal(res.body.replaced, false);
  assert.match(res.body.url, /\/storage\/v1\/object\/public\/Attachements\/uploads\/\d+-[0-9a-f]{16}\.pdf$/);
  const insert = deps.state.inserted;
  assert.equal(insert.organization_id, ORGANIZATION_ID);
  assert.equal(insert.entity_type, 'lead');
  assert.equal(insert.entity_id, LEAD);
  assert.equal(insert.category, 'proposal');
  assert.equal(insert.uploaded_by, 'Assistant');
  assert.equal(insert.file_type, 'application/pdf');
  assert.equal(insert.file_size, Buffer.from('%PDF-1.4 proposal').length);
  assert.equal(deps.calls.some((call) => /messages|resend|twilio/i.test(call.url)), false);
});

test('returns the project the carry trigger moved the file onto', async () => {
  const projectId = '33333333-3333-3333-3333-333333333333';
  const { res } = await postJson({
    entity_type: 'lead',
    entity_id: LEAD,
    filename: 'Invoice.pdf',
    file_base64: Buffer.from('invoice').toString('base64'),
  }, { deps: backend({ carried: { entity_type: 'project', entity_id: projectId } }) });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.entity_type, 'project');
  assert.equal(res.body.entity_id, projectId);
  assert.equal(res.body.category, 'other');
});

test('downloads a public source url up to the size limit', async () => {
  const { res, deps } = await postJson({
    entity_type: 'client',
    entity_id: LEAD,
    filename: 'Signed.pdf',
    category: 'contract',
    source_url: 'https://files.example/signed.pdf',
  });
  assert.equal(res.statusCode, 200);
  assert.equal(deps.state.inserted.file_type, 'application/pdf');
  assert.ok(deps.calls.some((call) => call.url === 'https://files.example/signed.pdf'));
});

test('refuses a source url that points at a private or metadata address', async () => {
  const direct = await postJson({
    entity_type: 'lead',
    entity_id: LEAD,
    filename: 'x.pdf',
    source_url: 'http://169.254.169.254/latest/meta-data',
  });
  assert.equal(direct.res.statusCode, 400);
  assert.equal(direct.deps.calls.length, 0);

  const rebound = await postJson({
    entity_type: 'lead',
    entity_id: LEAD,
    filename: 'x.pdf',
    source_url: 'https://files.example/secret.pdf',
  }, { lookup: async () => [{ address: '127.0.0.1' }] });
  assert.equal(rebound.res.statusCode, 400);
  assert.equal(rebound.deps.calls.length, 0);
});

test('refuses a source url that returns a web page', async () => {
  const { res } = await postJson({
    entity_type: 'lead',
    entity_id: LEAD,
    filename: 'Proposal.pdf',
    source_url: 'https://drive.google.com/file/d/abc/view',
  }, {
    lookup: async () => [{ address: '8.8.8.8' }],
    deps: backend({
      download: jsonResponse(200, '<html>sign in</html>', { 'content-type': 'text/html; charset=utf-8' }),
    }),
  });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /web page/);
});

test('does not upload when the lead does not exist', async () => {
  const { res, deps } = await postJson({
    entity_type: 'lead',
    entity_id: LEAD,
    filename: 'a.pdf',
    file_base64: Buffer.from('abc').toString('base64'),
  }, { deps: backend({ missingLead: true }) });
  assert.equal(res.statusCode, 404);
  assert.equal(deps.calls.some((call) => call.url.includes('/storage/')), false);
});

test('rejects an oversized file and a request with two file sources', async () => {
  const big = Buffer.alloc(25 * 1024 * 1024 + 1, 1).toString('base64');
  const over = await postJson({
    entity_type: 'project',
    entity_id: LEAD,
    filename: 'big.pdf',
    file_base64: big,
  });
  assert.equal(over.res.statusCode, 413);
  assert.equal(over.deps.calls.length, 0);

  const both = await postJson({
    entity_type: 'lead',
    entity_id: LEAD,
    filename: 'a.pdf',
    file_base64: Buffer.from('a').toString('base64'),
    source_url: 'https://files.example/a.pdf',
  });
  assert.equal(both.res.statusCode, 400);
});

test('replaces a Drive link in place and refuses to replace a stored file', async () => {
  const drive = await postJson({
    entity_type: 'lead',
    entity_id: LEAD,
    filename: 'Proposal.pdf',
    category: 'proposal',
    replace_attachment_id: FILE,
    file_base64: Buffer.from('real pdf').toString('base64'),
  }, {
    deps: backend({
      driveRow: {
        id: FILE,
        url: 'https://drive.google.com/file/d/abc/view',
        entity_type: 'lead',
        entity_id: LEAD,
        filename: 'Drive link',
        category: 'other',
        organization_id: null,
      },
    }),
  });
  assert.equal(drive.res.statusCode, 200);
  assert.equal(drive.res.body.replaced, true);
  assert.equal(drive.res.body.id, FILE);
  assert.equal(drive.deps.state.patched.organization_id, ORGANIZATION_ID);
  assert.equal(drive.deps.state.patched.category, 'proposal');
  assert.match(drive.deps.state.patched.url, /Attachements\/uploads\//);
  assert.equal(drive.deps.state.inserted, null);

  const stored = await postJson({
    entity_type: 'lead',
    entity_id: LEAD,
    filename: 'Proposal.pdf',
    replace_attachment_id: FILE,
    file_base64: Buffer.from('real pdf').toString('base64'),
  }, {
    deps: backend({
      driveRow: {
        id: FILE,
        url: 'https://fneasddxtejasvsojgcu.supabase.co/storage/v1/object/public/Attachements/uploads/old.pdf',
        entity_type: 'lead',
        entity_id: LEAD,
        organization_id: ORGANIZATION_ID,
      },
    }),
  });
  assert.equal(stored.res.statusCode, 400);
  assert.equal(stored.deps.calls.some((call) => call.url.includes('/storage/')), false);
});

test('accepts a multipart upload with the same storage path and attachment row', async () => {
  const deps = backend();
  const server = http.createServer((req, res) => {
    res.status = (code) => { res.statusCode = code; return res; };
    const send = res.json;
    res.json = (body) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
      return res;
    };
    if (!send) { /* json above is enough */ }
    return handleAssistantUpload(req, res, {
      token: TOKEN,
      serviceKey: SERVICE,
      fetch: deps.fetchImpl,
      lookup: async () => [{ address: '8.8.8.8' }],
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const port = server.address().port;
    const form = new FormData();
    form.set('entity_type', 'project');
    form.set('entity_id', LEAD);
    form.set('filename', 'Site photo.jpg');
    form.set('category', 'photo');
    form.set('file', new Blob([Buffer.from('jpeg-bytes')], { type: 'image/jpeg' }), 'Site photo.jpg');
    const response = await fetch(`http://127.0.0.1:${port}/api/assistant-upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: form,
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.category, 'photo');
    assert.equal(deps.state.inserted.entity_type, 'project');
    assert.equal(deps.state.inserted.file_type, 'image/jpeg');
    assert.match(deps.state.inserted.url, /\/uploads\/\d+-[0-9a-f]{16}\.jpg$/);
  } finally {
    server.close();
  }
});
