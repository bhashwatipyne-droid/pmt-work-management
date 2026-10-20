"""Sign-in and account routes: login, logout, who am I, edit my profile, and
the forgot / reset password flow with its e-mail sending.

    POST  /auth/login           (throttled; see the login throttle in server.py)
    POST  /auth/logout
    GET   /auth/me
    PATCH /auth/profile
    POST  /auth/forgot-password, /auth/reset-password

Moved out of server.py unchanged. The login throttle and the token helpers stay
in server.py (tests and other code reach them there) and are passed in.
"""
import asyncio  # noqa: F401
import hashlib  # noqa: F401
import os  # noqa: F401
import secrets  # noqa: F401
import smtplib  # noqa: F401
from datetime import datetime, timedelta, timezone  # noqa: F401
from email.message import EmailMessage  # noqa: F401
from email.utils import parseaddr  # noqa: F401
from typing import Optional  # noqa: F401

from fastapi import APIRouter, HTTPException, Request, Response  # noqa: F401
from pydantic import BaseModel  # noqa: F401

import logging

logger = logging.getLogger("server")

# ---------------- Forgot / reset password ----------------
# A reset link is emailed to the address on the account. Only a hash of the
# token is stored, it works once and expires after RESET_TOKEN_MINUTES. The
# response to "forgot password" is always the same, so it never reveals whether
# a username or email exists.
#
# Email goes out over SMTP, configured with environment variables:
#   SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASSWORD, SMTP_FROM,
#   SMTP_STARTTLS (true), and FRONTEND_URL (e.g. https://pmt.example.com) for
#   the link. Some hosts (Render's free plan) block SMTP; there, set
#   BREVO_API_KEY (and EMAIL_FROM = a sender verified in Brevo) to send over
#   HTTPS instead. With neither, nothing is sent: the link is logged.
RESET_TOKEN_MINUTES = 30
RESET_REQUEST_COOLDOWN_SECONDS = 60
PASSWORD_RESETS_PER_DAY = 2
FORGOT_PASSWORD_MESSAGE = (
    "If an account matches, a password reset link has been sent to its email address."
)


def _hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _send_email_sync(to_address: str, subject: str, body: str) -> None:
    host = os.environ.get("SMTP_HOST", "").strip()
    sender = os.environ.get("SMTP_FROM", "").strip() or os.environ.get("SMTP_USER", "").strip()
    message = EmailMessage()
    message["To"] = to_address
    message["From"] = sender
    message["Subject"] = subject
    message.set_content(body)

    port = int(os.environ.get("SMTP_PORT", "587"))
    starttls = os.environ.get("SMTP_STARTTLS", "true").strip().lower() != "false"
    with smtplib.SMTP(host, port, timeout=15) as smtp:
        if starttls:
            smtp.starttls()
        username = os.environ.get("SMTP_USER", "").strip()
        if username:
            smtp.login(username, os.environ.get("SMTP_PASSWORD", ""))
        smtp.send_message(message)


def _sender_parts() -> tuple:
    """(display name, address) of the "from" identity, from SMTP_FROM / EMAIL_FROM."""
    raw = (
        os.environ.get("EMAIL_FROM", "").strip()
        or os.environ.get("SMTP_FROM", "").strip()
        or os.environ.get("SMTP_USER", "").strip()
    )
    name, address = parseaddr(raw)
    return name or "PMT", address


async def _send_email_brevo(to_address: str, subject: str, body: str) -> None:
    """Send over Brevo's HTTPS API. Unlike SMTP this works on hosts that block
    outbound mail ports (Render's free plan does). Needs BREVO_API_KEY and a
    sender address verified in Brevo (EMAIL_FROM)."""
    import httpx

    name, address = _sender_parts()
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={
                "api-key": os.environ["BREVO_API_KEY"].strip(),
                "accept": "application/json",
                "content-type": "application/json",
            },
            json={
                "sender": {"name": name, "email": address},
                "to": [{"email": to_address}],
                "subject": subject,
                "textContent": body,
            },
        )
        response.raise_for_status()


