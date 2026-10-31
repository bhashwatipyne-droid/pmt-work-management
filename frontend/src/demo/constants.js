// Copies of the backend's fixed lists (backend/constants.py, domain_constants.py)
// that the demo's /config/options answer needs.

const CORE = [
  "Other Initiatives",
  "Client Meets & Discussions",
  "Team Reviews and Feedback",
  "Campaign Ideation Plan (Includes Keywords)",
  "Campaign Ideation Plan (Quantitative Analysis)",
  "Campaign Ideation Plan (Content Peer Analysis)",
  "Campaign Ideation Plan (Key Visuals / Taglines)",
  "Teaser",
  "Minimalist",
  "Emailers",
  "Newsletters",
  "Carousel",
  "One Pager / Infographic",
  "Brochure",
  "Booklet",
  "Presentation (PPT) - Per Slide",
  "Typeform / Polls / Quiz",
  "Collateral",
  "GIF",
  "Reel / Short Video",
  "Long Video",
  "Video Storyboard",
  "Poster",
  "Data Research and Analysis (SMI)",
  "Data Research and Analysis (Web)",
  "Data Updation",
  "Changes",
  "Two Pager",
  "Teaser Short Video",
  "Hiring and Interviews",
];

const NON_CORE = [
  "Project Briefing",
  "Campaign Ideation Discussions",
  "Clarity / Query / Doubt / Feedback Discussions",
  "Core Team / Content Team / CEO Discussions",
  "Trainings / Committee / Reviews Meetings",
  "SOP and Process Improvements - Documentation",
  "Follow Up (Over 10-15 mins)",
];

export const CORE_TYPES = CORE;
export const NON_CORE_TYPES = NON_CORE;
export const DELIVERABLE_TYPES = [...CORE, ...NON_CORE];

export const DELIVERABLE_TYPE_CATEGORIES = Object.fromEntries([
  ...CORE.map((t) => [t, "Core"]),
  ...NON_CORE.map((t) => [t, "Non-Core"]),
]);

export const DELIVERABLE_TYPE_UNITS = {
  "Presentation (PPT) - Per Slide": "Slide",
  Carousel: "Slide",
  "Reel / Short Video": "Reel",
  Booklet: "Page",
  Brochure: "Page",
  "Two Pager": "Page",
  "Video Storyboard": "Frame",
  Teaser: "Video",
  "Teaser Short Video": "Video",
  "Long Video": "Video",
  Poster: "Post",
  Minimalist: "Post",
  GIF: "GIF",
};

export const OPTIONS = {
  deliverable_types: DELIVERABLE_TYPES,
  deliverable_type_categories: DELIVERABLE_TYPE_CATEGORIES,
  deliverable_type_units: DELIVERABLE_TYPE_UNITS,
  work_categories: ["Core", "Non-Core"],
  statuses: [
    "Not Started",
    "Ongoing",
    "On Hold",
    "Ready for Review",
    "Changes Requested",
    "Rework",
    "Closed",
    "Scrap",
  ],
  member_forward_statuses: ["Not Started", "Ongoing", "On Hold", "Ready for Review", "Scrap"],
  project_statuses: [
    "Active",
    "Approval Pending",
    "Completed",
    "Ready for Invoice",
    "Raised Invoice",
    "On Hold",
    "Scrapped",
  ],
  stages: ["Content", "Design", "Animate"],
  stage_statuses: ["Not Started", "In Progress", "Ready for Review", "Changes Requested", "Completed"],
  client_statuses: ["Active", "Inactive"],
  departments: ["Content", "Design", "Animation", "Administration"],
  roles: ["admin", "manager", "member", "hr"],
  approval_types: ["MANAGER", "LEADERSHIP", "CLIENT_SPOC", "COMPLIANCE"],
};

export const DEPARTMENT_TO_STAGE = {
  Content: "Content",
  Design: "Design",
  Animation: "Animate",
};

export const STAGE_TO_DEPARTMENT = {
  Content: "Content",
  Design: "Design",
  Animate: "Animation",
};
