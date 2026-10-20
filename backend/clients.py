"""Clients and their contact persons.

Routes (all need a logged-in user; changes need an admin):
    GET    /clients
    POST   /clients
    PATCH  /clients/{id}
    DELETE /clients/{id}            refused while the client has an unfinished project
    POST   /clients/{id}/contacts
    PATCH  /clients/{id}/contacts/{contact_id}
    DELETE /clients/{id}/contacts/{contact_id}   refused while a project uses the contact

Moved out of server.py unchanged; built with a factory like planning.py so the
database and the login helpers are passed in rather than imported.
"""
import re
import uuid
from typing import Awaitable, Callable, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

try:
    from domain_constants import CLIENT_STATUSES
except ImportError:  # run as backend.server from the repo root
    from backend.domain_constants import CLIENT_STATUSES


class Client(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"client-{uuid.uuid4().hex[:8]}")
    name: str
    # Legacy field - kept temporarily for backward compatibility
    contact_person: str = ""
    # New multiple-contact structure
    contact_persons: List[dict] = Field(default_factory=list)
    status: str = "Active"


class ClientCreate(BaseModel):
    name: str
    # Legacy field - kept temporarily for backward compatibility
    contact_person: Optional[str] = ""
    # New multiple-contact structure
    contact_persons: Optional[List[dict]] = Field(default_factory=list)
    status: Optional[str] = "Active"


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    # Legacy field - kept temporarily for backward compatibility
    contact_person: Optional[str] = None
    # New multiple-contact structure
    contact_persons: Optional[List[dict]] = None
    status: Optional[str] = None


_PHONE_ALLOWED_RE = re.compile(r"^\+?[0-9\s\-()]+$")


def validate_contact_phone(phone: Optional[str]) -> str:
    """Return the trimmed phone number, or raise 400 if it is not a plausible
    one: digits with an optional leading +, spaces/dashes/brackets allowed,
    7-15 digits in all. Empty is fine - phone is optional."""
    text = (phone or "").strip()
    if not text:
        return ""
    digits = re.sub(r"\D", "", text)
    if not _PHONE_ALLOWED_RE.match(text) or not 7 <= len(digits) <= 15:
        raise HTTPException(
            status_code=400,
            detail="Enter a valid phone number (7-15 digits; only numbers, +, spaces, - and brackets)",
        )
    return text


class ContactPersonCreate(BaseModel):
    name: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    designation: Optional[str] = ""


class ContactPersonUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    designation: Optional[str] = None


