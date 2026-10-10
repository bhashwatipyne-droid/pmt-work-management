// GET /share/:token (see vercel.json): the shared project page, for everyone -
// people and link-preview crawlers alike. The facts come from the backend's
// public share endpoint, so a revoked or unknown link shows nothing.
//
// The answer is cached at the edge: the backend can be asleep (the first request
// after a quiet spell takes a minute), and the sender's own link preview already
// warms this cache, so whoever taps the link next gets it at once. A cached copy
// is at most two minutes old, and for a day after that it is still served
// instantly while a fresh one is fetched.
const { BACKEND, cleanToken, pageHtml } = require("./_share");

const notFound = (res, code, text) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res
    .status(code)
    .send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>PMT</title><body style="font:16px system-ui;padding:32px">${text}</body>`);
};

module.exports = async (req, res) => {
  const token = cleanToken(req.query.token);
  if (!token || !BACKEND) {
    notFound(res, 404, "This link is no longer available.");
    return;
  }

  let data;
  try {
    const upstream = await fetch(`${BACKEND}/api/share/p/${token}/data`, { headers: { Accept: "application/json" } });
    if (upstream.status === 404) {
      notFound(res, 404, "This link is no longer available.");
      return;
    }
    if (!upstream.ok) throw new Error(`backend ${upstream.status}`);
    data = await upstream.json();
  } catch (_) {
    notFound(res, 502, "Could not load this project right now. Please try again in a minute.");
    return;
  }

  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const origin = `https://${host}`;
  // The picture is served from this domain too, so the whole card comes from one
  // host. Its version changes whenever the project's facts do, which makes
  // WhatsApp fetch a fresh picture.
  const version = `${data.done}-${data.total}-${(data.rows || []).map((r) => r.status.charAt(0)).join("")}`;
  const html = pageHtml({
    data,
    pageUrl: `${origin}/share/${token}`,
    imageUrl: `${origin}/api/share-image?token=${token}&v=${encodeURIComponent(version)}`,
    logWorkUrl: `${origin}/?log_work=${encodeURIComponent(data.project_id)}`,
    closeUrl: `${origin}/`,
  });

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=86400");
  res.status(200).send(html);
};
