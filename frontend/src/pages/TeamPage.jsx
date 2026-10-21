import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { useUser } from "@/context/UserContext";
import { getUsers, getOptions } from "@/services/api";
import { TEAM } from "@/constants/testIds";
import { TeamListSkeleton } from "@/components/skeletons/Skeletons";
import { AddMemberModal } from "@/components/team/AddMemberModal";
import { EditMemberModal } from "@/components/team/EditMemberModal";
import { TeamRosterTable } from "@/components/team/TeamRosterTable";

export default function TeamPage() {
  const {
    currentUser,
    currentUserId,
    loading: userLoading,
  } = useUser();

  const [members, setMembers] = useState([]);
  const [options, setOptions] = useState({
    departments: [],
    roles: [],
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);

  // "Add team member" from the ⌘K palette lands here with this flag set.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (location.state?.openAdd) {
      setModalOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, location.key]);

  const [loadingMembers, setLoadingMembers] = useState(true);

  const fetchAll = async () => {
    try {
      const [u, o] = await Promise.all([
        getUsers(),
        getOptions(),
      ]);

      setMembers(u);
      setOptions(o);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role === "admin") {
      fetchAll();
    }
  }, [currentUser?.role]);

  const handleEditSave = async (updatedMember) => {
    setMembers((prev) =>
      prev.map((m) =>
        m.id === updatedMember.id
          ? updatedMember
          : m
      )
    );

    setEditingMember(null);
    toast.success(`Saved ${updatedMember.name}`);
  };

  const roster = useMemo(
    () => members.filter((m) => m.role !== "admin"),
    [members]
  );

  if (userLoading || !currentUser) return null;

  if (currentUser.role !== "admin") {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#f7f9fc] p-8 text-sm text-muted-foreground">
        Team is available to Admins only
      </div>
    );
  }

  return (
    <div
      data-testid={TEAM.page}
      className="flex-1 overflow-auto bg-[#f7f9fc] px-3 py-4 md:px-6 md:py-6 lg:px-8"
    >
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Team
            </h1>

            <span className="text-sm font-medium text-muted-foreground">
              {roster.length}
            </span>
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            Manage team members, roles and departments.
          </p>
        </div>

        <button
          type="button"
          data-testid={TEAM.addBtn}
          onClick={() => setModalOpen(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#2b2bb5] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1a1a8a] focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/30"
        >
          <Plus className="h-4 w-4" />
          Add Team Member
        </button>
      </div>

      {/* Previous Approvals */}
      <div className="rounded-xl border border-border bg-white p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-foreground">
            Previous Approvals
          </h2>

          <p className="mt-1 text-xs text-muted-foreground">
            Approved and inactive team accounts.
          </p>
        </div>

        {loadingMembers ? (
          <TeamListSkeleton />
        ) : (
          <TeamRosterTable roster={roster} setEditingMember={setEditingMember} />
        )}
      </div>

      <AddMemberModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={fetchAll}
        options={options}
      />

      <EditMemberModal
        member={editingMember}
        onClose={() => setEditingMember(null)}
        onSaved={handleEditSave}
        options={options}
      />
    </div>
  );
}