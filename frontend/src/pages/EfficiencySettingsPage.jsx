import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarRange, Target } from "lucide-react";

import { useUser } from "@/context/UserContext";

export default function EfficiencySettingsPage() {
  const { currentUser, loading } = useUser();

  if (loading || !currentUser) return null;

  const isManager = currentUser.role === "manager";

  if (!isManager) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
        Efficiency settings are available to managers only
      </div>
    );
  }

  const cards = [
    {
      to: "/efficiency/settings/monthly-capacity",
      icon: CalendarRange,
      title: "Monthly capacity",
      description:
        "Set working days and leave per employee per month. Core hours and core days are derived from this.",
      // Manager-only, like team potential.
      visible: isManager,
    },
    {
      to: "/efficiency/settings/activity-targets",
      icon: Target,
      title: "Team potential",
      description:
        "Set each team member's daily potential per core activity. This is what 100% productivity means for them.",
      visible: isManager,
    },
  ].filter((c) => c.visible);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-6">
      <Link
        to="/efficiency"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Efficiency
      </Link>

      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Efficiency settings
        </h1>
        <p className="text-sm text-slate-500">
          Configuration that drives every productivity number
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ to, icon: Icon, title, description }) => (
          <Link
            key={to}
            to={to}
            className="group rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f0f0fd] text-[#1a1a8a]">
                <Icon className="h-4 w-4" />
              </span>
              <ArrowRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
          </Link>
        ))}
      </div>

    </div>
  );
}