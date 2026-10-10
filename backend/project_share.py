"""Share a project as a link that previews in WhatsApp.

Project managers used to screenshot their project sheet and post it in a WhatsApp
group. This is the same thing from PMT: one link per project. Pasted into
WhatsApp it unfurls into a card (project name, progress and an image of the
deliverables table); opened, it shows the full read-only list.

  Managers and admins (signed in)
    GET    /projects/{id}/share      is the project shared? {active, url, preview_url}
    POST   /projects/{id}/share      start sharing (or get the existing link)
    DELETE /projects/{id}/share      stop sharing; the link stops working at once

  Anyone with the link (no sign-in; WhatsApp's crawler cannot sign in)
    GET    /share/p/{token}              link-preview crawlers (WhatsApp, ...) get a page with
                                         the preview tags; a person's browser is sent on to the
                                         app (/share/{token}), where it opens as a modal
    GET    /share/p/{token}/preview.png  the image WhatsApp shows in the card
    GET    /share/p/{token}/data         the same facts as JSON, for that modal

The token is random and unguessable, and it is the only thing that grants access:
the page shows the deliverable list (name, type, stage, status, due date) and the
project's name, client, status and dates, nothing else (no people, time, remarks
or links). Stopping sharing revokes the token. The preview image is drawn with
Pillow; if Pillow is missing the page still works and the card just has no image.

Collection: project_shares {id, token, project_id, created_by, created_at,
revoked, revoked_at}.
"""
import hashlib
import html
import io
import json
import os
import secrets
import time
from datetime import date
from functools import lru_cache
from typing import Any, Awaitable, Callable, Dict, List, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from pydantic import BaseModel, ConfigDict
from starlette.concurrency import run_in_threadpool

SHARES = "project_shares"

# The preview is 1200 x 630 (the size link cards are made for). This many
# deliverables fit under the header; the page itself lists them all.
PREVIEW_ROWS = 9
PREVIEW_W, PREVIEW_H = 1200, 630

NAVY = (13, 27, 62)
MUTED = (84, 100, 144)
HEADER_BG = (0, 32, 91)
BRAND = (43, 43, 181)

# stage_status -> (label, chip background, chip text)
STATUS_STYLE = {
    "Not Started": ("Not started", (241, 245, 249), (71, 85, 105)),
    "In Progress": ("In progress", (219, 234, 254), (30, 64, 175)),
    "Ready for Review": ("Ready for review", (254, 243, 199), (146, 64, 14)),
    "Changes Requested": ("Changes requested", (254, 226, 226), (153, 27, 27)),
    "Completed": ("Done", (209, 250, 229), (6, 95, 70)),
    "Closed": ("Done", (209, 250, 229), (6, 95, 70)),
}
DONE_STATUSES = ("Completed", "Closed")


# Who gets the preview page and who is sent on to the app. Link-preview crawlers
# do not follow redirects or run JavaScript, so they must be served the tags.
PREVIEW_BOTS = (
    "whatsapp", "facebookexternalhit", "facebot", "twitterbot", "slackbot", "telegrambot",
    "linkedinbot", "discordbot", "skypeuripreview", "googlebot", "bingbot", "applebot",
    "embedly", "pinterest", "iframely", "vkshare", "signal", "preview", "crawler", "spider", "bot",
)


def is_preview_bot(user_agent: Optional[str]) -> bool:
    ua = (user_agent or "").lower()
    # Every real browser says "Mozilla"; WhatsApp's crawler does not.
    return not ua or "mozilla" not in ua or any(marker in ua for marker in PREVIEW_BOTS)


def clean_app_url(value: Optional[str]) -> str:
    """The address of the PMT web app, as an origin ("https://pmt.example.com"),
    or "" when it is not a plain http(s) address."""
    try:
        parts = urlparse((value or "").strip())
    except ValueError:
        return ""
    if parts.scheme not in ("http", "https") or not parts.netloc:
        return ""
    return f"{parts.scheme}://{parts.netloc}"


class StartShare(BaseModel):
    model_config = ConfigDict(extra="ignore")
    # Where the web app lives (the page asking passes window.location.origin):
    # the link opens there. Falls back to FRONTEND_URL.
    app_url: Optional[str] = None


# --------------------------------------------------------------- pure helpers

def _date_text(value: Optional[str]) -> str:
    try:
        d = date.fromisoformat(str(value or "")[:10])
    except ValueError:
        return ""
    return f"{d.day} {d.strftime('%b')} {d.year}"


