// Shared by the share-link functions (api/share-preview.js, api/share-image.js).
// Files starting with "_" are not deployed as functions of their own.
//
// Why this exists: when a project link is pasted into WhatsApp, WhatsApp's
// crawler reads the page's preview tags (title, description, image) to build the
// card. The link is on the app's own domain, which is a static site, so these
// functions answer the crawler with those tags; people get the app as usual.

const BACKEND = (process.env.BACKEND_URL || process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "");

// Link-preview crawlers. They do not run JavaScript, so they never see the app.
const BOT = /whatsapp|facebookexternalhit|facebot|twitterbot|slackbot|telegrambot|linkedinbot|discordbot|skypeuripreview|googlebot|bingbot|applebot|embedly|pinterest|iframely|vkshare|signal|preview|crawler|spider/i;

const isPreviewBot = (userAgent) => BOT.test(String(userAgent || ""));

// Tokens are url-safe base64; anything else is not one of ours.
const cleanToken = (value) => {
  const token = String(Array.isArray(value) ? value[0] : value || "");
  return /^[A-Za-z0-9_-]{8,128}$/.test(token) ? token : "";
};

const esc = (text) =>
  String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// The page a crawler reads (the link inside is for anyone who lands on it).
const previewHtml = ({ data, pageUrl, imageUrl }) => {
  const title = data.name || "Project";
  const description = data.summary || "";
  return [
    "<!doctype html><html lang=\"en\"><head>",
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<meta name=\"robots\" content=\"noindex, nofollow\">",
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    "<meta property=\"og:type\" content=\"website\">",
    "<meta property=\"og:site_name\" content=\"PMT\">",
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(pageUrl)}">`,
    `<meta property="og:image" content="${esc(imageUrl)}">`,
    `<meta property="og:image:secure_url" content="${esc(imageUrl)}">`,
    "<meta property=\"og:image:type\" content=\"image/png\">",
    "<meta property=\"og:image:width\" content=\"1200\">",
    "<meta property=\"og:image:height\" content=\"630\">",
    `<meta property="og:image:alt" content="${esc(title)}">`,
    "<meta name=\"twitter:card\" content=\"summary_large_image\">",
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(imageUrl)}">`,
    `</head><body><a href="${esc(pageUrl)}">${esc(title)}</a></body></html>`,
  ].join("");
};

module.exports = { BACKEND, isPreviewBot, cleanToken, esc, previewHtml };