async def _deliver_email(to_address: str, subject: str, body: str, fallback_note: str = "") -> None:
    """Send with Brevo when BREVO_API_KEY is set, else SMTP when SMTP_HOST is
    set, else just log. Never raises - a failed send is logged."""
    try:
        if os.environ.get("BREVO_API_KEY", "").strip():
            await _send_email_brevo(to_address, subject, body)
        elif os.environ.get("SMTP_HOST", "").strip():
            await asyncio.to_thread(_send_email_sync, to_address, subject, body)
        else:
            logger.warning("No email provider configured (BREVO_API_KEY or SMTP_HOST). %s", fallback_note)
    except Exception:
        logger.exception("Could not send the email %r to %s", subject, to_address)


# Keeps references to in-flight background sends so they are not garbage-collected.
_background_sends: set = set()


class ForgotPasswordPayload(BaseModel):
    login: str


class ResetPasswordPayload(BaseModel):
    token: str
    new_password: str


class ProfileUpdatePayload(BaseModel):
    username: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None


def create_auth_router(
    db,
    verify_password,
    hash_password,
    get_acting_user,
    create_access_token,
    _record_login_failure,
    _login_fails,
    _invalidate_cached_user,
    _client_ip,
    _check_login_throttle,
    LoginPayload,
    LoginResponse,
    User,
    ACCESS_TOKEN_HOURS,
) -> APIRouter:
    router = APIRouter()

    @router.post("/auth/login", response_model=LoginResponse)
    async def login(payload: LoginPayload, request: Request, response: Response):
        login = payload.login.strip().lower()
        ip = _client_ip(request)
        _check_login_throttle(ip, login)
        doc = await db.users.find_one(
            {
                "$or": [
                    {"username": login},
                    {"email": login},
                ]
            },
            {"_id": 0},
        )
        if not doc or not verify_password(payload.password, doc.get("password_hash", "")):
            _record_login_failure(ip, login)
            raise HTTPException(status_code=401, detail="Invalid username or password")
        if not doc.get("active", True):
            raise HTTPException(status_code=403, detail="Account deactivated")
        _login_fails.pop(f"login:{ip}:{login}", None)
        token = create_access_token(doc["id"])
        response.set_cookie(
            key="access_token",
            value=token,
            httponly=True,
            secure=True,
            samesite="none",
            max_age=ACCESS_TOKEN_HOURS * 3600,
            path="/",
        )
        return LoginResponse(**doc, access_token=token)


    @router.post("/auth/forgot-password")
    async def forgot_password(payload: ForgotPasswordPayload, request: Request):
        login = payload.login.strip().lower()
        if not login:
            return {"message": FORGOT_PASSWORD_MESSAGE}

        doc = await db.users.find_one(
            {"$or": [{"username": login}, {"email": login}]},
            {"_id": 0, "id": 1, "name": 1, "email": 1, "active": 1},
        )
        email = (doc or {}).get("email") or ""
        if not doc or not doc.get("active", True) or not email:
            return {"message": FORGOT_PASSWORD_MESSAGE}

        now = datetime.now(timezone.utc)
        recent = await db.password_resets.find_one(
            {
                "user_id": doc["id"],
                "created_at": {"$gt": (now - timedelta(seconds=RESET_REQUEST_COOLDOWN_SECONDS)).isoformat()},
            },
            {"_id": 0, "user_id": 1},
        )
        if recent:
            return {"message": FORGOT_PASSWORD_MESSAGE}

        token = secrets.token_urlsafe(32)
        await db.password_resets.delete_many({"user_id": doc["id"]})
        await db.password_resets.insert_one({
            "token_hash": _hash_reset_token(token),
            "user_id": doc["id"],
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(minutes=RESET_TOKEN_MINUTES)).isoformat(),
        })

        base = (os.environ.get("FRONTEND_URL", "") or request.headers.get("origin", "")).rstrip("/")
        link = f"{base}/?reset_token={token}"
        body = (
            f"Hi {doc.get('name') or ''},\n\n"
            "We received a request to reset your PMT password. Use the link below to choose a new one. "
            f"It works once and expires in {RESET_TOKEN_MINUTES} minutes.\n\n"
            f"{link}\n\n"
            "If you did not ask for this, you can ignore this email - your password has not changed."
        )

        # Sent in the background so the request answers at once (a slow or blocked
        # mail server must not leave the person waiting, or make the response time
        # reveal whether the account exists).
        task = asyncio.create_task(
            _deliver_email(
                email,
                "Reset your PMT password",
                body,
                fallback_note=f"Reset link for {email}: {link}",
            )
        )
        _background_sends.add(task)
        task.add_done_callback(_background_sends.discard)

        return {"message": FORGOT_PASSWORD_MESSAGE}


    @router.post("/auth/reset-password")
    async def reset_password(payload: ResetPasswordPayload):
        if len(payload.new_password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

        record = await db.password_resets.find_one(
            {"token_hash": _hash_reset_token(payload.token.strip())},
            {"_id": 0},
        )
        if not record or record.get("expires_at", "") < datetime.now(timezone.utc).isoformat():
            raise HTTPException(
                status_code=400,
                detail="This reset link is invalid or has expired. Request a new one.",
            )

        user = await db.users.find_one(
            {"id": record["user_id"]},
            {"_id": 0, "password_hash": 1, "password_changes": 1},
        ) or {}

        # The new password must differ from the current one.
        if user.get("password_hash") and verify_password(payload.new_password, user["password_hash"]):
            raise HTTPException(
                status_code=400,
                detail="Your new password must be different from your previous password.",
            )

        # At most PASSWORD_RESETS_PER_DAY resets in any rolling 24 hours.
        now = datetime.now(timezone.utc)
        cutoff = (now - timedelta(hours=24)).isoformat()
        recent_changes = [t for t in (user.get("password_changes") or []) if t > cutoff]
        if len(recent_changes) >= PASSWORD_RESETS_PER_DAY:
            raise HTTPException(
                status_code=429,
                detail=f"You can reset your password at most {PASSWORD_RESETS_PER_DAY} times a day. Try again later.",
            )

        await db.users.update_one(
            {"id": record["user_id"]},
            {"$set": {
                "password_hash": hash_password(payload.new_password),
                "password_changes": recent_changes + [now.isoformat()],
            }},
        )
        # One use only - and any other pending link for the account goes with it.
        await db.password_resets.delete_many({"user_id": record["user_id"]})
        return {"message": "Password updated. You can sign in now."}


    @router.post("/auth/logout")
    async def logout(response: Response):
        response.delete_cookie(key="access_token", path="/")
        return {"message": "Logged out"}


    @router.get("/auth/me", response_model=User)
    async def me(request: Request):
        return await get_acting_user(request)




    @router.patch("/auth/profile", response_model=User)
    async def update_own_profile(payload: ProfileUpdatePayload, request: Request):
        user = await get_acting_user(request)
        update_fields = {}

        if payload.username is not None:
            username = payload.username.strip().lower()

            if not username:
                raise HTTPException(status_code=400, detail="Username required")

            existing_username = await db.users.find_one(
                {"username": username, "id": {"$ne": user.id}}
            )

            if existing_username:
                raise HTTPException(status_code=400, detail="Username already exists")

            update_fields["username"] = username

        if payload.new_password is not None:
            doc = await db.users.find_one({"id": user.id}, {"_id": 0})

            if not verify_password(payload.current_password or "", doc.get("password_hash", "")):
                raise HTTPException(status_code=400, detail="Current password is incorrect")

            if len(payload.new_password) < 8:
                raise HTTPException(
                    status_code=400,
                    detail="Password must be at least 8 characters",
                )

            update_fields["password_hash"] = hash_password(payload.new_password)

        if not update_fields:
            raise HTTPException(status_code=400, detail="Nothing to update")

        await db.users.update_one({"id": user.id}, {"$set": update_fields})
        _invalidate_cached_user(user.id)

        updated = await db.users.find_one({"id": user.id}, {"_id": 0})
        return User(**updated)

    return router