def _range_text(start: Optional[str], end: Optional[str]) -> str:
    a, b = _date_text(start), _date_text(end)
    if a and b:
        return f"{a} – {b}"
    return a or b


def status_style(stage_status: Optional[str]):
    return STATUS_STYLE.get(stage_status or "", STATUS_STYLE["Not Started"])


def build_share_data(project: dict, client_name: str, deliverables: List[dict]) -> dict:
    """What the page and the picture show. Only these fields ever leave PMT."""
    ordered = sorted(
        deliverables,
        key=lambda d: (d.get("end_dt") or "9999-12-31", d.get("created_at") or ""),
    )
    rows = [
        {
            "name": (d.get("name") or "").strip() or "Untitled",
            "type": d.get("type") or "",
            "stage": d.get("current_stage") or "",
            "status": d.get("stage_status") or "Not Started",
            "due": _date_text(d.get("end_dt")),
        }
        for d in ordered
    ]
    done = sum(1 for r in rows if r["status"] in DONE_STATUSES)
    return {
        "name": project.get("name") or "Project",
        "client": client_name or "",
        "status": project.get("status") or "",
        "timeline": _range_text(project.get("start_date"), project.get("end_date")),
        "total": len(rows),
        "done": done,
        "rows": rows,
    }


def summary_text(data: dict) -> str:
    """The line under the title in a WhatsApp card."""
    parts = [data["client"]] if data["client"] else []
    parts.append(f"{data['done']} of {data['total']} deliverables done")
    if data["status"]:
        parts.append(data["status"])
    return " · ".join(parts)


def base_url(request: Request) -> str:
    """Where the outside world reaches this API. Set PUBLIC_API_URL when the
    proxy does not pass the original host and scheme along."""
    configured = os.environ.get("PUBLIC_API_URL", "").strip().rstrip("/")
    if configured:
        return configured
    proto = (request.headers.get("x-forwarded-proto") or request.url.scheme).split(",")[0].strip()
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc).split(",")[0].strip()
    return f"{proto}://{host}"


def share_url(request: Request, token: str, version: Optional[int] = None) -> str:
    # A new ?v= each time the link is copied makes WhatsApp fetch a fresh card
    # instead of the one it cached the last time the same link was posted.
    stamp = int(time.time()) if version is None else version
    return f"{base_url(request)}/api/share/p/{token}?v={stamp}"


def preview_url(request: Request, token: str, version: Optional[int] = None) -> str:
    stamp = int(time.time()) if version is None else version
    return f"{base_url(request)}/api/share/p/{token}/preview.png?v={stamp}"


# ----------------------------------------------------------------- the picture

REGULAR_FONTS = ["DejaVuSans.ttf", "Arial.ttf", "arial.ttf", "LiberationSans-Regular.ttf", "Helvetica.ttc"]
BOLD_FONTS = ["DejaVuSans-Bold.ttf", "Arial Bold.ttf", "arialbd.ttf", "LiberationSans-Bold.ttf", "Helvetica.ttc"]


@lru_cache(maxsize=64)
def _font(size: int, bold: bool = False):
    from PIL import ImageFont

    for name in BOLD_FONTS if bold else REGULAR_FONTS:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size)  # Pillow 10.1+: a scalable font
    except TypeError:
        return ImageFont.load_default()


def _fit(text: str, font, max_width: float) -> str:
    """`text`, shortened with an ellipsis so it is no wider than max_width."""
    if font.getlength(text) <= max_width:
        return text
    while text and font.getlength(text + "…") > max_width:
        text = text[:-1]
    return text.rstrip() + "…"


_png_cache: Dict[str, bytes] = {}


def render_preview_png_cached(data: dict) -> bytes:
    """The picture takes a couple of seconds the first time (WhatsApp gives up
    quickly), so it is kept until the project's facts change."""
    key = hashlib.sha1(json.dumps(data, sort_keys=True).encode("utf-8")).hexdigest()
    png = _png_cache.get(key)
    if png is None:
        png = render_preview_png(data)
        if len(_png_cache) >= 64:
            _png_cache.pop(next(iter(_png_cache)))
        _png_cache[key] = png
    return png


