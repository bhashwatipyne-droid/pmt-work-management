import { lazy, Suspense, useEffect, useRef } from "react";
import "@/App.css";
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import { UserProvider, useUser } from "@/context/UserContext";
import { trackEvent } from "@/analytics";
import { Toaster } from "@/components/ui/sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import PushNotifications from "@/components/notifications/PushNotifications";
import { AppShellSkeleton } from "@/components/skeletons/Skeletons";
import { RequireAccess } from "@/components/layout/RequireAccess";

// Every page used to be imported eagerly here, which meant visiting any
// one route (even the Work Sheet) pulled the JS for every other page —
// Dashboard, Projects, Approvals, Team, Clients, Profile, all three
// Efficiency pages — into the same bundle before the browser could paint
// anything. Lazy-loading means only the matched route's own code (plus
// shared vendor code) has to download and parse before first paint;
// everything else loads on demand when actually navigated to.
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const WorkSheetPage = lazy(() => import("@/pages/WorkSheetPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const ProjectsPage = lazy(() => import("@/pages/ProjectsPage"));
const ProjectDetailPage = lazy(() => import("@/pages/ProjectDetailPage"));
const TeamPage = lazy(() => import("@/pages/TeamPage"));
const ApprovalsPage = lazy(() => import("@/pages/ApprovalsPage"));
const ClientsPage = lazy(() => import("@/pages/ClientsPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const EfficiencyPage = lazy(() => import("@/pages/EfficiencyPage"));
const EfficiencyMonthlyCapacityPage = lazy(() =>
  import("@/pages/EfficiencyMonthlyCapacityPage")
);
const EfficiencyActivityTargetsPage = lazy(() =>
  import("@/pages/EfficiencyActivityTargetsPage")
);

const PAGE_NAMES = {
  "/": "Work Sheet",
  "/dashboard": "Dashboard",
  "/efficiency": "Efficiency",
  "/efficiency/settings/monthly-capacity": "Monthly Capacity",
  "/efficiency/settings/activity-targets": "Activity Targets",
  "/projects": "Projects",
  "/team": "Team",
  "/approvals": "Approvals",
  "/clients": "Clients",
  "/profile": "Profile",
};

function AppShell() {
  const { loading, isAuthenticated, currentUser } = useUser();
  const location = useLocation();
  const lastTrackedPath = useRef(null);

  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id) return;

    const pathname = location.pathname;

    // Prevent duplicate events for the same route.
    if (lastTrackedPath.current === pathname) return;

    lastTrackedPath.current = pathname;

    const pageName = pathname.startsWith("/projects/")
      ? "Project Detail"
      : PAGE_NAMES[pathname] || "Unknown Page";

    trackEvent("page_view", {
      user_id: String(currentUser.id),
      username: currentUser.username,
      role: currentUser.role,
      path: pathname,
      page_name: pageName,
    });
  }, [
    location.pathname,
    isAuthenticated,
    currentUser?.id,
    currentUser?.role,
  ]);

  if (loading) {
    return <AppShellSkeleton />;
  }

  return (
    <Suspense fallback={<AppShellSkeleton />}>
      {!isAuthenticated ? (
        <LoginPage />
      ) : (
        <AppLayout>
          <Routes>
            <Route path="/" element={<WorkSheetPage />} />
            <Route
              path="/dashboard"
              element={<RequireAccess><DashboardPage /></RequireAccess>}
            />
            <Route path="/efficiency" element={<EfficiencyPage />} />
            <Route
              path="/efficiency/settings/monthly-capacity"
              element={<RequireAccess><EfficiencyMonthlyCapacityPage /></RequireAccess>}
            />
            <Route
              path="/efficiency/settings/activity-targets"
              element={<RequireAccess><EfficiencyActivityTargetsPage /></RequireAccess>}
            />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route
              path="/projects/:projectId"
              element={<ProjectDetailPage />}
            />
            <Route
              path="/team"
              element={<RequireAccess><TeamPage /></RequireAccess>}
            />
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route
              path="/clients"
              element={<RequireAccess><ClientsPage /></RequireAccess>}
            />
            <Route path="/profile" element={<ProfilePage />} />
          </Routes>
        </AppLayout>
      )}
    </Suspense>
  );
}

function App() {
  return (
    <div className="App">
      <UserProvider>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
        <Toaster position="top-right" />
        <PushNotifications />
      </UserProvider>
    </div>
  );
}

export default App;