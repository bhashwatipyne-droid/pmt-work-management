// Single source of truth for who can see and do what in PMT.
//
// Everything that used to check `currentUser.role === "admin"` inline (the
// sidebar, the command palette, route guards, page headers, action buttons)
// reads from here instead, so a role rule is changed in one place.
//
//                      Admin        Manager      Member
//   Home (dashboard)   view         -            -
//   Work sheet         view only    edit         edit (own rows)
//   Projects           view + edit  view only    view only
//   Approvals          view + act   view + act   view only
//   Efficiency         view only    view + edit  view only
//   Clients            view + edit  -            -
//   Team               view + edit  -            -
//   Planning           view         view         -
//   Ready to invoice   view         -            -         (HR: this only)
//
// The backend enforces the same rules (server.py / efficiency.py); this file
// only decides what the UI shows.

export const ROLE_LABELS = {
  admin: "Admin",
  manager: "Manager",
  member: "Member",
  hr: "HR · Finance",
};

export const getAccess = (user) => {
  const role = user?.role;
  const admin = role === "admin";
  const manager = role === "manager";
  const member = role === "member";
  const hr = role === "hr";
  // HR / Finance only works in Ready to invoice; everything else is for the
  // production roles.
  const staff = admin || manager || member;
  const signedIn = staff || hr;

  return {
    role,

    // ---- What each role can open ----
    canViewHome: admin,
    canViewWorksheet: staff,
    canViewProjects: staff,
    canViewApprovals: staff,
    canViewEfficiency: staff,
    canViewPlanning: admin || manager,
    canViewInvoicing: hr || admin,
    canViewClients: admin,
    canViewTeam: admin,

    // ---- What each role can change ----
    canManageProjects: admin, // create, edit, hide, delete, import, reorder
    canActOnApprovals: manager || admin, // approve, send back, move between queues
    canConfigureEfficiency: manager, // monthly capacity, team potential
    canManageClients: admin,
    canManageTeam: admin,
    // Admins are view-only on the Work Sheet.
    canLogWork: manager || member,
  };
};

// Which route needs which capability. Anything not listed is open to every
// signed-in user (work sheet, profile).
const ROUTE_RULES = [
  { prefix: "/planning", allow: (a) => a.canViewPlanning, label: "Planning" },
  { prefix: "/invoicing", allow: (a) => a.canViewInvoicing, label: "Ready to invoice" },
  { prefix: "/dashboard", allow: (a) => a.canViewHome, label: "Home" },
  { prefix: "/clients", allow: (a) => a.canViewClients, label: "Clients" },
  { prefix: "/team", allow: (a) => a.canViewTeam, label: "Team" },
  { prefix: "/projects", allow: (a) => a.canViewProjects, label: "Projects" },
  { prefix: "/approvals", allow: (a) => a.canViewApprovals, label: "Approvals" },
  {
    // Settings sub-pages edit data, so they need the edit capability.
    prefix: "/efficiency/settings",
    allow: (a) => a.canConfigureEfficiency,
    label: "Efficiency settings",
  },
  { prefix: "/efficiency", allow: (a) => a.canViewEfficiency, label: "Efficiency" },
];

export const getRouteRule = (pathname) =>
  ROUTE_RULES.find(
    (rule) => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)
  ) || null;

export const canAccessPath = (access, pathname) => {
  const rule = getRouteRule(pathname);
  if (rule) return rule.allow(access);
  // Work sheet, profile and anything unlisted: every production role. HR only
  // gets the pages listed above (plus their profile).
  return access.role === "hr" ? pathname === "/profile" : access.role != null;
};