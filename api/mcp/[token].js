// Remote MCP server — lets Claude (claude.ai custom connector, Claude Code,
// etc.) read and write this CRM's companies/leads/clients/estimates/projects/payments
// data directly, so a conversation and Clardy.io stay in sync (same tables).
//
// Auth: the URL itself carries a long random secret as the [token] path
// segment (Vercel's file-system routing exposes it as req.query.token — see
// https://vercel.com/docs, "dynamic API routes"). No OAuth server needed —
// there's exactly one legitimate caller (Christian), so a path secret is
// enough; a query-string token would violate the MCP spec's ban on tokens in
// query params, which is why it's a path segment instead. Set MCP_ACCESS_TOKEN
// in Vercel's Production env vars (never VITE_-prefixed — must never reach
// the browser bundle) and give Claude the full URL
// https://<domain>/api/mcp/<token>, Authentication: None, when adding the
// connector.
//
// The tools themselves live in api/_lib/crmTools.js (shared with the in-app
// Grok assistant). Nothing here is a new trust boundary beyond "you have the
// secret URL."
//
// /api/mcp/assistant is the in-app Grok assistant instead (staff login, not
// the secret URL) — it rides on this function because the Vercel plan is at
// its 12-function limit.

const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { buildServer } = require('../_lib/crmTools.js');
const grokAssistant = require('../_lib/grokAssistant.js');

module.exports = async function handler(req, res) {
  const token = req.query?.token;
  if (token === 'assistant') return grokAssistant(req, res);
  if (!process.env.MCP_ACCESS_TOKEN || token !== process.env.MCP_ACCESS_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
};
