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
    // Google returns a gray "no imagery" image with status 200 when unavailable,
    // but sets x-googlemaps-panorama-not-found on the response.
    if (!upstream.ok) return res.status(502).json({ error: "Street view unavailable" });

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