def create_clients_router(
    db,
    get_acting_user: Callable[..., Awaitable],
    require_admin: Callable[..., Awaitable],
    log_activity: Callable[..., Awaitable],
) -> APIRouter:
    router = APIRouter()

    @router.get("/clients", response_model=List[Client])
    async def list_clients(request: Request):
        await get_acting_user(request)
        return await db.clients.find({}, {"_id": 0}).sort("name", 1).to_list(None)


    @router.post("/clients", response_model=Client)
    async def create_client(payload: ClientCreate, request: Request):
        await require_admin(request)
        c = Client(**payload.model_dump())
        await db.clients.insert_one(c.model_dump())
        return c


    @router.patch("/clients/{client_id}", response_model=Client)
    async def update_client(client_id: str, payload: ClientUpdate, request: Request):
        await require_admin(request)
        existing = await db.clients.find_one({"id": client_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Client not found")
        update_fields = payload.model_dump(exclude_unset=True)
        if "status" in update_fields and update_fields["status"] not in CLIENT_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid client status")
        await db.clients.update_one({"id": client_id}, {"$set": update_fields})
        return Client(**{**existing, **update_fields})


    @router.delete("/clients/{client_id}")
    async def delete_client(
        client_id: str,
        request: Request
    ):
        user = await require_admin(request)

        client = await db.clients.find_one(
            {"id": client_id},
            {"_id": 0}
        )

        if not client:
            raise HTTPException(
                status_code=404,
                detail="Client not found"
            )

        # Do not allow deletion while the client has active projects.
        active_projects = await db.projects.find(
            {
                "client_id": client_id,
                "status": {"$ne": "Completed"},
            },
            {
                "_id": 0,
                "id": 1,
                "name": 1,
                "code": 1,
                "status": 1,
            },
        ).to_list(100)

        if active_projects:
            raise HTTPException(
                status_code=400,
                detail="This client has active projects. Complete them before deleting the client."
            )

        # Preserve completed projects and ALL historical work entries.
        # Only detach completed projects from this client.
        await db.projects.update_many(
            {"client_id": client_id},
            {
                "$set": {
                    "client_id": None,
                    "poc_id": None,
                }
            },
        )

        await db.clients.delete_one(
            {"id": client_id}
        )

        await log_activity(
            collection_name="project_activity_log",
            entity_id=client_id,
            entity_field="client_id",
            action="CLIENT_DELETED",
            changed_by=user.id,
            old_value={
                "name": client.get("name"),
                "status": client.get("status"),
                "contact_persons": client.get("contact_persons") or [],
            },
        )

        return {"success": True}


    @router.post("/clients/{client_id}/contacts")
    async def create_contact_person(
        client_id: str,
        payload: ContactPersonCreate,
        request: Request
    ):
        await require_admin(request)

        client = await db.clients.find_one(
            {"id": client_id},
            {"_id": 0}
        )

        if not client:
            raise HTTPException(
                status_code=404,
                detail="Client not found"
            )

        if not payload.name.strip():
            raise HTTPException(
                status_code=400,
                detail="Contact name is required"
            )

        contact = {
            "id": f"contact-{uuid.uuid4().hex[:8]}",
            "name": payload.name.strip(),
            "email": (payload.email or "").strip(),
            "phone": validate_contact_phone(payload.phone),
            "designation": (payload.designation or "").strip(),
        }

        existing_contacts = client.get("contact_persons") or []

        await db.clients.update_one(
            {"id": client_id},
            {
                "$push": {
                    "contact_persons": contact
                }
            }
        )

        return contact


    @router.patch("/clients/{client_id}/contacts/{contact_id}")
    async def update_contact_person(
        client_id: str,
        contact_id: str,
        payload: ContactPersonUpdate,
        request: Request
    ):
        await require_admin(request)

        client = await db.clients.find_one(
            {"id": client_id},
            {"_id": 0}
        )

        if not client:
            raise HTTPException(
                status_code=404,
                detail="Client not found"
            )

        contacts = client.get("contact_persons") or []

        contact = next(
            (c for c in contacts if c.get("id") == contact_id),
            None
        )

        if not contact:
            raise HTTPException(
                status_code=404,
                detail="Contact person not found"
            )

        update_fields = payload.model_dump(exclude_unset=True)

        if "name" in update_fields:
            if not update_fields["name"].strip():
                raise HTTPException(
                    status_code=400,
                    detail="Contact name is required"
                )
            update_fields["name"] = update_fields["name"].strip()

        for field in ["email", "phone", "designation"]:
            if field in update_fields and update_fields[field] is not None:
                update_fields[field] = update_fields[field].strip()

        if update_fields.get("phone"):
            update_fields["phone"] = validate_contact_phone(update_fields["phone"])

        for field, value in update_fields.items():
            await db.clients.update_one(
                {
                    "id": client_id,
                    "contact_persons.id": contact_id
                },
                {
                    "$set": {
                        f"contact_persons.$.{field}": value
                    }
                }
            )

        updated_client = await db.clients.find_one(
            {"id": client_id},
            {"_id": 0}
        )

        updated_contact = next(
            c for c in updated_client.get("contact_persons", [])
            if c.get("id") == contact_id
        )

        return updated_contact


    @router.delete("/clients/{client_id}/contacts/{contact_id}")
    async def delete_contact_person(
        client_id: str,
        contact_id: str,
        request: Request
    ):
        await require_admin(request)

        client = await db.clients.find_one(
            {"id": client_id},
            {"_id": 0}
        )

        if not client:
            raise HTTPException(
                status_code=404,
                detail="Client not found"
            )

        contacts = client.get("contact_persons") or []

        if not any(c.get("id") == contact_id for c in contacts):
            raise HTTPException(
                status_code=404,
                detail="Contact person not found"
            )

        # Don't allow deletion if a project is currently using this POC.
        project_using_contact = await db.projects.find_one(
            {"poc_id": contact_id},
            {"_id": 0}
        )

        if project_using_contact:
            raise HTTPException(
                status_code=400,
                detail="This contact is assigned to a project. Reassign the project before deleting the contact."
            )

        await db.clients.update_one(
            {"id": client_id},
            {
                "$pull": {
                    "contact_persons": {
                        "id": contact_id
                    }
                }
            }
        )

        return {"message": "Contact person deleted"}

    return router
