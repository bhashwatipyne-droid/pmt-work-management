import {
  Building2,
  CheckSquare,
  Folder,
  Gauge,
  Home,
  List,
  User,
} from "lucide-react";

import { LAYOUT } from "@/constants/testIds";

// Navigation, shared by the sidebar, the ⌘K palette and the G-then-letter
// shortcuts. Which items a person gets comes from lib/permissions.js.
export const NAV_ITEMS = [
  {
    key: "home",
    label: "Home",
    to: "/dashboard",
    section: "Workspace",
    icon: Home,
    chord: "H",
    testId: LAYOUT.sidebarNavDashboard,
    allow: (a) => a.canViewHome,
  },
  {
    key: "worksheet",
    label: "Work sheet",
    to: "/",
    section: "Production",
    icon: List,
    chord: "W",
    testId: LAYOUT.sidebarNavSheet,
    allow: (a) => a.canViewWorksheet,
  },
  {
    key: "projects",
    label: "Projects",
    to: "/projects",
    section: "Production",
    icon: Folder,
    chord: "P",
    testId: "sidebar-nav-projects",
    allow: (a) => a.canViewProjects,
  },
  {
    key: "approvals",
    label: "Approvals",
    to: "/approvals",
    section: "Production",
    icon: CheckSquare,
    chord: "A",
    testId: "sidebar-nav-approvals",
    allow: (a) => a.canViewApprovals,
  },
  {
    key: "clients",
    label: "Clients",
    to: "/clients",
    section: "Organization",
    icon: Building2,
    chord: "C",
    testId: "sidebar-nav-clients",
    allow: (a) => a.canViewClients,
  },
  {
    key: "team",
    label: "Team",
    to: "/team",
    section: "Organization",
    icon: User,
    chord: "T",
    testId: "sidebar-nav-team",
    allow: (a) => a.canViewTeam,
  },
  {
    key: "efficiency",
    label: "Efficiency",
    to: "/efficiency",
    section: "Organization",
    icon: Gauge,
    chord: "E",
    testId: "sidebar-nav-efficiency",
    allow: (a) => a.canViewEfficiency,
  },
];

const SECTION_ORDER = ["Workspace", "Production", "Organization"];

export const getNavItems = (access) => NAV_ITEMS.filter((i) => i.allow(access));

export const getNavSections = (access) => {
  const items = getNavItems(access);
  return SECTION_ORDER.map((title) => ({
    title,
    items: items.filter((i) => i.section === title),
  })).filter((section) => section.items.length > 0);
};

// Breadcrumb for the top bar: "Production › Work sheet".
export const getBreadcrumb = (pathname) => {
  if (pathname.startsWith("/projects/")) {
    return { section: "Production", title: "Project" };
  }
  if (pathname === "/efficiency/settings/monthly-capacity") {
    return { section: "Efficiency", title: "Monthly capacity" };
  }
  if (pathname === "/efficiency/settings/activity-targets") {
    return { section: "Efficiency", title: "Core activity targets" };
  }
  if (pathname === "/profile") {
    return { section: "Account", title: "Profile & account" };
  }

  const match = NAV_ITEMS.find((item) =>
    item.to === "/" ? pathname === "/" : pathname === item.to
  );
  return match
    ? { section: match.section, title: match.label }
    : { section: "PMT", title: "" };
};

export const IS_MAC =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || "");

export const MOD_LABEL = IS_MAC ? "⌘" : "Ctrl";

export const BUG_REPORT_URL = "https://forms.gle/ajVZLXfErLUd1coK9";
