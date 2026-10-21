import { AlertCircle, ArrowLeft, Check, ChevronDown, Pencil, Share2, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dot } from "@/components/projects/detail/parts";
import { BRAND_500, ICON_BTN, MENU, MENU_ITEM, PROJECT_STATUS_DOT, fmtRange } from "@/components/projects/detail/projectDetailView";
import { Building, Calendar, User as UserIcon } from "lucide-react";
import { PROJECT_STATUSES } from "@/constants/projectPalette";

export function ProjectHeader({ canManage, currentUser, handleStatusChange, lookalikes, navigate, project, setDeleteProjectOpen, setEditProjectOpen, setShareOpen, statusDot }) {
  return (
    <>
    {/* Back link + header */}
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={() => navigate("/projects")}
        className="-ml-1 flex h-7 items-center gap-1.5 self-start rounded-[7px] pl-1 pr-2 text-[13px] font-medium text-[rgb(84,100,144)] hover:bg-[rgb(249,250,251)] hover:text-[rgb(13,27,62)]"
      >
        <ArrowLeft className="h-4 w-4" />
        All projects
      </button>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-[280px] flex-1 flex-col gap-2">
          <h1 className="m-0 text-[28px] font-bold leading-9 text-[rgb(13,27,62)] [text-wrap:pretty]">
            {project.name}
          </h1>
          {project.description && (
            <p className="m-0 text-sm leading-5 text-[rgb(55,65,95)] [text-wrap:pretty]">
              {project.description}
            </p>
          )}
          {lookalikes.length > 0 && (
            <div
              data-testid="project-detail-lookalike-warning"
              className="flex items-start gap-2 self-start rounded-lg bg-amber-100 px-3 py-2 text-xs leading-4 text-[rgb(13,27,62)]"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-800" />
              <span>
                Often confused with {lookalikes.map((p) => p.name).join(", ")}.
                {" Ask the team to check the project name and client when logging."}
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-7 gap-y-2.5 pt-1">
            {[
              { icon: Building, label: "Client", value: project.client_name || "—" },
              { icon: UserIcon, label: "Point of contact", value: project.client_poc || "Unassigned" },
              { icon: Calendar, label: "Timeline", value: fmtRange(project.start_date, project.end_date) },
            ].map(({ icon: Icon, label, value }) => (
              <span key={label} className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[rgb(249,250,251)] text-[rgb(84,100,144)]">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="flex min-w-0 flex-col gap-px">
                  <span className="text-[11px] leading-[14px] text-[rgb(84,100,144)]">{label}</span>
                  <span className="truncate text-[13px] font-medium leading-4 text-[rgb(13,27,62)]">
                    {value}
                  </span>
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Managers and admins send the project to a WhatsApp group as a link. */}
          {["admin", "manager"].includes(currentUser?.role) && (
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              data-testid="project-detail-share-btn"
              className="flex h-[34px] items-center gap-2 rounded-[7px] bg-white px-3 text-[13px] font-semibold text-[rgb(13,27,62)] shadow-[inset_0_0_0_1px_rgb(239,240,242)] hover:bg-[rgb(249,250,251)] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgb(220,220,248)]"
            >
              <Share2 className="h-3.5 w-3.5 text-[rgb(84,100,144)]" />
              Share
            </button>
          )}
          {canManage && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="More actions"
                  data-testid="project-detail-more-btn"
                  className={ICON_BTN}
                >
                  <span className="flex gap-[3px]">
                    <span className="h-[3px] w-[3px] rounded-full bg-current" />
                    <span className="h-[3px] w-[3px] rounded-full bg-current" />
                    <span className="h-[3px] w-[3px] rounded-full bg-current" />
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={6} className={MENU}>
                <DropdownMenuItem
                  className={MENU_ITEM}
                  onSelect={() => setEditProjectOpen(true)}
                >
                  <Pencil className="!h-3.5 !w-3.5" />
                  Edit details
                </DropdownMenuItem>
                <DropdownMenuSeparator className="mx-0 my-1 h-px bg-[rgb(234,238,244)]" />
                <DropdownMenuItem
                  className={`${MENU_ITEM} !text-[rgb(239,68,68)] focus:!bg-[rgb(255,245,245)]`}
                  onSelect={() => setDeleteProjectOpen(true)}
                >
                  <Trash2 className="!h-3.5 !w-3.5" />
                  Delete project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {canManage ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Project status"
                  data-testid="project-detail-status-select"
                  className="flex h-[34px] items-center gap-2 rounded-[7px] bg-white pl-3 pr-2.5 text-[13px] font-semibold text-[rgb(13,27,62)] shadow-[inset_0_0_0_1px_rgb(239,240,242)] hover:bg-[rgb(249,250,251)] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgb(220,220,248)]"
                >
                  <Dot color={statusDot} />
                  {project.status}
                  <ChevronDown className="h-3.5 w-3.5 text-[rgb(84,100,144)]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={6} className={MENU}>
                {PROJECT_STATUSES.map((s) => (
                  <DropdownMenuItem
                    key={s}
                    className={MENU_ITEM}
                    onSelect={() => handleStatusChange(s)}
                  >
                    <Dot color={PROJECT_STATUS_DOT[s] || BRAND_500} />
                    <span className="flex-1">{s}</span>
                    {s === project.status && (
                      <Check className="!h-3.5 !w-3.5 text-[rgb(43,43,181)]" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="flex h-[34px] items-center gap-2 rounded-[7px] bg-white px-3 text-[13px] font-semibold text-[rgb(13,27,62)] shadow-[inset_0_0_0_1px_rgb(239,240,242)]">
              <Dot color={statusDot} />
              {project.status}
            </span>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
