"""Approvals: the review queue, the board, and approving / moving / hiding items.

    GET  /bulk-review, /bulk-review/count          manager queue
    GET  /approvals, /approvals/pending-count, /approvals/board
    GET  /deliverables/{id}/approvals
    PUT  /deliverables/{id}/approval-workflow       admin: choose approval types
    POST /approval-items/{id}/approve | /bulk-approve
    PATCH /approval-items/{id}/move
    POST /approval-items/{id}/hide | /unhide | /bulk-hide | /bulk-unhide
    POST /deliverables/{id}/approve

Moved out of server.py unchanged. The workflow helpers (create / sync /
complete) and the stage-handoff notifier stay in server.py because the
deliverable routes and the Work Sheet share them; they are passed in.
"""
import asyncio  # noqa: F401
import uuid  # noqa: F401
from typing import List, Optional  # noqa: F401

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field  # noqa: F401


class ApprovalBulkDecision(BaseModel):
    ids: List[str] = Field(default_factory=list)
    note: Optional[str] = ""


def create_approvals_router(
    db,
    get_acting_user,
    require_admin,
    log_activity,
    cached_read,
    logger,
    require_approver,
    _approvals_view_all,
    _approval_item_can_act,
    _member_can_view_approval,
    _hydrate_approval_items,
    _create_or_sync_approval_workflow,
    _get_approval_workflow,
    _notify_stage_handoff_safe,
    BulkApprovalItemIdsPayload,
    ApprovalDecision,
    APPROVAL_TYPES,
    ANY_MANAGER_APPROVAL_TYPES,
    next_selected_stage,
    _set_approval_items_pending,
    _member_approval_stage,
    _fire_and_forget,
    _complete_approval_workflow,
    ApprovalWorkflowCreate,
    ApprovalMove,
    User,
    now_iso,
) -> APIRouter:
    router = APIRouter()

    @router.get("/bulk-review/count")
    async def bulk_review_count(request: Request):
        """Lightweight count for the Bulk Review button's badge — same scoping
        as GET /bulk-review, without fetching/hydrating the actual rows."""
        user = await get_acting_user(request)

        if user.role not in ("admin", "manager"):
            return {"count": 0}

        # Managers and admins only see work explicitly assigned to them as reviewer.
        query = {"status": "Ready for Review", "reviewer_id": user.id}

        async def compute():
            return {"count": await db.work_items.count_documents(query)}

        return await cached_read(f"bulk-review-count:{user.id}", compute)


    @router.get("/bulk-review")
    async def list_bulk_review(request: Request):
        """Work items assigned to the logged-in manager or admin and ready for review."""
        user = await get_acting_user(request)

        if user.role not in ("admin", "manager"):
            raise HTTPException(
                status_code=403,
                detail="Only admin or manager can access bulk review"
            )

        # Managers and admins only see work explicitly assigned to them as the
        # reviewer (members often pick an admin as reviewer).
        query = {
            "status": "Ready for Review",
            "reviewer_id": user.id,
        }

        items = await db.work_items.find(
            query,
            {"_id": 0}
        ).sort("updated_at", -1).to_list(500)

        project_ids = list({
            item["project_id"]
            for item in items
            if item.get("project_id")
        })

        projects = {
            p["id"]: p
            for p in await db.projects.find(
                {"id": {"$in": project_ids}},
                {"_id": 0}
            ).to_list(500)
        }

        users = {
            u["id"]: u
            for u in await db.users.find(
                {},
                {"_id": 0}
            ).to_list(500)
        }

        clients = {
            c["id"]: c
            for c in await db.clients.find(
                {},
                {"_id": 0}
            ).to_list(500)
        }

        # Deadline of the stage each row is in (falls back to the deliverable's
        # overall end date), so the review list can show who is overdue.
        deliverable_ids = list({
            item["deliverable_id"]
            for item in items
            if item.get("deliverable_id")
        })
        deliverables = {
            d["id"]: d
            for d in await db.deliverables.find(
                {"id": {"$in": deliverable_ids}},
                {"_id": 0, "id": 1, "stage_schedule": 1, "end_dt": 1},
            ).to_list(len(deliverable_ids) or 1)
        }

        result = []

        for item in items:
            project = projects.get(item.get("project_id") or "") or {}
            creator = users.get(item.get("creator_id") or "") or {}
            reviewer = users.get(item.get("reviewer_id") or "") or {}
            client = clients.get(project.get("client_id") or "") or {}
            deliverable = deliverables.get(item.get("deliverable_id") or "") or {}
            stage_window = (deliverable.get("stage_schedule") or {}).get(item.get("stage")) or {}

            result.append({
                **item,
                "due_date": stage_window.get("end_dt") or deliverable.get("end_dt"),
                "project_name": project.get("name", ""),
                "project_code": project.get("code", ""),
                "client_name": client.get("name", ""),
                "creator_name": creator.get("name", "Unknown"),
                "reviewer_name": reviewer.get("name", "Unassigned"),
            })

        return result


    async def _build_implicit_manager_items(user: User, count_only: bool = False):
        """Build manager approvals for ready deliverables without workflows.

        ``count_only=True`` is for the sidebar badge: it needs how many items
        there are, not their contents, so only the two fields the filtering looks
        at are read (whole deliverable documents were being pulled on every poll).
        """

        if user.role not in ("admin", "manager", "member"):
            return []

        # Fetch ready deliverables once.
        ready = await db.deliverables.find(
            {"stage_status": "Ready for Review"},
            {"_id": 0, "id": 1, "current_stage": 1} if count_only else {"_id": 0},
        ).sort(
            "updated_at",
            -1,
        ).to_list(500)

        if not ready:
            return []

        deliverable_ids = [d["id"] for d in ready]

        # Fetch all existing workflows in ONE query.
        workflows = await db.approval_workflows.find(
            {"deliverable_id": {"$in": deliverable_ids}},
            {"_id": 0, "deliverable_id": 1},
        ).to_list(len(deliverable_ids))

        workflow_deliverable_ids = {
            w["deliverable_id"]
            for w in workflows
            if w.get("deliverable_id")
        }

        candidates = [
            d
            for d in ready
            if d["id"] not in workflow_deliverable_ids
        ]

        # Managers only see approvals for their production stage.
        if user.role == "manager":
            stage_to_department = {
                "Content": "Content",
                "Design": "Design",
                "Animate": "Animation",
            }

            candidates = [
                d
                for d in candidates
                if stage_to_department.get(d.get("current_stage")) == user.department
            ]

        candidates = [d for d in candidates if _member_can_view_approval(user, d)]

        return [
            {
                "id": f"implicit-manager-{d['id']}",
                "approval_workflow_id": None,
                "deliverable_id": d["id"],
                "approval_type": "MANAGER",
                "status": "PENDING",
                "assigned_to": None,
                "department": user.department,
                "requested_at": d.get("updated_at"),
                "approved_at": None,
                "sent_back_at": None,
                "approved_by": None,
                "sent_back_by": None,
                "comments": "",
                "hidden": False,
                "hidden_at": None,
                "hidden_by": None,
                "created_at": d.get("created_at"),
                "updated_at": d.get("updated_at"),
            }
            for d in candidates
        ]
    @router.get("/approvals")
    async def list_approvals(request: Request):
        """Return actionable approval items."""

        user = await get_acting_user(request)

        query = {"status": "PENDING"}

        if not _approvals_view_all(user):
            query["$or"] = [
                {"assigned_to": user.id},
                {
                    "approval_type": "MANAGER",
                    "assigned_to": None,
                },
                {
                    "approval_type": {"$in": ANY_MANAGER_APPROVAL_TYPES},
                    "assigned_to": None,
                },
            ]

        items = await db.approval_items.find(
            query,
            {"_id": 0},
        ).sort(
            "updated_at",
            -1,
        ).to_list(500)

        implicit_items = await _build_implicit_manager_items(user)
        items.extend(implicit_items)

        hydrated = await _hydrate_approval_items(items)

        # Admins and members can see all approval items (read-only).
        # No permission query is required for every item.
        if _approvals_view_all(user):
            visible = [
                item for item in hydrated
                if _member_can_view_approval(user, item.get("_deliverable"))
            ]
            for item in visible:
                item.pop("_deliverable", None)
            return visible

        # For managers, permission checks are still required,
        # but deliverables are already available from hydration.
        result = []

        for item in hydrated:
            deliverable = item.get("_deliverable")

            if deliverable and await _approval_item_can_act(
                user,
                item,
                deliverable,
            ):
                result.append(item)

        for item in result:
            item.pop("_deliverable", None)

        return result


    def _approval_visibility_query(user: User, visibility: str) -> dict:
        """The Mongo filter behind what a user's Approvals board may contain.
        Shared by the board and the sidebar badge so the two cannot drift."""
        query = {"status": "PENDING"}
        clauses = []

        if visibility == "visible":
            clauses.append({"$or": [{"hidden": False}, {"hidden": {"$exists": False}}]})
        elif visibility == "hidden":
            query["hidden"] = True
        elif visibility == "all":
            pass
        else:
            raise HTTPException(status_code=400, detail="Invalid visibility")

        if not _approvals_view_all(user):
            clauses.append({
                "$or": [
                    {"assigned_to": user.id},
                    {
                        "approval_type": "MANAGER",
                        "assigned_to": None,
                    },
                    {
                        "approval_type": {"$in": ANY_MANAGER_APPROVAL_TYPES},
                        "assigned_to": None,
                    },
                ]
            })

        if clauses:
            query["$and"] = clauses

        return query


    @router.get("/approvals/pending-count")
    async def approval_pending_count(request: Request):
        """Count for the sidebar's Approvals badge.

        This must equal the number of cards GET /approvals/board would show for
        the same user. The Mongo query alone is only a coarse pre-filter: a
        manager's MANAGER approvals are further restricted to deliverables that
        are currently in their own department's stage (_approval_item_can_act).
        Counting without that check made the badge show approvals the manager
        could never see on their board - the "count says N, board shows fewer"
        mismatch - so each candidate is now run through the same check, using
        one batched deliverable lookup instead of full board hydration."""
        user = await get_acting_user(request)

        # Heaviest call the sidebar polls, and a person's own actions drop the cache
        # (see read_cache.bump), so the badge still updates the moment they act.
        return await cached_read(
            f"approvals-pending:{user.id}", lambda: _approval_pending_count(user)
        )


    async def _approval_pending_count(user: User) -> dict:
        query = _approval_visibility_query(user, "visible")

        async def explicit_count() -> int:
            if _approvals_view_all(user) and _member_approval_stage(user) is None:
                # Nothing to check per item, so the database can just count (still
                # capped at the 500 the board itself loads).
                return await db.approval_items.count_documents(query, limit=500)

            # Only the fields the per-item check reads, not whole documents.
            items = await db.approval_items.find(
                query,
                {"_id": 0, "deliverable_id": 1, "assigned_to": 1, "approval_type": 1},
            ).to_list(500)

            deliverable_ids = list({
                item.get("deliverable_id")
                for item in items
                if item.get("deliverable_id")
            })
            deliverables = {
                d["id"]: d
                for d in await db.deliverables.find(
                    {"id": {"$in": deliverable_ids}},
                    {"_id": 0, "id": 1, "current_stage": 1},
                ).to_list(len(deliverable_ids) or 1)
            }

            count = 0
            for item in items:
                deliverable = deliverables.get(item.get("deliverable_id"))
                if not deliverable:
                    continue
                if _approvals_view_all(user):
                    if _member_can_view_approval(user, deliverable):
                        count += 1
                elif await _approval_item_can_act(user, item, deliverable):
                    count += 1
            return count

        # Implicit manager approvals (ready deliverables with no workflow yet)
        # aren't real documents, so they can't be counted with the query above -
        # _build_implicit_manager_items already scopes them to the user (and to
        # the manager's own stage) in batched queries, same as the board. The two
        # parts don't depend on each other, so they run together.
        explicit, implicit = await asyncio.gather(
            explicit_count(),
            _build_implicit_manager_items(user, count_only=True),
        )

        return {"count": explicit + len(implicit)}


    @router.get("/approvals/board")
    async def approval_board(request: Request, visibility: Optional[str] = "visible"):
        """Return pending approval cards grouped by approval authority."""

        user = await get_acting_user(request)

        query = _approval_visibility_query(user, visibility)

        items = await db.approval_items.find(
            query,
            {"_id": 0},
        ).sort(
            "updated_at",
            -1,
        ).to_list(500)

        # Build implicit manager approvals efficiently. These have no real
        # document backing them, so they're always effectively "visible" —
        # excluded whenever the requested visibility is "hidden".
        if visibility != "hidden":
            items.extend(
                (await _build_implicit_manager_items(user))[:200]
            )

        hydrated = await _hydrate_approval_items(items)

        result = {
            key: []
            for key in APPROVAL_TYPES
        }

        for item in hydrated:
            deliverable = item.get("_deliverable")

            if _approvals_view_all(user):
                allowed = _member_can_view_approval(user, deliverable)
            else:
                allowed = (
                    deliverable
                    and await _approval_item_can_act(
                        user,
                        item,
                        deliverable,
                    )
                )

            if allowed:
                result[item["approval_type"]].append(item)

        # Remove internal hydration field.
        for key in result:
            for item in result[key]:
                item.pop("_deliverable", None)

        return result


    @router.get("/deliverables/{deliverable_id}/approvals")
    async def get_deliverable_approvals(deliverable_id: str, request: Request):
        await get_acting_user(request)
        d = await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})
        if not d:
            raise HTTPException(status_code=404, detail="Deliverable not found")
        workflow = await _get_approval_workflow(deliverable_id)
        if not workflow:
            return {"workflow": None, "items": []}
        items = await db.approval_items.find(
            {"approval_workflow_id": workflow["id"]}, {"_id": 0}
        ).sort("created_at", 1).to_list(50)
        return {"workflow": workflow, "items": await _hydrate_approval_items(items)}


    @router.put("/deliverables/{deliverable_id}/approval-workflow")
    async def configure_approval_workflow(deliverable_id: str, payload: ApprovalWorkflowCreate, request: Request):
        user = await require_admin(request)
        d = await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})
        if not d:
            raise HTTPException(status_code=404, detail="Deliverable not found")
        workflow = await _create_or_sync_approval_workflow(d, payload.approval_types, user.id)
        await log_activity(
            collection_name="deliverable_activity_log",
            entity_id=deliverable_id,
            entity_field="deliverable_id",
            action="APPROVAL_WORKFLOW_CONFIGURED",
            changed_by=user.id,
            new_value={"approval_types": payload.approval_types},
        )
        return await get_deliverable_approvals(deliverable_id, request)


    async def advance_deliverable_stage(
        deliverable: dict,
        reviewer_id: str,
        note: str,
        notify_in_background: bool = False,
    ):
        ts = now_iso()

        required_stages = (
            deliverable.get("required_stages")
            or [deliverable.get("current_stage", "Content")]
        )

        current_stage = deliverable.get(
            "current_stage",
            required_stages[0],
        )

        next_stage = next_selected_stage(
            current_stage,
            required_stages,
        )

        if next_stage:
            # The deliverable is handed to the next stage's team. A brand-new
            # deliverable starts life as "Ready for Review" on its first stage
            # (see create_project / create_deliverable), which is what puts its
            # approval card on the reviewing manager's board. The hand-off must
            # do the same for the next stage - previously it was set to
            # "Not Started", and nothing in the app ever moves a deliverable back
            # to "Ready for Review" (members cannot, and the admin edit modal
            # shows stage status read-only), so the next stage's approval never
            # appeared on that team's Kanban.
            update = {
                "current_stage": next_stage,
                "stage_status": "Ready for Review",
                "last_review_action": "approved",
                "last_reviewer_id": reviewer_id,
                "last_review_note": note,
                "updated_at": ts,
            }
        else:
            update = {
                "stage_status": "Completed",
                "last_review_action": "approved",
                "last_reviewer_id": reviewer_id,
                "last_review_note": note,
                "updated_at": ts,
            }

        await db.deliverables.update_one(
            {"id": deliverable["id"]},
            {"$set": update},
        )

        workflow = await _get_approval_workflow(
            deliverable["id"]
        )

        if workflow:
            if next_stage:
                # Open a fresh review round for the next stage: every approval
                # authority on this deliverable goes back to PENDING (and is
                # un-hidden) so it shows on the next stage's board.
                await _set_approval_items_pending(deliverable["id"])
            else:
                # Final stage approved: nothing is left to review.
                await _complete_approval_workflow(deliverable["id"])

        updated = await db.deliverables.find_one(
            {"id": deliverable["id"]},
            {"_id": 0},
        )

        if next_stage and updated:
            if notify_in_background:
                # Bulk approvals: don't make the reviewer wait on the
                # notification writes for every deliverable.
                _fire_and_forget(_notify_stage_handoff_safe(updated, next_stage, ts))
            else:
                await _notify_stage_handoff_safe(updated, next_stage, ts)

        return updated


    async def _load_approvable_item(user: User, approval_item_id: str, preloaded: Optional[dict] = None):
        """Fetch an approval item (or the synthetic implicit-manager one) plus its
        deliverable and run the checks every approve path shares. Raises
        HTTPException exactly like the single-item endpoint always did."""
        item = await db.approval_items.find_one({"id": approval_item_id}, {"_id": 0})
        if not item and approval_item_id.startswith("implicit-manager-"):
            deliverable_id = approval_item_id.removeprefix("implicit-manager-")
            item = {"id": approval_item_id, "deliverable_id": deliverable_id, "approval_type": "MANAGER", "status": "PENDING", "assigned_to": None, "department": user.department}
        if not item:
            raise HTTPException(status_code=404, detail="Approval item not found")
        d = (preloaded or {}).get(item["deliverable_id"]) or await db.deliverables.find_one({"id": item["deliverable_id"]}, {"_id": 0})
        if not d:
            raise HTTPException(status_code=404, detail="Deliverable not found")
        if item.get("status") != "PENDING":
            raise HTTPException(status_code=400, detail="This approval is not pending")
        if not await _approval_item_can_act(user, item, d):
            raise HTTPException(status_code=403, detail="You are not authorized to approve this item")
        return item, d


    async def _apply_approval(user: User, item: dict, d: dict, note: str, notify_in_background: bool = False):
        """Record one approval and advance the deliverable if nothing else is
        pending. Returns the deliverable id. Does NOT build the heavy response."""
        ts = now_iso()
        approval_item_id = item["id"]
        if item.get("approval_workflow_id") is None:
            await advance_deliverable_stage(d, user.id, note, notify_in_background)
        else:
            # Only flip an item that is still PENDING so a duplicate/parallel
            # request cannot approve (and advance the stage) twice.
            res = await db.approval_items.update_one(
                {"id": approval_item_id, "status": "PENDING"},
                {"$set": {"status": "APPROVED", "approved_by": user.id, "approved_at": ts, "comments": note, "updated_at": ts}},
            )
            if res.modified_count == 0:
                raise HTTPException(status_code=400, detail="This approval is not pending")
            pending = await db.approval_items.count_documents(
                {"approval_workflow_id": item["approval_workflow_id"], "status": "PENDING"}
            )
            if pending == 0:
                await advance_deliverable_stage(d, user.id, note, notify_in_background)
        await db.approval_history.insert_one({
            "id": str(uuid.uuid4()), "approval_item_id": approval_item_id,
            "deliverable_id": d["id"], "action": "APPROVED", "performed_by": user.id,
            "comment": note, "created_at": ts,
        })
        return d["id"]


    @router.post("/approval-items/{approval_item_id}/approve")
    async def approve_approval_item(approval_item_id: str, payload: ApprovalDecision, request: Request):
        user = await require_approver(request)
        item, d = await _load_approvable_item(user, approval_item_id)
        await _apply_approval(user, item, d, payload.note or "")
        return await get_deliverable_approvals(d["id"], request)




    @router.post("/approval-items/bulk-approve")
    async def bulk_approve_approval_items(payload: ApprovalBulkDecision, request: Request):
        """Approve many items in one request.

        The browser used to fire one POST per card in parallel. Each of those paid
        its own auth lookup, ran the stage hand-off and then rebuilt the full
        approvals payload for the deliverable, and two cards of the same
        deliverable could race each other and advance the stage twice. Here the
        items are de-duplicated, grouped by deliverable (processed one after the
        other so the "nothing pending -> advance" check is reliable) and
        different deliverables run with a small concurrency limit.
        """
        user = await require_approver(request)
        ids = list(dict.fromkeys(i for i in payload.ids if i))[:500]
        if not ids:
            return {"approved": [], "failed": []}
        note = payload.note or ""

        real_ids = [i for i in ids if not i.startswith("implicit-manager-")]
        found = {
            x["id"]: x
            for x in await db.approval_items.find({"id": {"$in": real_ids}}, {"_id": 0}).to_list(len(real_ids) or 1)
        } if real_ids else {}

        def deliverable_of(item_id: str):
            if item_id in found:
                return found[item_id].get("deliverable_id")
            if item_id.startswith("implicit-manager-"):
                return item_id.removeprefix("implicit-manager-")
            return None

        groups: dict = {}
        failed: list = []
        for item_id in ids:
            did = deliverable_of(item_id)
            if not did:
                failed.append({"id": item_id, "detail": "Approval item not found"})
                continue
            groups.setdefault(did, []).append(item_id)

        approved: list = []
        # Each approval is a handful of database round trips, so a wider fan-out
        # across deliverables is what keeps a big selection fast.
        sem = asyncio.Semaphore(16)

        # Every deliverable in one query instead of one lookup per item. A
        # deliverable's own items still run one after the other below, so the
        # copy loaded here is only used for its first item.
        deliverables_by_id = {
            x["id"]: x
            for x in await db.deliverables.find({"id": {"$in": list(groups)}}, {"_id": 0}).to_list(len(groups) or 1)
        } if groups else {}

        async def run_group(item_ids: list):
            async with sem:
                for position, item_id in enumerate(item_ids):
                    try:
                        item, d = await _load_approvable_item(
                            user, item_id, deliverables_by_id if position == 0 else None
                        )
                        await _apply_approval(user, item, d, note, notify_in_background=True)
                        approved.append(item_id)
                    except HTTPException as exc:
                        failed.append({"id": item_id, "detail": exc.detail})
                    except Exception:
                        logger.exception("Bulk approve failed for %s", item_id)
                        failed.append({"id": item_id, "detail": "Approval failed"})

        await asyncio.gather(*(run_group(g) for g in groups.values()))
        return {"approved": approved, "failed": failed}


    @router.patch("/approval-items/{approval_item_id}/move")
    async def move_approval_item(approval_item_id: str, payload: ApprovalMove, request: Request):
        user = await require_approver(request)
        target = payload.approval_type.upper().strip()
        if target not in APPROVAL_TYPES:
            raise HTTPException(status_code=400, detail="Invalid approval type")
        item = await db.approval_items.find_one({"id": approval_item_id}, {"_id": 0})
        if not item and approval_item_id.startswith("implicit-manager-"):
            deliverable_id = approval_item_id.removeprefix("implicit-manager-")
            d0 = await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})
            if not d0:
                raise HTTPException(status_code=404, detail="Deliverable not found")
            await _create_or_sync_approval_workflow(d0, ["MANAGER"], user.id)
            item = await db.approval_items.find_one({"deliverable_id": deliverable_id, "approval_type": "MANAGER"}, {"_id": 0})
        if not item:
            raise HTTPException(status_code=404, detail="Approval item not found")
        d = await db.deliverables.find_one({"id": item["deliverable_id"]}, {"_id": 0})
        if not d:
            raise HTTPException(status_code=404, detail="Deliverable not found")
        if not await _approval_item_can_act(user, item, d):
            raise HTTPException(status_code=403, detail="You are not authorized to move this approval")
        if item.get("approval_type") == target:
            return item
        duplicate = await db.approval_items.find_one({
            "approval_workflow_id": item["approval_workflow_id"],
            "approval_type": target,
            "id": {"$ne": approval_item_id},
        }, {"_id": 0, "id": 1})
        if duplicate:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"This deliverable already has a {target.replace('_', " " ).title()} approval."
                ),
            )
        ts = now_iso()
        old_type = item.get("approval_type")
        await db.approval_items.update_one(
            {"id": approval_item_id},
            {"$set": {"approval_type": target, "status": "PENDING", "updated_at": ts}},
        )
        workflow = await db.approval_workflows.find_one(
            {"id": item["approval_workflow_id"]},
            {"_id": 0, "required_types": 1},
        )

        required_types = list(workflow.get("required_types", [])) if workflow else []

        if old_type in required_types:
            required_types.remove(old_type)

        if target not in required_types:
            required_types.append(target)

        await db.approval_workflows.update_one(
            {"id": item["approval_workflow_id"]},
            {
                "$set": {
                    "required_types": required_types,
                    "updated_at": ts,
                }
            },
        )
        await db.approval_history.insert_one({
            "id": str(uuid.uuid4()), "approval_item_id": approval_item_id,
            "deliverable_id": d["id"], "action": "MOVED", "performed_by": user.id,
            "comment": "", "old_value": old_type, "new_value": target, "created_at": ts,
        })
        return await db.approval_items.find_one({"id": approval_item_id}, {"_id": 0})


    async def _resolve_real_approval_item(approval_item_id: str, user: User):
        """
        Hide/unhide need a real document to flag — implicit manager items
        have no backing document, so materialize one first, same as move
        already does.
        """
        item = await db.approval_items.find_one({"id": approval_item_id}, {"_id": 0})

        if item:
            return item

        if not approval_item_id.startswith("implicit-manager-"):
            raise HTTPException(status_code=404, detail="Approval item not found")

        deliverable_id = approval_item_id.removeprefix("implicit-manager-")
        d0 = await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})

        if not d0:
            raise HTTPException(status_code=404, detail="Deliverable not found")

        await _create_or_sync_approval_workflow(d0, ["MANAGER"], user.id)

        return await db.approval_items.find_one(
            {"deliverable_id": deliverable_id, "approval_type": "MANAGER"},
            {"_id": 0},
        )


    @router.post("/approval-items/{approval_item_id}/hide")
    async def hide_approval_item(approval_item_id: str, request: Request):
        user = await require_approver(request)

        item = await _resolve_real_approval_item(approval_item_id, user)

        if not item:
            raise HTTPException(status_code=404, detail="Approval item not found")

        await db.approval_items.update_one(
            {"id": item["id"]},
            {
                "$set": {
                    "hidden": True,
                    "hidden_at": now_iso(),
                    "hidden_by": user.id,
                    "updated_at": now_iso(),
                }
            },
        )

        return {"success": True}


    @router.post("/approval-items/{approval_item_id}/unhide")
    async def unhide_approval_item(approval_item_id: str, request: Request):
        user = await require_approver(request)

        item = await _resolve_real_approval_item(approval_item_id, user)

        if not item:
            raise HTTPException(status_code=404, detail="Approval item not found")

        await db.approval_items.update_one(
            {"id": item["id"]},
            {
                "$set": {
                    "hidden": False,
                    "hidden_at": None,
                    "hidden_by": None,
                    "updated_at": now_iso(),
                }
            },
        )

        return {"success": True}


    @router.post("/approval-items/bulk-hide")
    async def bulk_hide_approval_items(payload: BulkApprovalItemIdsPayload, request: Request):
        user = await require_approver(request)

        ids = payload.approval_item_ids

        if not ids:
            raise HTTPException(status_code=400, detail="No approvals selected")

        resolved_ids = []

        for approval_item_id in ids:
            item = await _resolve_real_approval_item(approval_item_id, user)

            if item:
                resolved_ids.append(item["id"])

        await db.approval_items.update_many(
            {"id": {"$in": resolved_ids}},
            {
                "$set": {
                    "hidden": True,
                    "hidden_at": now_iso(),
                    "hidden_by": user.id,
                    "updated_at": now_iso(),
                }
            },
        )

        return {"success": True, "count": len(resolved_ids)}


    @router.post("/approval-items/bulk-unhide")
    async def bulk_unhide_approval_items(payload: BulkApprovalItemIdsPayload, request: Request):
        user = await require_approver(request)

        ids = payload.approval_item_ids

        if not ids:
            raise HTTPException(status_code=400, detail="No approvals selected")

        await db.approval_items.update_many(
            {"id": {"$in": ids}},
            {
                "$set": {
                    "hidden": False,
                    "hidden_at": None,
                    "hidden_by": None,
                    "updated_at": now_iso(),
                }
            },
        )

        return {"success": True, "count": len(ids)}


    # Legacy endpoints remain for the existing stage-based Close Stage UI.
    @router.post("/deliverables/{deliverable_id}/approve")
    async def approve_deliverable(deliverable_id: str, payload: ApprovalDecision, request: Request):
        user = await get_acting_user(request)
        if user.role not in ("manager", "admin"):
            raise HTTPException(status_code=403, detail="Only managers and admins can approve")
        existing = await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Deliverable not found")
        # Use the deliverable's own selected pipeline, not the fixed global
        # stage order, so this stays consistent with the Approvals Kanban.
        return await advance_deliverable_stage(existing, user.id, payload.note or "")

    return router
