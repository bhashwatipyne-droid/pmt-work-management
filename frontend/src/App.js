import { useEffect, useRef } from "react";
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
import LoginPage from "@/pages/LoginPage";
import WorkSheetPage from "@/pages/WorkSheetPage";
import DashboardPage from "@/pages/DashboardPage";
import ProjectsPage from "@/pages/ProjectsPage";
import ProjectDetailPage from "@/pages/ProjectDetailPage";
import TeamPage from "@/pages/TeamPage";
import ApprovalsPage from "@/pages/ApprovalsPage";
import ClientsPage from "@/pages/ClientsPage";
import ProfilePage from "@/pages/ProfilePage";
import EfficiencyPage from "@/pages/EfficiencyPage";
import EfficiencyMonthlyCapacityPage from "@/pages/EfficiencyMonthlyCapacityPage";
import EfficiencyActivityTargetsPage from "@/pages/EfficiencyActivityTargetsPage";
import { Loader2 } from "lucide-react";

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
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b1e39]">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<WorkSheetPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/efficiency" element={<EfficiencyPage />} />
        <Route
          path="/efficiency/settings/monthly-capacity"
          element={<EfficiencyMonthlyCapacityPage />}
        />
        <Route
          path="/efficiency/settings/activity-targets"
          element={<EfficiencyActivityTargetsPage />}
        />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route
          path="/projects/:projectId"
          element={<ProjectDetailPage />}
        />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
    </AppLayout>
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
      </UserProvider>
    </div>
  );
}

export default App;