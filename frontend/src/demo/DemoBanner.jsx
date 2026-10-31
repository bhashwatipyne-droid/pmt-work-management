import { DEMO_ROLES, exitDemo, getDemoRole, setDemoRole } from "./demoMode";

const ROLE_LABEL = { admin: "Admin", manager: "Manager", member: "Team member" };
const ROLE_HOME = { admin: "/dashboard", manager: "/", member: "/" };

// Slim strip across the top of the demo: says what this is, lets a visitor
// try the app as each kind of person, and leaves.
export function DemoBanner() {
  const role = getDemoRole();

  const switchTo = (next) => {
    if (next === role) return;
    setDemoRole(next);
    window.location.assign(ROLE_HOME[next]);
  };

  const leave = () => {
    exitDemo();
    window.location.assign("/");
  };

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#d9defa] bg-[#eef0ff] px-3 py-1.5 text-[12px] text-[#2b2bb5] md:px-5"
      data-testid="demo-banner"
    >
      <span className="font-semibold">Live demo</span>
      <span className="hidden text-[#546490] sm:inline">
        Sample data only. Click anything, nothing is saved once you reload.
      </span>
      <div className="flex-1" />
      <span className="text-[#546490]">View as</span>
      <div className="inline-flex overflow-hidden rounded-md border border-[#c9d0fb] bg-white">
        {DEMO_ROLES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => switchTo(r)}
            className={`px-2.5 py-1 text-[12px] font-medium transition-colors ${
              r === role ? "bg-[#2b2bb5] text-white" : "text-[#2b2bb5] hover:bg-[#eef0ff]"
            }`}
            aria-pressed={r === role}
          >
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={leave}
        className="rounded-md px-2 py-1 text-[12px] font-medium text-[#546490] underline-offset-2 hover:underline"
      >
        Exit demo
      </button>
    </div>
  );
}
