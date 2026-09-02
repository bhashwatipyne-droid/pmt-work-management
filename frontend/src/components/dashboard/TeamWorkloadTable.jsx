import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { DASHBOARD } from "@/constants/testIds";

const STATUS_COLS = ["Not Started", "Ongoing", "Ready for Review", "Changes Requested", "Closed"];

export const TeamWorkloadTable = ({ team }) => (
  <div className="rounded-xl border border-border bg-card">
    <div className="border-b border-border px-4 py-3">
      <h3 className="text-sm font-semibold text-foreground">Team Workload</h3>
      <p className="text-xs text-muted-foreground">Work items grouped by team member</p>
    </div>
    <Table data-testid={DASHBOARD.teamTable}>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Total</TableHead>
          {STATUS_COLS.map((s) => (
            <TableHead key={s}>{s}</TableHead>
          ))}
          <TableHead>Hours</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {team.map((member) => (
          <TableRow key={member.user_id} data-testid={`dashboard-team-row-${member.user_id}`}>
            <TableCell className="font-medium">{member.name}</TableCell>
            <TableCell className="capitalize text-muted-foreground">{member.role}</TableCell>
            <TableCell>{member.total_items}</TableCell>
            {STATUS_COLS.map((s) => (
              <TableCell key={s}>{member.status_counts?.[s] || 0}</TableCell>
            ))}
            <TableCell>{member.total_hours}h</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);
