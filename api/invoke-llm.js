// Backend for base44.integrations.Core.InvokeLLM (src/api/base44Client.js) —
// the app was originally built on the Base44 platform, which provided
// InvokeLLM as a built-in; this project's Supabase-backed rewrite never
// implemented it, so every AI feature calling it (ProjectAISummary,
// AITaskManager, TemplatePicker, ProjectSheetView's AI autofill, Reports,
// WorkplaceItems) has silently done nothing since. This just proxies to
// Claude — response_json_schema (when the caller wants structured output)
// is turned into an explicit instruction, since Claude has no native
// json_schema response mode the way the original OpenAI-based integration
// did; the client wrapper parses the returned text back into JSON.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-5';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Server misconfiguration: missing ANTHROPIC_API_KEY.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { prompt, response_json_schema } = body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required.' });

  const fullPrompt = response_json_schema
    ? `${prompt}\n\nRespond with ONLY a single valid JSON object matching this JSON Schema — no markdown code fences, no explanation, no text before or after the JSON:\n\n${JSON.stringify(response_json_schema)}`
    : prompt;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
        messages: [{ role: 'user', content: fullPrompt }],
      }),
    });

    const data = await anthropicRes.json();
    if (!anthropicRes.ok) {
      return res.status(anthropicRes.status).json({ error: data.error?.message || 'Claude request failed.' });
    }

    const text = (data.content || []).map((block) => block.text || '').join('');
    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
