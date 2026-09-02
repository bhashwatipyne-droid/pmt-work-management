import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { UserProvider, useUser } from "@/context/UserContext";
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
import { Loader2 } from "lucide-react";

function AppShell() {
  const { loading, isAuthenticated } = useUser();

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
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route path="/clients" element={<ClientsPage />} />
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