def render_preview_png(data: dict) -> bytes:
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (PREVIEW_W, PREVIEW_H), "white")
    draw = ImageDraw.Draw(img)
    pad = 40
    right = PREVIEW_W - pad

    # Header: name, who it is for, and how far along it is.
    draw.text((pad, 26), _fit(data["name"], _font(38, True), 780), font=_font(38, True), fill=NAVY)
    sub = " · ".join(p for p in (data["client"], data["status"], data["timeline"]) if p)
    draw.text((pad, 78), _fit(sub, _font(21), 780), font=_font(21), fill=MUTED)

    count = f"{data['done']}/{data['total']}"
    count_font = _font(40, True)
    draw.text((right - count_font.getlength(count), 22), count, font=count_font, fill=NAVY)
    caption_font = _font(17)
    caption = "deliverables done"
    draw.text((right - caption_font.getlength(caption), 70), caption, font=caption_font, fill=MUTED)

    bar_y = 118
    draw.rounded_rectangle((pad, bar_y, right, bar_y + 8), radius=4, fill=(238, 240, 244))
    if data["total"] and data["done"]:
        filled = max(8, int((right - pad) * data["done"] / data["total"]))
        draw.rounded_rectangle((pad, bar_y, pad + filled, bar_y + 8), radius=4, fill=(16, 185, 129))

    # The table, like the sheet the team used to screenshot.
    cols = [  # (title, left, width)
        ("Deliverable", pad, 500),
        ("Type", pad + 500, 200),
        ("Stage", pad + 700, 140),
        ("Status", pad + 840, 190),
        ("Due", pad + 1030, 90),
    ]
    top = 146
    head_h, row_h = 40, 44
    draw.rectangle((pad, top, right, top + head_h), fill=HEADER_BG)
    head_font = _font(18, True)
    for title, left, _ in cols:
        draw.text((left + 12, top + 10), title, font=head_font, fill="white")

    body_font, chip_font = _font(19), _font(16, True)
    shown = data["rows"][:PREVIEW_ROWS]
    y = top + head_h
    for i, row in enumerate(shown):
        draw.rectangle((pad, y, right, y + row_h), fill=(255, 255, 255) if i % 2 == 0 else (247, 249, 252))
        draw.line((pad, y + row_h, right, y + row_h), fill=(226, 231, 240))
        values = [row["name"], row["type"], row["stage"], None, row["due"]]
        for (title, left, width), value in zip(cols, values):
            if value is None:  # status chip
                label, bg, fg = status_style(row["status"])
                label = _fit(label, chip_font, width - 36)
                chip_w = chip_font.getlength(label) + 24
                draw.rounded_rectangle((left + 8, y + 8, left + 8 + chip_w, y + row_h - 8), radius=13, fill=bg)
                draw.text((left + 20, y + 12), label, font=chip_font, fill=fg)
            else:
                draw.text((left + 12, y + 11), _fit(value, body_font, width - 20), font=body_font, fill=NAVY)
        y += row_h

    if not shown:
        draw.text((pad + 12, y + 14), "No deliverables yet", font=body_font, fill=MUTED)

    footer_y = PREVIEW_H - 38
    more = data["total"] - len(shown)
    note = f"+ {more} more · open the link to see them all" if more > 0 else "Open the link for the full list"
    draw.text((pad, footer_y), note, font=_font(18), fill=MUTED)
    brand_font = _font(18, True)
    draw.text((right - brand_font.getlength("PMT"), footer_y), "PMT", font=brand_font, fill=BRAND)

    out = io.BytesIO()
    img.save(out, "PNG", optimize=True)
    return out.getvalue()


# -------------------------------------------------------------------- the page

