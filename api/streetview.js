// Proxies Google Street View Static API images to avoid CORS restrictions.
// GET /api/streetview?lat=&lon=&heading=&pitch=&fov=
// Requires GOOGLE_MAPS_API_KEY environment variable.
module.exports = async function handler(req, res) {
  const { lat, lon, heading = 0, pitch = 0, fov = 90 } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: "lat/lon required" });

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.status(503).json({ error: "GOOGLE_MAPS_API_KEY not configured" });

  const url =
    `https://maps.googleapis.com/maps/api/streetview` +
    `?size=1280x720&location=${lat},${lon}` +
    `&heading=${heading}&pitch=${pitch}&fov=${fov}` +
    `&source=outdoor&key=${key}`;

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      const body = await upstream.text().catch(() => "");
      return res.status(502).json({
        error: `Google API returned ${upstream.status}${body ? ": " + body.slice(0, 200) : ""}. Ensure Street View Static API is enabled and billing is active in Google Cloud Console.`
      });
    }
    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      const body = await upstream.text().catch(() => "");
      return res.status(502).json({ error: `Unexpected response: ${body.slice(0, 300)}` });
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
