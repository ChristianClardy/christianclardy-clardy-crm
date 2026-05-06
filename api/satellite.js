// Proxies ESRI World Imagery tiles to avoid browser CORS restrictions.
// GET /api/satellite?lat=&lon=&w=&d=
module.exports = async function handler(req, res) {
  const { lat, lon, w, d } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: "lat/lon required" });

  const numLat = parseFloat(lat);
  const numLon = parseFloat(lon);
  const lotW   = parseFloat(w)  || 80;
  const lotD   = parseFloat(d)  || 100;

  // Show 3x lot size so house + surrounding context visible.
  // Clamp to minimum 0.0012 deg (~440ft) — ESRI returns 500 for smaller bboxes.
  const latDPF = 1 / 364000;
  const lonDPF = 1 / (364000 * Math.cos(numLat * Math.PI / 180));
  const halfW  = Math.max((lotW * 1.5) * lonDPF, 0.0012);
  const halfD  = Math.max((lotD * 1.5) * latDPF, 0.0012);

  const bbox = `${numLon - halfW},${numLat - halfD},${numLon + halfW},${numLat + halfD}`;
  const url  = `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export` +
    `?bbox=${bbox}&bboxSR=4326&size=1024,1024&imageSR=4326&format=png&f=image`;

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(502).json({ error: "Upstream failed", status: upstream.status });
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