def render_page(data: dict, page_url: str, image_url: Optional[str]) -> str:
    esc = html.escape
    title = data["name"]
    description = summary_text(data)

    meta = [
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<meta name="robots" content="noindex, nofollow">',
        f"<title>{esc(title)}</title>",
        f'<meta name="description" content="{esc(description, quote=True)}">',
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="PMT">',
        f'<meta property="og:title" content="{esc(title, quote=True)}">',
        f'<meta property="og:description" content="{esc(description, quote=True)}">',
        f'<meta property="og:url" content="{esc(page_url, quote=True)}">',
    ]
    if image_url:
        meta += [
            f'<meta property="og:image" content="{esc(image_url, quote=True)}">',
            f'<meta property="og:image:width" content="{PREVIEW_W}">',
            f'<meta property="og:image:height" content="{PREVIEW_H}">',
            '<meta property="og:image:type" content="image/png">',
            '<meta name="twitter:card" content="summary_large_image">',
            f'<meta name="twitter:image" content="{esc(image_url, quote=True)}">',
        ]

    body_rows = []
    for i, r in enumerate(data["rows"], 1):
        label, bg, fg = status_style(r["status"])
        chip = (
            f'<span class="chip" style="background:rgb{bg};color:rgb{fg}">{esc(label)}</span>'
        )
        body_rows.append(
            "<tr>"
            f'<td class="n">{i}</td><td>{esc(r["name"])}</td><td>{esc(r["type"])}</td>'
            f'<td>{esc(r["stage"])}</td><td>{chip}</td><td class="due">{esc(r["due"])}</td>'
            "</tr>"
        )
    table = (
        "<table><thead><tr><th>#</th><th>Deliverable</th><th>Type</th><th>Stage</th>"
        "<th>Status</th><th>Due</th></tr></thead><tbody>"
        + "".join(body_rows)
        + "</tbody></table>"
        if body_rows
        else '<p class="empty">No deliverables yet.</p>'
    )
    pct = round(100 * data["done"] / data["total"]) if data["total"] else 0
    sub = " · ".join(p for p in (data["client"], data["status"], data["timeline"]) if p)

    style = """
    *{box-sizing:border-box}body{margin:0;background:#f7f9fc;color:#0d1b3e;font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
    main{max-width:1000px;margin:0 auto;padding:24px 16px 48px}
    h1{margin:0 0 4px;font-size:26px;line-height:1.25}
    .sub{margin:0 0 16px;color:#546490}
    .bar{display:flex;align-items:center;gap:12px;margin-bottom:16px;color:#546490;font-size:14px}
    .track{flex:1;height:8px;border-radius:4px;background:#eef0f4;overflow:hidden}
    .fill{height:100%;background:#10b981}
    .card{background:#fff;border-radius:12px;box-shadow:0 0 0 1px #eaeef4;overflow-x:auto}
    table{width:100%;border-collapse:collapse;min-width:640px}
    th{background:#00205b;color:#fff;text-align:left;padding:10px 12px;font-size:13px;white-space:nowrap}
    td{padding:10px 12px;border-bottom:1px solid #e2e7f0;vertical-align:top}
    tr:nth-child(even) td{background:#f7f9fc}
    .n{color:#546490;width:36px}.due{white-space:nowrap}
    .chip{display:inline-block;padding:2px 10px;border-radius:999px;font-size:13px;font-weight:600;white-space:nowrap}
    .empty{padding:24px;color:#546490}
    footer{margin-top:16px;color:#8a94b0;font-size:12px}
    """
    return (
        "<!doctype html><html lang=\"en\"><head>"
        + "".join(meta)
        + f"<style>{style}</style></head><body><main>"
        f"<h1>{esc(title)}</h1><p class=\"sub\">{esc(sub)}</p>"
        f'<div class="bar"><span>{data["done"]} of {data["total"]} deliverables done</span>'
        f'<span class="track"><span class="fill" style="display:block;width:{pct}%"></span></span>'
        f"<span>{pct}%</span></div>"
        f'<div class="card">{table}</div>'
        "<footer>Shared from PMT · read-only view</footer>"
        "</main></body></html>"
    )


# ---------------------------------------------------------------------- router

