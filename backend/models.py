"""Request / response models (Pydantic) shared by the routes. Moved out of
server.py unchanged."""
import uuid  # noqa: F401
from typing import Dict, List, Optional  # noqa: F401

from pydantic import BaseModel, ConfigDict, Field, model_validator  # noqa: F401

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    username: Optional[str] = ""
    role: str
    email: Optional[str] = ""
    department: Optional[str] = ""
    active: Optional[bool] = True
    # Set by "Remove" on the Team page: the person has left. They keep their
    # history (names on old work, approvals, efficiency) but cannot sign in and
    # no longer appear on the Team page.
    removed: Optional[bool] = False


class UserCreate(BaseModel):
    name: str
    username: str
    email: str
    password: str
    role: str
    department: Optional[str] = ""
    active: Optional[bool] = True


class UserUpdate(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    active: Optional[bool] = None


class WorkItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    work_date: str
    month: str
    deliverable_name: str = ""
    deliverable_type: str = ""
    deliverable_link: str = ""
    work_category: str = "Core"
    version: str = ""
    time_taken_minutes: float = 0
    # Where time_taken_minutes came from. "auto" = filled from the worker's
    # own benchmark (efficiency_employee_targets.time_per_unit_minutes) for the
    # chosen deliverable type; "manual" = typed by a person. Server-managed:
    # clients cannot set it (it is not in WorkItemCreate/WorkItemUpdate).
    time_source: str = "manual"
    # The benchmark that applied when the type was chosen, kept so the UI can
    # show how far an edited time is from it. None = no benchmark exists.
    time_benchmark_minutes: Optional[float] = None
    # Design/Animate rows: how many units (slides, pages, scenes...) this one
    # row covers, e.g. 23 for a 23-slide deck. Efficiency counts it for Closed
    # rows. Always 1 for any other stage.
    quantity: float = 1.0
    # Minutes per unit, in order (None = not logged yet). Empty when the row
    # has no per-unit breakdown. When any is logged, time_taken_minutes is
    # their total (see apply_quantity_rules).
    quantity_items: List[Optional[float]] = Field(default_factory=list)
    # Campaign Ideation Plan rows (Content) only: every deliverable of the row's
    # project that this one row covers, in the order they were ticked.
    # deliverable_id is always the first; quantity is the number of
    # deliverables and quantity_items[i] is the time for deliverable_ids[i]
    # (see apply_deliverable_list_rules). Empty on every other row.
    deliverable_ids: List[str] = Field(default_factory=list)
    # Animate rows only: length of the finished video. SECONDS are the source
    # of truth; the minutes field is kept in step (seconds / 60) for older
    # readers and rows saved before seconds existed (see the validator below).
    video_duration_seconds: Optional[int] = None
    video_duration_minutes: Optional[float] = None
    creator_id: Optional[str] = None
    reviewer_id: Optional[str] = None
    manager_id: Optional[str] = None
    client_id: Optional[str] = None
    project_id: Optional[str] = None
    deliverable_id: Optional[str] = None
    # True when the user picked "Not available" in the Deliverable dropdown
    # (the project has no matching deliverable yet). Kept separate from
    # deliverable_id so every existing join on deliverable_id keeps working.
    deliverable_not_available: bool = False
    stage: Optional[str] = None
    remarks: str = ""
    status: str = "Not Started"
    # Collaborators: when one person tags teammates on an entry, each teammate
    # gets their own row (own time, own status) and every row of that entry
    # shares collab_group_id. Server-managed - clients cannot set these.
    collab_group_id: Optional[str] = None
    collab_source_id: Optional[str] = None  # the row this copy was made from
    collab_added_by: Optional[str] = None  # user who tagged this person
    created_at: str
    updated_at: str

    @model_validator(mode="after")
    def _fill_video_duration_seconds(self):
        # Rows saved before seconds existed only carry minutes.
        if self.video_duration_seconds is None and self.video_duration_minutes is not None:
            self.video_duration_seconds = int(round(self.video_duration_minutes * 60))
        return self


class WorkItemCreate(BaseModel):
    work_date: Optional[str] = None
    deliverable_name: Optional[str] = ""
    deliverable_type: Optional[str] = ""
    deliverable_link: Optional[str] = ""
    work_category: Optional[str] = "Core"
    version: Optional[str] = ""
    time_taken_minutes: Optional[float] = 0
    quantity: Optional[float] = 1.0
    quantity_items: Optional[List[Optional[float]]] = None
    deliverable_ids: Optional[List[str]] = None
    video_duration_seconds: Optional[float] = None
    video_duration_minutes: Optional[float] = None
    creator_id: Optional[str] = None
    reviewer_id: Optional[str] = None
    manager_id: Optional[str] = None
    client_id: Optional[str] = None
    project_id: Optional[str] = None
    deliverable_id: Optional[str] = None
    deliverable_not_available: Optional[bool] = False
    stage: Optional[str] = None
    remarks: Optional[str] = ""
    status: Optional[str] = "Not Started"


class WorkItemUpdate(BaseModel):
    work_date: Optional[str] = None
    deliverable_name: Optional[str] = None
    deliverable_type: Optional[str] = None
    deliverable_link: Optional[str] = None
    work_category: Optional[str] = None
    version: Optional[str] = None
    time_taken_minutes: Optional[float] = None
    quantity: Optional[float] = None
    quantity_items: Optional[List[Optional[float]]] = None
    deliverable_ids: Optional[List[str]] = None
    video_duration_seconds: Optional[float] = None
    video_duration_minutes: Optional[float] = None
    creator_id: Optional[str] = None
    reviewer_id: Optional[str] = None
    manager_id: Optional[str] = None
    client_id: Optional[str] = None
    project_id: Optional[str] = None
    deliverable_id: Optional[str] = None
    deliverable_not_available: Optional[bool] = None
    stage: Optional[str] = None
    remarks: Optional[str] = None
    status: Optional[str] = None


class BulkUpdatePayload(BaseModel):
    ids: List[str]
    patch: WorkItemUpdate


class BulkDeletePayload(BaseModel):
    ids: List[str]


class BulkCreatePayload(BaseModel):
    count: int = 100
    template: Optional[WorkItemCreate] = None


class BulkProjectIdsPayload(BaseModel):
    project_ids: List[str]


class BulkProjectStatusPayload(BaseModel):
    project_ids: List[str]
    status: str


class ProjectReorderPayload(BaseModel):
    project_id: str
    target_status: str
    target_index: int = 0


class DeliverableInput(BaseModel):
    name: str
    type: Optional[str] = ""
    start_dt: Optional[str] = None
    end_dt: Optional[str] = None
    # Per-stage deadline windows, e.g. {"Content": {"start_dt": "2026-09-22",
    # "end_dt": "2026-09-24"}, "Design": {...}}. When given, this is what the
    # overall start_dt/end_dt above are derived from (see
    # derive_deliverable_dates) - a stage need not have an entry, in which
    # case that stage's deadline simply isn't tracked yet.
    stage_schedule: Optional[Dict[str, Dict[str, Optional[str]]]] = None
    required_stages: List[str] = Field(
        default_factory=lambda: ["Content"]
    )
    approval_types: Optional[List[str]] = None
    current_stage: Optional[str] = None


class ProjectCreate(BaseModel):
    name: str
    client_id: str
    # One line the team sees when picking the project on the Work Sheet,
    # e.g. "Oct 2026 edition, Gujarati versions" - tells similar projects apart.
    description: Optional[str] = ""
    # Selected contact person for this project
    poc_id: Optional[str] = None
    # Both dates are optional: a project can be created before its window is known.
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = "Active"
    deliverables: Optional[List[DeliverableInput]] = []


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    client_id: Optional[str] = None
    description: Optional[str] = None
    # Selected contact person for this project
    poc_id: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = None


class Project(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str
    name: str
    client_id: str
    description: str = ""
    # Selected contact person for this project
    poc_id: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: str = "Active"

    # Kanban ordering. Lower values render first within a status column.
    kanban_order: int = 0
    status_changed_at: Optional[str] = None

    # Visibility
    hidden: bool = False
    hidden_at: Optional[str] = None
    hidden_by: Optional[str] = None

    created_at: str
    updated_at: str


class Deliverable(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    name: str
    type: str = ""
    # Always derived from stage_schedule when it has any entries (see
    # derive_deliverable_dates) - not directly editable once a per-stage
    # window exists. Kept for sorting, the overdue-deadline job, and any
    # deliverable that only has the old-style single overall range.
    start_dt: Optional[str] = None
    end_dt: Optional[str] = None
    # Per-stage deadline window: {"Content": {"start_dt": ..., "end_dt": ...}}.
    # A stage with no entry here has no tracked deadline.
    stage_schedule: Dict[str, Dict[str, Optional[str]]] = Field(default_factory=dict)
    required_stages: List[str] = Field(
        default_factory=lambda: ["Content"]
    )
    current_stage: str = "Content"
    stage_status: str = "Not Started"
    approval_types: List[str] = Field(default_factory=list)
    created_at: str
    updated_at: str


class DeliverableCreate(BaseModel):
    project_id: str
    name: str
    type: Optional[str] = ""
    start_dt: Optional[str] = None
    end_dt: Optional[str] = None
    stage_schedule: Optional[Dict[str, Dict[str, Optional[str]]]] = None
    required_stages: List[str] = Field(
        default_factory=lambda: ["Content"]
    )
    approval_types: Optional[List[str]] = None
    current_stage: Optional[str] = None


class DeliverableUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    start_dt: Optional[str] = None
    end_dt: Optional[str] = None
    stage_schedule: Optional[Dict[str, Dict[str, Optional[str]]]] = None
    required_stages: Optional[List[str]] = None
    approval_types: Optional[List[str]] = None


class ApprovalWorkflowCreate(BaseModel):
    approval_types: List[str] = Field(default_factory=list)


class ApprovalDecision(BaseModel):
    note: Optional[str] = ""


class ApprovalMove(BaseModel):
    approval_type: str


class BulkApprovalItemIdsPayload(BaseModel):
    approval_item_ids: List[str]
