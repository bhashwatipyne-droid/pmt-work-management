// GET /api/share-image?token=...: the card's picture, passed through from the
// backend so WhatsApp fetches it from the same domain as the page.
const { BACKEND, cleanToken } = require("./_share");

module.exports = async (req, res) => {
  const token = cleanToken(req.query.token);
  if (!token || !BACKEND) {
    res.status(404).send("Not found");
    return;
  }

  try {
    const upstream = await fetch(`${BACKEND}/api/share/p/${token}/preview.png`);
    if (!upstream.ok) {
      res.status(upstream.status === 404 ? 404 : 502).send("Not available");
      return;
    }
    const image = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Length", String(image.length));
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    res.status(200).send(image);
  } catch (_) {
    res.status(502).send("Not available");
  }
};
