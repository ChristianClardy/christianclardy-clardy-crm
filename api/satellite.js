// Proxies ESRI World Imagery tiles to avoid browser CORS restrictions.
// GET /api/satellite?lat=&lon=&w=&d=
module.exports = async function handler(req, res) {
  const { lat, lon, w, d } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: "lat/lon required" });

  const numLat = parseFloat(lat);
  const numLon = parseFloat(lon);
  const lotW   = parseFloat(w)  || 80;
  const lotD   = parseFloat(d)  || 100;

  // Show 1.8x lot size so house + yard visible
  const latDPF = 1 / 364000;
  const lonDPF = 1 / (364000 * Math.cos(numLat * Math.PI / 180));
  const halfW  = (lotW * 0.9) * lonDPF;
  const halfD  = (lotD * 0.9) * latDPF;

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