def create_project_share_router(
    db,
    get_acting_user: Callable[[Request], Awaitable[Any]],
    now_iso: Callable[[], str],
) -> APIRouter:
    router = APIRouter(tags=["project-share"])
    shares = db[SHARES]

    async def sharer(request: Request):
        user = await get_acting_user(request)
        if user.role not in ("admin", "manager"):
            raise HTTPException(status_code=403, detail="Only managers and admins can share a project")
        return user

    async def load_project(project_id: str) -> dict:
        project = await db.projects.find_one({"id": project_id}, {"_id": 0})
        if not project or project.get("hidden"):
            raise HTTPException(status_code=404, detail="Project not found")
        return project

    async def active_share(project_id: str) -> Optional[dict]:
        return await shares.find_one({"project_id": project_id, "revoked": {"$ne": True}}, {"_id": 0})

    def describe(request: Request, share: Optional[dict]) -> Dict[str, Any]:
        if not share:
            return {"active": False}
        # When the app's address is known the link is on the app's own domain
        # (WhatsApp previews it from there; see frontend/api/share-preview.js).
        app_url = share.get("app_url") or clean_app_url(os.environ.get("FRONTEND_URL"))
        link = (
            f"{app_url}/share/{share['token']}?v={int(time.time())}"
            if app_url
            else share_url(request, share["token"])
        )
        return {
            "active": True,
            "token": share["token"],
            "url": link,
            "preview_url": preview_url(request, share["token"]),
            "created_at": share.get("created_at"),
        }

    async def data_for(token: str, with_share: bool = False):
        """The picture and page data for a token, or 404 when it is unknown,
        revoked, or its project is gone or hidden."""
        gone = HTTPException(status_code=404, detail="This link is no longer available")
        share = await shares.find_one({"token": token, "revoked": {"$ne": True}}, {"_id": 0})
        if not share:
            raise gone
        project = await db.projects.find_one({"id": share["project_id"]}, {"_id": 0})
        if not project or project.get("hidden"):
            raise gone
        client = await db.clients.find_one({"id": project.get("client_id")}, {"_id": 0, "name": 1})
        deliverables = await db.deliverables.find(
            {"project_id": project["id"]},
            {"_id": 0, "name": 1, "type": 1, "current_stage": 1, "stage_status": 1, "end_dt": 1, "created_at": 1},
        ).to_list(2000)
        data = build_share_data(project, (client or {}).get("name") or "", deliverables)
        return (data, share, project) if with_share else data

    @router.get("/projects/{project_id}/share")
    async def get_share(project_id: str, request: Request):
        await sharer(request)
        await load_project(project_id)
        return describe(request, await active_share(project_id))

    @router.post("/projects/{project_id}/share")
    async def start_share(project_id: str, request: Request, payload: Optional[StartShare] = None):
        user = await sharer(request)
        await load_project(project_id)
        app_url = clean_app_url(payload.app_url if payload else None)
        share = await active_share(project_id)
        if not share:
            share = {
                "id": secrets.token_hex(8),
                "token": secrets.token_urlsafe(18),
                "project_id": project_id,
                "created_by": user.id,
                "created_at": now_iso(),
                "revoked": False,
                "app_url": app_url,
            }
            await shares.insert_one(dict(share))
        elif app_url and share.get("app_url") != app_url:
            # The link follows wherever the app is opened from now.
            await shares.update_one({"token": share["token"]}, {"$set": {"app_url": app_url}})
            share = {**share, "app_url": app_url}
        return describe(request, share)

    @router.delete("/projects/{project_id}/share")
    async def stop_share(project_id: str, request: Request):
        await sharer(request)
        await shares.update_many(
            {"project_id": project_id, "revoked": {"$ne": True}},
            {"$set": {"revoked": True, "revoked_at": now_iso()}},
        )
        return {"active": False}

    @router.get("/share/p/{token}", response_class=HTMLResponse)
    async def public_page(token: str, request: Request, v: Optional[str] = None):
        try:
            data, share, _ = await data_for(token, with_share=True)
        except HTTPException:
            return HTMLResponse(
                "<!doctype html><meta charset=utf-8><meta name=robots content=noindex>"
                "<title>Link unavailable</title><body style=\"font:16px system-ui;padding:32px\">"
                "This link is no longer available.</body>",
                status_code=404,
            )
        app_url = share.get("app_url") or clean_app_url(os.environ.get("FRONTEND_URL"))
        if app_url and not is_preview_bot(request.headers.get("user-agent")):
            return RedirectResponse(
                f"{app_url}/share/{token}", status_code=302, headers={"Cache-Control": "no-store"}
            )
        try:
            import PIL  # noqa: F401
            image = preview_url(request, token, int(v) if v and v.isdigit() else 0)
        except ImportError:
            image = None
        page = render_page(data, f"{base_url(request)}/api/share/p/{token}", image)
        return HTMLResponse(page, headers={"Cache-Control": "public, max-age=60"})

    @router.get("/share/p/{token}/preview.png")
    async def public_preview(token: str):
        data = await data_for(token)
        try:
            png = await run_in_threadpool(render_preview_png_cached, data)
        except ImportError:
            raise HTTPException(status_code=404, detail="Preview images are not available")
        return Response(png, media_type="image/png", headers={"Cache-Control": "public, max-age=300"})

    @router.get("/share/p/{token}/data")
    async def public_data(token: str):
        data, _, project = await data_for(token, with_share=True)
        return {**data, "project_id": project["id"], "summary": summary_text(data)}

    return router
