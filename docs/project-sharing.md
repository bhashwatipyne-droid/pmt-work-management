# Sharing a project on WhatsApp

Project managers used to screenshot their project sheet and post it in a WhatsApp group. The **Share** button on a
project page (managers and admins) does the same from PMT: it makes one link for the project. Pasted into WhatsApp,
the link unfurls into a card (project name, "N of M deliverables done", and an image of the deliverables table);
opened, it shows the full read-only list.

## How it works

| What | Where |
|---|---|
| Start / get / stop the link (signed in, manager or admin) | `POST / GET / DELETE /api/projects/{id}/share` |
| The public page with the preview tags | `GET /api/share/p/{token}` |
| The card image (1200 x 630 PNG, drawn with Pillow) | `GET /api/share/p/{token}/preview.png` |
| Storage | `project_shares` collection: `token`, `project_id`, `created_by`, `created_at`, `revoked` |

The page is rendered by the backend, not the React app, because WhatsApp's crawler reads the preview tags from the
HTML it is given and does not run JavaScript.

## What is exposed

Only what the page shows: project name, client, status, timeline, and for each deliverable its name, type, stage,
status and due date. No people, time logged, remarks or links. The token is random and unguessable and is the only
thing that grants access. **Stop sharing** revokes it (the link 404s at once); sharing again makes a new token. A
hidden or deleted project's link stops working too.

## Configuration

- `PUBLIC_API_URL` (optional): the public address of the backend, e.g. `https://api.example.com`. By default it is
  taken from the request (`X-Forwarded-Proto` / `X-Forwarded-Host` / `Host`); set it if your proxy does not pass
  those along, otherwise the link and image URLs could point at an internal address.
- Needs `pillow` (in `requirements.txt`). Without it the page and link still work; the card just has no image.

## Notes

- WhatsApp caches a card per URL. Each time the link is opened in the Share dialog it carries a fresh `?v=`, so
  copying it again after the project changes gives a new preview.
- The card shows the first 9 deliverables (by due date); the page lists them all.
