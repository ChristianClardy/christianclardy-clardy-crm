// In-app Grok assistant (POST /api/mcp/assistant, src/components/assistant/
// GrokAssistant.jsx). Grok (xAI Responses API) gets the exact tool set the
// Claude connector has (api/_lib/crmTools.js), reached through an in-memory
// MCP client, so anything added there shows up here too.
//
// Reads run straight away. Anything that creates or changes a record is held:
// the browser gets the pending calls back, shows them to the user, and posts
// their approve/decline decisions; only then do they run. A view-only login
// gets read tools only.
//
// The conversation lives at xAI (previous_response_id chains each turn onto
// the last), so nothing is stored here. Needs XAI_API_KEY (or GROK) in Vercel's env
// vars (never VITE_-prefixed); XAI_MODEL overrides the model. This is the one
// paid-API feature in the app — every message costs xAI credits.

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { buildServer } = require('./crmTools.js');
const { getStaffCaller, READ_ONLY_MESSAGE } = require('./staffAuth.js');
const { sbGetById, bindUserJwt } = require('./supabaseAdmin.js');
const BRIEFING = require('./clardyBriefing.js');

const XAI_URL = 'https://api.x.ai/v1/responses';
// GROK is the name the key was first saved under in Vercel.
const XAI_API_KEY = process.env.XAI_API_KEY || process.env.GROK;
const MODEL = process.env.XAI_MODEL || 'grok-4.3';
const MAX_ROUNDS = 8;
const MAX_TOOL_OUTPUT = 60000;

async function connectTools() {
  const server = buildServer();
  const client = new Client({ name: 'grok-assistant', version: '1.0.0' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const { tools } = await client.listTools();
  return { client, server, tools };
}

function toXaiTools(tools) {
  return tools.map((t) => {
    const { $schema, ...parameters } = t.inputSchema || { type: 'object', properties: {} };
    return { type: 'function', name: t.name, description: t.description, parameters };
  });
}

async function callXai(body) {
  const res = await fetch(XAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${XAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `xAI request failed (${res.status})`);
  return data;
}

function replyText(response) {
  return (response.output || [])
    .filter((o) => o.type === 'message')
    .flatMap((m) => m.content || [])
    .map((c) => c.text)
    .filter(Boolean)
    .join('\n\n');
}

async function instructions(user, context = {}) {
  let company = 'All companies';
  if (context.company && context.company !== 'all') {
    const row = await sbGetById('company_profiles', context.company, 'name').catch(() => null);
    if (row?.name) company = row.name;
  }
  const name = user.user_metadata?.full_name || user.email;
  return [
    'You are Grok, the assistant built into Clardy.io, a construction/landscaping CRM (leads, clients, estimates/proposals, projects, schedules, change orders, daily logs, punch lists, inspections, job cost, draws, invoices, payments) that runs several company brands.',
    `Today is ${new Date().toISOString().slice(0, 10)}. You're talking with ${name}. The sidebar company filter is set to: ${company} — scope lists to it (pass company) unless they ask otherwise.`,
    'Use the tools to look things up; never invent ids, names, amounts or dates. Look records up by name before acting on them. Lead stages have no fixed list — check list_lead_statuses before setting one.',
    'When a request needs a change, call the create/update/record tool directly: the app shows the change to the user and runs it only if they approve, so don\'t ask "should I?" first. If they decline, accept that and don\'t retry.',
    'Answer briefly and plainly. Format money like $12,500. Use short lists or small tables when comparing records.',
    '',
    BRIEFING,
  ].join('\n');
}

// Runs tool calls through the in-memory MCP client, in order.
async function runCalls(client, calls, approvals = {}) {
  const outputs = [];
  for (const call of calls) {
    let output;
    if (approvals[call.call_id] === false) {
      output = 'The user declined this action. It was not done.';
    } else {
      try {
        const args = call.arguments ? JSON.parse(call.arguments) : {};
        const result = await client.callTool({ name: call.name, arguments: args });
        output = (result.content || []).map((c) => c.text).join('\n') || '(no output)';
      } catch (err) {
        output = `Error: ${err.message}`;
      }
    }
    if (output.length > MAX_TOOL_OUTPUT) output = `${output.slice(0, MAX_TOOL_OUTPUT)}\n… (truncated — narrow the request)`;
    outputs.push({ type: 'function_call_output', call_id: call.call_id, output });
  }
  return outputs;
}

module.exports = async function grokAssistant(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const user = await getStaffCaller(req).catch(() => null);
  if (!user) { res.status(401).json({ error: 'Sign in with a staff account to use Grok.' }); return; }
  // Tool queries then run as this person, so they only see their brands.
  bindUserJwt((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  if (!XAI_API_KEY) {
    res.status(503).json({ error: "Grok isn't switched on yet: add an XAI_API_KEY (from console.x.ai) to Vercel's environment variables and redeploy." });
    return;
  }

  const { message, previous_response_id, context, pending, approvals } = req.body || {};
  let mcp;
  try {
    mcp = await connectTools();
    const readOnly = new Set(mcp.tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name));
    const allowed = user.isViewer ? mcp.tools.filter((t) => readOnly.has(t.name)) : mcp.tools;
    const allowedNames = new Set(allowed.map((t) => t.name));
    const tools = toXaiTools(allowed);
    const changes = [];

    let input;
    let prevId = previous_response_id || undefined;
    if (Array.isArray(pending) && pending.length) {
      // Resuming after the user approved/declined held changes.
      if (!prevId) { res.status(400).json({ error: 'Missing previous_response_id.' }); return; }
      if (pending.some((c) => !allowedNames.has(c.name))) { res.status(403).json({ error: READ_ONLY_MESSAGE }); return; }
      input = await runCalls(mcp.client, pending, approvals || {});
      pending.filter((c) => !readOnly.has(c.name) && approvals?.[c.call_id] !== false).forEach((c) => changes.push(c.name));
    } else {
      if (!message || typeof message !== 'string') { res.status(400).json({ error: 'Type a message.' }); return; }
      input = [{ role: 'user', content: message }];
      if (!prevId) input.unshift({ role: 'system', content: await instructions(user, context) });
    }

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const response = await callXai({ input, tools, previous_response_id: prevId });
      prevId = response.id;
      const calls = (response.output || []).filter((o) => o.type === 'function_call');
      const reply = replyText(response);
      if (!calls.length) { res.status(200).json({ response_id: prevId, reply, changes }); return; }

      const held = calls.filter((c) => !readOnly.has(c.name));
      if (held.length) {
        res.status(200).json({
          response_id: prevId,
          reply,
          changes,
          pending: calls.map((c) => ({
            call_id: c.call_id,
            name: c.name,
            arguments: c.arguments,
            needs_approval: !readOnly.has(c.name),
          })),
        });
        return;
      }
      input = await runCalls(mcp.client, calls);
    }
    res.status(200).json({ response_id: prevId, reply: 'That took too many steps — try a narrower question.', changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (mcp) { mcp.client.close().catch(() => {}); mcp.server.close().catch(() => {}); }
  }
};
