// GET /share/:token for link-preview crawlers (see vercel.json): the page with
// the preview tags. The facts come from the backend's public share endpoint, so
// a revoked or unknown link has no card.
const { BACKEND, cleanToken, previewHtml } = require("./_share");

module.exports = async (req, res) => {
  const token = cleanToken(req.query.token);
  if (!token || !BACKEND) {
    res.status(404).send("Not found");
    return;
  }

  let data;
  try {
    const upstream = await fetch(`${BACKEND}/api/share/p/${token}/data`, { headers: { Accept: "application/json" } });
    if (!upstream.ok) {
      res.status(upstream.status === 404 ? 404 : 502).send("This link is no longer available.");
      return;
    }
    data = await upstream.json();
  } catch (_) {
    res.status(502).send("Could not load this project.");
    return;
  }

  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const origin = `https://${host}`;
  // The image is served from this same domain too, so the whole card comes from
  // one host. The version changes whenever the project's facts do, which makes
  // WhatsApp fetch a fresh picture.
  const version = `${data.done}-${data.total}-${(data.rows || []).map((r) => r.status.charAt(0)).join("")}`;
  const html = previewHtml({
    data,
    pageUrl: `${origin}/share/${token}`,
    imageUrl: `${origin}/api/share-image?token=${token}&v=${encodeURIComponent(version)}`,
  });

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  res.status(200).send(html);
};
