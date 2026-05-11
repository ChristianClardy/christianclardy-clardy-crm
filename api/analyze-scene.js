// Analyzes an outdoor space photo with Claude Vision and returns structured 3D scene data.
// POST /api/analyze-scene  { imageBase64: string, mediaType: string }
// Requires ANTHROPIC_API_KEY environment variable.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const prompt = `You are analyzing an outdoor residential space photo for a landscaping design tool.

Return ONLY a valid JSON object — no markdown, no explanation, nothing else. Use this exact schema:
{
  "groundType": "grass" | "concrete" | "pavers" | "dirt" | "mixed",
  "spaceWidth": <estimated usable width in feet, integer 20-200>,
  "spaceDepth": <estimated usable depth in feet, integer 20-200>,
  "cameraHeightFt": <estimated camera/eye height in feet, typically 4-6 for a person standing>,
  "cameraTiltDeg": <degrees the camera tilts DOWN from horizontal, 5-45>,
  "description": "<one concise sentence describing the space>",
  "existingFeatures": [
    {
      "type": "concrete_patio" | "fence" | "tree" | "shrub" | "lawn" | "pool" | "deck" | "pergola" | "raised_bed" | "retaining_wall" | "shed",
      "xFt": <horizontal offset from center of space, negative=left positive=right>,
      "zFt": <depth position: 0=near camera edge, positive=further into space>,
      "widthFt": <width in feet>,
      "depthFt": <depth in feet>,
      "heightFt": <height in feet>
    }
  ]
}

Be conservative with dimensions. Focus on the main usable backyard/outdoor area visible. Include 2-6 key features max.`;

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => '');
      return res.status(502).json({ error: `Anthropic API ${upstream.status}: ${body.slice(0, 300)}` });
    }

    const data = await upstream.json();
    const text = data.content?.[0]?.text || '';

    // Extract JSON even if model wraps it in markdown code blocks
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(502).json({ error: 'No JSON in AI response', raw: text.slice(0, 300) });

    const scene = JSON.parse(match[0]);
    res.setHeader('Cache-Control', 'no-store');
    res.json(scene);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
