// Made-up sample workspace for the public demo. Every name, client and number
// below is invented. Dates are worked out from today, so the demo always looks
// current: some work is late, some is due this week, some is waiting for review.

import { STAGE_TO_DEPARTMENT } from "./constants";

const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const dayOffset = (n) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return isoOf(d);
};

export const todayIso = () => dayOffset(0);

const stamp = (offset, hour = 10, minute = 0) =>
  `${dayOffset(offset)}T${pad(hour)}:${pad(minute)}:00+00:00`;

const weekdayOf = (iso) => new Date(`${iso}T12:00:00`).getDay();
const isWorkingDay = (iso) => {
  const w = weekdayOf(iso);
  return w !== 0 && w !== 6;
};

// Small deterministic random generator: the demo looks the same every visit.
const makeRandom = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---------------------------------------------------------------- people
const USERS = [
  ["u-admin", "Meera Iyer", "demo.admin", "admin", "Administration"],
  ["u-mgr-content", "Kabir Shah", "kabir.shah", "manager", "Content"],
  ["u-mgr-design", "Naina Rao", "naina.rao", "manager", "Design"],
  ["u-mgr-anim", "Dev Malhotra", "dev.malhotra", "manager", "Animation"],
  ["u-c1", "Ishaan Verma", "ishaan.verma", "member", "Content"],
  ["u-c2", "Tara Menon", "tara.menon", "member", "Content"],
  ["u-c3", "Rohan Bose", "rohan.bose", "member", "Content"],
  ["u-d1", "Anika Sen", "anika.sen", "member", "Design"],
  ["u-d2", "Vikram Joshi", "vikram.joshi", "member", "Design"],
  ["u-d3", "Sana Qureshi", "sana.qureshi", "member", "Design"],
  ["u-a1", "Arjun Nair", "arjun.nair", "member", "Animation"],
  ["u-a2", "Leela Pillai", "leela.pillai", "member", "Animation"],
  ["u-hr", "Pooja Desai", "pooja.desai", "hr", "Administration"],
].map(([id, name, username, role, department]) => ({
  id,
  name,
  username,
  role,
  email: `${username}@demo.pmt.example`,
  department,
  active: true,
  removed: false,
}));

export const DEMO_LOGIN = {
  admin: "u-admin",
  manager: "u-mgr-content",
  member: "u-d1",
};

const MANAGER_OF = {
  Content: "u-mgr-content",
  Design: "u-mgr-design",
  Animate: "u-mgr-anim",
};

const MEMBERS_OF = {
  Content: ["u-c1", "u-c2", "u-c3"],
  Design: ["u-d1", "u-d2", "u-d3"],
  Animate: ["u-a1", "u-a2"],
};

// ---------------------------------------------------------------- clients
const person = (id, name, designation) => ({
  id,
  name,
  email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@client.example`,
  phone: "+91 98000 12345",
  designation,
});

const CLIENTS = [
  {
    id: "c-bluepeak",
    name: "Bluepeak Mutual Fund",
    contact_persons: [person("cp-1", "Rahul Khanna", "Head of Marketing"), person("cp-2", "Sneha Kulkarni", "Brand Manager")],
  },
  {
    id: "c-lumen",
    name: "Lumen Health",
    contact_persons: [person("cp-3", "Dr. Farah Ansari", "Chief Medical Communications")],
  },
  {
    id: "c-aster",
    name: "Aster Bank",
    contact_persons: [person("cp-4", "Vivek Rao", "VP, Digital Products"), person("cp-5", "Deepa Nambiar", "Compliance Lead")],
  },
  {
    id: "c-orbit",
    name: "Orbit Learning",
    contact_persons: [person("cp-6", "Manish Jain", "Growth Lead")],
  },
  {
    id: "c-savora",
    name: "Savora Foods",
    contact_persons: [person("cp-7", "Kiran Bedi", "Marketing Director")],
  },
  {
    id: "c-northwind",
    name: "Northwind Capital",
    contact_persons: [person("cp-8", "Alisha Thomas", "Communications Head")],
  },
].map((c) => ({
  ...c,
  contact_person: c.contact_persons[0].name,
  status: "Active",
}));

// ---------------------------------------------------------------- projects
// d(name, type, stages, stageIndex, stageStatus, [startOffset, endOffset], daysPerStage[], approvals[])
// [startOffset, endOffset] is the deadline window of the CURRENT stage in days
// from today; earlier stages are laid out backwards from it, later ones forwards.
const d = (name, type, stages, idx, status, win, durs, approvals = []) => ({
  name, type, stages, idx, status, win, durs, approvals,
});

const PROJECTS = [
  {
    code: "PRJ-2101", name: "Q3 Investor Awareness Series", client: "c-bluepeak", poc: "cp-1", status: "Active",
    description: "Educational content for first-time SIP investors, English and Hindi", start: -45, end: 9,
    items: [
      d("Investor FAQ Carousel", "Carousel", ["Content", "Design"], 1, "Ready for Review", [-4, 2], [5, 6], ["MANAGER", "CLIENT_SPOC"]),
      d("SIP Myths Newsletter - Edition 3", "Newsletters", ["Content", "Design"], 1, "In Progress", [-3, 3], [4, 5]),
      d("Retirement Planning Explainer Reel", "Reel / Short Video", ["Content", "Design", "Animate"], 2, "In Progress", [-4, 6], [4, 5, 8]),
      d("Market Outlook Two Pager", "Two Pager", ["Content", "Design"], 1, "Completed", [-19, -14], [5, 5]),
      d("Festive SIP Poster", "Poster", ["Content", "Design"], 0, "Changes Requested", [-5, -1], [4, 3]),
    ],
  },
  {
    code: "PRJ-2102", name: "Lumen Health - Wellness Month", client: "c-lumen", poc: "cp-3", status: "Active",
    description: "October wellness month: reels, emailers and patient stories", start: -35, end: 18,
    items: [
      d("Wellness Challenge Teaser", "Teaser", ["Content", "Design", "Animate"], 2, "Ready for Review", [-6, 1], [3, 4, 7], ["MANAGER", "LEADERSHIP"]),
      d("Doctor Spotlight Emailers", "Emailers", ["Content", "Design"], 1, "In Progress", [-2, 4], [4, 5]),
      d("Patient Stories Booklet", "Booklet", ["Content", "Design"], 0, "In Progress", [-4, 3], [6, 7]),
      d("Hydration Tips GIF", "GIF", ["Design", "Animate"], 0, "Not Started", [2, 5], [3, 4]),
      d("Wellness Month Infographic", "One Pager / Infographic", ["Content", "Design"], 1, "Completed", [-25, -20], [4, 5]),
    ],
  },
  {
    code: "PRJ-2103", name: "Aster Bank - Digital Savings Launch", client: "c-aster", poc: "cp-4", status: "Approval Pending",
    description: "Launch campaign for the new digital savings account", start: -50, end: 4,
    items: [
      d("Launch Film - 60s", "Long Video", ["Content", "Design", "Animate"], 2, "Ready for Review", [-12, 2], [6, 8, 18], ["MANAGER", "LEADERSHIP", "COMPLIANCE"]),
      d("Product Explainer Deck", "Presentation (PPT) - Per Slide", ["Content", "Design"], 1, "Ready for Review", [-5, -3], [7, 8], ["MANAGER", "COMPLIANCE"]),
      d("Launch Email Sequence", "Emailers", ["Content"], 0, "Completed", [-33, -25], [8]),
      d("Savings Calculator Poster", "Poster", ["Design"], 0, "Completed", [-24, -18], [6]),
    ],
  },
  {
    code: "PRJ-2104", name: "Orbit Learning - Course Marketing", client: "c-orbit", poc: "cp-6", status: "Active",
    description: "Always-on marketing assets for the autumn intake", start: -28, end: 25,
    items: [
      d("Course Catalogue Brochure", "Brochure", ["Content", "Design"], 1, "In Progress", [-5, 5], [6, 8]),
      d("Learner Testimonial Reels", "Reel / Short Video", ["Content", "Design", "Animate"], 1, "In Progress", [-3, -2], [4, 5, 7]),
      d("Admissions Webinar Invite Emailer", "Emailers", ["Content", "Design"], 0, "Not Started", [1, 4], [3, 3]),
      d("Career Roadmap Infographic", "One Pager / Infographic", ["Content", "Design"], 1, "Changes Requested", [-6, 1], [4, 5]),
    ],
  },
  {
    code: "PRJ-2105", name: "Savora Foods - Festive Campaign", client: "c-savora", poc: "cp-7", status: "Active",
    description: "Festive season recipes and in-store creatives", start: -20, end: 14,
    items: [
      d("Festive Recipe Carousel", "Carousel", ["Content", "Design"], 1, "In Progress", [-6, -4], [3, 4]),
      d("Diwali Greeting GIF", "GIF", ["Design", "Animate"], 0, "In Progress", [-3, -1], [3, 3]),
      d("Recipe Video Series - Episode 1", "Long Video", ["Content", "Design", "Animate"], 0, "In Progress", [-2, 3], [3, 4, 6]),
      d("In-store Poster Set", "Poster", ["Design"], 0, "Not Started", [2, 6], [4]),
    ],
  },
  {
    code: "PRJ-2106", name: "Orbit Learning - Scholarship Push", client: "c-orbit", poc: "cp-6", status: "Active",
    description: "Scholarship announcement and application drive", start: -8, end: 40,
    items: [
      d("Scholarship Announcement Newsletter", "Newsletters", ["Content", "Design"], 0, "In Progress", [-2, 4], [4, 4]),
      d("Eligibility Explainer Carousel", "Carousel", ["Content", "Design"], 0, "Not Started", [3, 8], [4, 5]),
      d("Student Voices Teaser", "Teaser", ["Content", "Design", "Animate"], 0, "Not Started", [8, 14], [4, 5, 8]),
    ],
  },
  {
    code: "PRJ-2107", name: "Lumen Health - Clinic Launch Kit", client: "c-lumen", poc: "cp-3", status: "On Hold",
    description: "Paused until the clinic opening date is confirmed", start: -15, end: 30,
    items: [
      d("Clinic Brochure", "Brochure", ["Content", "Design"], 0, "In Progress", [-3, 6], [6, 8]),
      d("Opening Day Poster", "Poster", ["Design"], 0, "Not Started", [5, 10], [5]),
    ],
  },
  {
    code: "PRJ-2098", name: "Northwind Capital - Brand Refresh Collateral", client: "c-northwind", poc: "cp-8", status: "Ready for Invoice",
    description: "Refreshed brochures, one-pagers and a brand film", start: -70, end: -5,
    items: [
      d("Brand Story Brochure", "Brochure", ["Content", "Design"], 1, "Completed", [-20, -12], [9, 10]),
      d("Services One Pager", "One Pager / Infographic", ["Content", "Design"], 1, "Completed", [-15, -9], [6, 7]),
      d("Brand Film", "Long Video", ["Content", "Design", "Animate"], 2, "Completed", [-14, -6], [8, 8, 16]),
    ],
  },
  {
    code: "PRJ-2090", name: "Northwind Capital - Annual Report Highlights", client: "c-northwind", poc: "cp-8", status: "Completed",
    description: "Highlights brochure, CEO message and key numbers", start: -95, end: -40,
    items: [
      d("Annual Report Highlights Brochure", "Brochure", ["Content", "Design"], 1, "Completed", [-50, -42], [10, 12]),
      d("CEO Message Video", "Long Video", ["Content", "Design", "Animate"], 2, "Completed", [-45, -40], [6, 6, 14]),
      d("Key Numbers Infographic", "One Pager / Infographic", ["Content", "Design"], 1, "Completed", [-55, -48], [5, 6]),
    ],
  },
  {
    code: "PRJ-2085", name: "Bluepeak - Monsoon Awareness Drive", client: "c-bluepeak", poc: "cp-2", status: "Raised Invoice",
    description: "Monsoon-season investor education posts and reels", start: -110, end: -48,
    items: [
      d("Monsoon Investing Carousel", "Carousel", ["Content", "Design"], 1, "Completed", [-60, -52], [6, 7]),
      d("Rain-proof Portfolio Reel", "Reel / Short Video", ["Content", "Design", "Animate"], 2, "Completed", [-58, -50], [5, 6, 9]),
      d("Dos and Don'ts Poster", "Poster", ["Content", "Design"], 1, "Completed", [-62, -54], [4, 5]),
    ],
  },
];


// ---------------------------------------------------------------- efficiency
// What each department closes in a month, and the minutes one unit takes.
const ACTIVITIES = {
  Content: [
    ["Newsletters", 240],
    ["Emailers", 150],
    ["Two Pager", 600],
  ],
  Design: [
    ["Carousel", 180],
    ["Poster", 120],
    ["One Pager / Infographic", 420],
  ],
  Animation: [
    ["Reel / Short Video", 720],
    ["GIF", 300],
    ["Teaser", 960],
  ],
};

const monthKey = (iso) => iso.slice(0, 7);

const monthsBack = (count) => {
  const now = new Date();
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${pad(m.getMonth() + 1)}`);
  }
  return out;
};

const workingDaysOf = (month) => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const days = [];
  for (let day = 1; day <= last; day += 1) {
    const iso = `${month}-${pad(day)}`;
    if (isWorkingDay(iso)) days.push(iso);
  }
  return days;
};

// ---------------------------------------------------------------- builder
export const buildSeed = () => {
  const rand = makeRandom(20260601);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const today = todayIso();

  const users = USERS.map((u) => ({ ...u, password_hash: "demo" }));
  const clients = CLIENTS.map((c) => ({ ...c }));
  const projects = [];
  const deliverables = [];
  const workItems = [];
  const approvalItems = [];
  const approvalWorkflows = [];
  const approvalHistory = [];

  let projectNo = 0;
  let deliverableNo = 0;
  let workNo = 0;
  let approvalNo = 0;

  const newWorkItem = (fields) => {
    workNo += 1;
    const workDate = fields.work_date;
    return {
      id: `wi-${workNo}`,
      work_date: workDate,
      month: monthKey(workDate),
      deliverable_name: "",
      deliverable_type: "",
      deliverable_link: "",
      work_category: "Core",
      version: "v1",
      time_taken_minutes: 0,
      time_source: "manual",
      time_benchmark_minutes: null,
      quantity: 1,
      quantity_items: [],
      deliverable_ids: [],
      video_duration_seconds: null,
      video_duration_minutes: null,
      creator_id: null,
      reviewer_id: null,
      manager_id: null,
      client_id: null,
      project_id: null,
      deliverable_id: null,
      deliverable_not_available: false,
      stage: null,
      remarks: "",
      status: "Not Started",
      collab_group_id: null,
      collab_source_id: null,
      collab_added_by: null,
      created_at: `${workDate}T09:30:00+00:00`,
      updated_at: `${workDate}T17:00:00+00:00`,
      ...fields,
    };
  };

  PROJECTS.forEach((spec, projectIndex) => {
    projectNo += 1;
    const projectId = `proj-${projectNo}`;
    projects.push({
      id: projectId,
      code: spec.code,
      name: spec.name,
      client_id: spec.client,
      description: spec.description,
      poc_id: spec.poc,
      start_date: dayOffset(spec.start),
      end_date: dayOffset(spec.end),
      status: spec.status,
      kanban_order: projectIndex,
      status_changed_at: stamp(Math.min(spec.end, -1)),
      hidden: false,
      hidden_at: null,
      hidden_by: null,
      created_at: stamp(spec.start),
      updated_at: stamp(Math.min(spec.end, -1) > -3 ? -1 : Math.min(spec.end, -1)),
    });

    spec.items.forEach((item) => {
      deliverableNo += 1;
      const deliverableId = `del-${deliverableNo}`;
      const schedule = {};
      const offsets = {};
      offsets[item.idx] = [item.win[0], item.win[1]];
      for (let i = item.idx - 1; i >= 0; i -= 1) {
        const endOff = offsets[i + 1][0];
        offsets[i] = [endOff - item.durs[i], endOff];
      }
      for (let i = item.idx + 1; i < item.stages.length; i += 1) {
        const startOff = offsets[i - 1][1];
        offsets[i] = [startOff, startOff + item.durs[i]];
      }
      item.stages.forEach((stage, i) => {
        schedule[stage] = { start_dt: dayOffset(offsets[i][0]), end_dt: dayOffset(offsets[i][1]) };
      });
      const firstStart = offsets[0][0];
      const lastEnd = offsets[item.stages.length - 1][1];
      const currentStage = item.stages[item.idx];
      const done = item.status === "Completed";
      deliverables.push({
        id: deliverableId,
        project_id: projectId,
        name: item.name,
        type: item.type,
        start_dt: schedule[item.stages[0]].start_dt,
        end_dt: schedule[item.stages[item.stages.length - 1]].end_dt,
        stage_schedule: schedule,
        required_stages: item.stages,
        current_stage: currentStage,
        stage_status: item.status,
        approval_types: item.approvals,
        created_at: stamp(firstStart - 1),
        updated_at: done ? stamp(Math.min(lastEnd, -2)) : stamp(-1),
      });

      // ---- approvals waiting on this deliverable
      if (item.status === "Ready for Review" && item.approvals.length) {
        approvalNo += 1;
        const workflowId = `wf-${approvalNo}`;
        approvalWorkflows.push({
          id: workflowId,
          deliverable_id: deliverableId,
          required_types: item.approvals,
          created_at: stamp(-6),
        });
        const firstApproved = deliverableNo % 3 === 1 && item.approvals.length > 1;
        item.approvals.forEach((type, i) => {
          approvalNo += 1;
          let status = "NOT_STARTED";
          if (firstApproved) status = i === 0 ? "APPROVED" : i === 1 ? "PENDING" : "NOT_STARTED";
          else status = i === 0 ? "PENDING" : "NOT_STARTED";
          approvalItems.push({
            id: `ai-${approvalNo}`,
            approval_workflow_id: workflowId,
            deliverable_id: deliverableId,
            approval_type: type,
            status,
            assigned_to: type === "MANAGER" ? MANAGER_OF[currentStage] : type === "LEADERSHIP" ? "u-admin" : null,
            department: STAGE_TO_DEPARTMENT[currentStage],
            requested_at: stamp(-3 + i),
            approved_at: status === "APPROVED" ? stamp(-2) : null,
            sent_back_at: null,
            approved_by: status === "APPROVED" ? MANAGER_OF[currentStage] : null,
            sent_back_by: null,
            comments: "",
            hidden: false,
            hidden_at: null,
            hidden_by: null,
            created_at: stamp(-6),
            updated_at: stamp(-3 + i),
          });
        });
      }

      // ---- the work people logged on it, stage by stage
      item.stages.forEach((stage, stageIndex) => {
        if (stageIndex > item.idx) return;
        const window = schedule[stage];
        const members = MEMBERS_OF[stage];
        const owner = members[(deliverableNo + stageIndex) % members.length];
        const finishedStage = done || stageIndex < item.idx;
        const days = [];
        for (let off = offsets[stageIndex][0]; off <= offsets[stageIndex][1]; off += 1) {
          const iso = dayOffset(off);
          if (iso > today) break;
          if (isWorkingDay(iso)) days.push(iso);
        }
        if (!days.length) return;
        const rowCount = Math.min(days.length, finishedStage ? 3 : 2);
        const chosen = [];
        for (let k = 0; k < rowCount; k += 1) {
          chosen.push(days[Math.min(days.length - 1, Math.round((k * (days.length - 1)) / Math.max(rowCount - 1, 1)))]);
        }
        chosen.forEach((workDate, k) => {
          const last = k === chosen.length - 1;
          let status = "Ongoing";
          if (last) {
            if (finishedStage) status = "Closed";
            else if (item.status === "Ready for Review") status = "Ready for Review";
            else if (item.status === "Changes Requested") status = "Changes Requested";
            else if (item.status === "Not Started") status = "Not Started";
          }
          const perUnit = 90 + Math.round(rand() * 150);
          workItems.push(
            newWorkItem({
              work_date: workDate,
              deliverable_name: item.name,
              deliverable_type: item.type,
              deliverable_link: last && finishedStage ? "https://drive.example.com/demo-file" : "",
              time_taken_minutes: perUnit,
              quantity: item.type.includes("Carousel") ? 6 : item.type.includes("Slide") ? 14 : 1,
              creator_id: owner,
              reviewer_id: MANAGER_OF[stage],
              manager_id: MANAGER_OF[stage],
              client_id: spec.client,
              project_id: projectId,
              deliverable_id: deliverableId,
              stage,
              remarks: last && status === "Changes Requested" ? "Client wants a bolder headline and a shorter intro." : "",
              status,
              version: finishedStage ? `v${Math.min(3, k + 1)}` : "v1",
            })
          );
        });
      });
    });
  });

  // ---- steady background work so the efficiency pages have six months of history
  const teamMembers = users.filter((u) => u.role === "member" || u.role === "manager");
  const months = monthsBack(6);
  const capacities = [];
  const targets = [];
  let capNo = 0;
  let targetNo = 0;

  teamMembers.forEach((user, userIndex) => {
    const pool = ACTIVITIES[user.department] || [];
    const activities = pool.length ? [pool[userIndex % pool.length]] : [];
    activities.forEach(([name, minutes]) => {
      targetNo += 1;
      targets.push({
        id: `tg-${targetNo}`,
        user_id: user.id,
        activity_name: name,
        time_per_unit_minutes: minutes,
        active: true,
        created_at: stamp(-120),
        updated_at: stamp(-120),
      });
    });

    months.forEach((month, monthIndex) => {
      const workingDays = workingDaysOf(month);
      const isCurrent = monthIndex === months.length - 1;
      const leave = userIndex % 4 === 0 ? 2 : userIndex % 3 === 0 ? 1 : 0;
      capNo += 1;
      capacities.push({
        id: `cap-${capNo}`,
        user_id: user.id,
        month,
        working_days: workingDays.length,
        leave_days: leave,
        working_hours_per_day: 8.5,
        include_in_team_average: user.role === "member",
        created_at: stamp(-30),
        updated_at: stamp(-30),
      });

      const nonCoreMinutes = 600 + Math.round(rand() * 900);
      const coreHours = (workingDays.length - leave) * 8.5 - nonCoreMinutes / 60;
      const elapsedDays = workingDays.filter((day) => day <= today);
      if (!elapsedDays.length) return;
      const share = isCurrent ? elapsedDays.length / workingDays.length : 1;

      activities.forEach(([name, minutes], activityIndex) => {
        // the main activity takes most of the core hours, the second one a little
        const portion = 0.62 + rand() * 0.3;
        const units = Math.max(2, Math.round((coreHours * 60 * portion * share) / minutes));
        const rowCount = Math.min(isCurrent ? 5 : 6, Math.max(2, Math.round(units / 4)));
        const stage = user.department === "Animation" ? "Animate" : user.department;
        const sameType = deliverables.filter((x) => x.type === name);
        for (let r = 0; r < rowCount; r += 1) {
          const workDate = elapsedDays[Math.min(elapsedDays.length - 1, Math.floor(((r + 0.5) * elapsedDays.length) / rowCount))];
          const linked = sameType.length ? sameType[(userIndex + monthIndex + r) % sameType.length] : null;
          const linkedProject = linked ? projects.find((p) => p.id === linked.project_id) : null;
          workItems.push(
            newWorkItem({
              work_date: workDate,
              deliverable_name: linked ? linked.name : `${name} - batch ${r + 1}`,
              deliverable_type: name,
              time_taken_minutes: Math.round((units / rowCount) * minutes),
              quantity: Math.max(1, Math.round(units / rowCount)),
              creator_id: user.id,
              reviewer_id: MANAGER_OF[stage],
              client_id: linkedProject ? linkedProject.client_id : null,
              project_id: linkedProject ? linkedProject.id : null,
              deliverable_id: linked ? linked.id : null,
              deliverable_not_available: !linked,
              stage,
              status: "Closed",
              version: "v1",
            })
          );
        }
      });

      // meetings, briefings and other non-core time
      const meetings = ["Project Briefing", "Core Team / Content Team / CEO Discussions", "Trainings / Committee / Reviews Meetings"];
      for (let k = 0; k < 3; k += 1) {
        const workDate = elapsedDays[Math.min(elapsedDays.length - 1, Math.floor(((k + 0.5) * elapsedDays.length) / 3))];
        workItems.push(
          newWorkItem({
            work_date: workDate,
            deliverable_name: pick(["Weekly team sync", "Client briefing", "Process training", "Review huddle"]),
            deliverable_type: meetings[k],
            work_category: "Non-Core",
            time_taken_minutes: Math.round(nonCoreMinutes / 3),
            creator_id: user.id,
            reviewer_id: MANAGER_OF[user.department === "Animation" ? "Animate" : user.department],
            deliverable_not_available: true,
            stage: user.department === "Animation" ? "Animate" : user.department,
            status: "Closed",
          })
        );
      }
    });
  });

  // ---- a few rows waiting for the manager to review
  const reviewer = (stage) => MANAGER_OF[stage];
  workItems
    .filter((w) => w.status === "Ready for Review")
    .forEach((w) => {
      w.reviewer_id = w.stage === "Content" ? "u-admin" : reviewer(w.stage);
    });

  // ---- project tracking sheet ("Projects" tab on the Work Sheet)
  const projectTasks = [
    ["Share revised carousel with Bluepeak for sign-off", "Client Follow-up", "c-bluepeak", "proj-1", "u-mgr-design", "On track", 1],
    ["Weekly status call with Lumen Health", "Client Meeting", "c-lumen", "proj-2", "u-mgr-content", "On track", 0],
    ["Compliance review turnaround for Aster launch film", "Client & Internal Follow-up", "c-aster", "proj-3", "u-admin", "At risk", -1],
    ["Confirm webinar date with Orbit Learning", "Client Follow-up", "c-orbit", "proj-4", "u-mgr-content", "Waiting on client", -2],
    ["Savora festive creatives: internal review", "Internal Review", "c-savora", "proj-5", "u-mgr-design", "Delayed", -3],
    ["Cost proposal for Orbit scholarship push", "Cost Proposal", "c-orbit", "proj-6", "u-admin", "On track", 2],
    ["Clinic opening date, awaiting confirmation", "Client Follow-up", "c-lumen", "proj-7", "u-mgr-content", "Waiting on client", 3],
    ["Invoice details sent to Northwind finance", "Admin", "c-northwind", "proj-8", "u-hr", "Done", -4],
  ].map(([task, type, client, project, owner, status, offset], i) => ({
    id: `pt-${i + 1}`,
    task,
    task_type: type,
    client_id: client,
    project_id: project,
    spoc: "",
    owner_id: owner,
    collaborator_ids: [],
    follow_up_teams: [],
    follow_up_user_ids: [],
    follow_up_others: "",
    internal_follow_up_date: dayOffset(offset),
    client_follow_up_date: dayOffset(offset + 1),
    status,
    delay_reason: status === "Delayed" ? "Waiting on final copy from the client" : "",
    meeting_time: type === "Client Meeting" ? "11:30" : "",
    deliverable_count: 1 + (i % 3),
    start_date: dayOffset(Math.min(offset, 0)),
    done_date: status === "Done" ? dayOffset(offset) : null,
    sort_order: i + 1,
    created_at: stamp(-5 + i),
    updated_at: stamp(-1),
  }));

  const notifications = [
    {
      id: "n-1",
      user_id: "u-admin",
      type: "approval_requested",
      title: "Approval needed",
      message: "Launch Film - 60s is waiting for Leadership approval.",
      read_at: null,
      action_type: null,
      created_at: stamp(0, 9, 15),
    },
    {
      id: "n-2",
      user_id: "u-admin",
      type: "deadline",
      title: "Deadline passed",
      message: "Festive Recipe Carousel was due 11 days ago.",
      read_at: null,
      action_type: null,
      created_at: stamp(0, 8, 0),
    },
    {
      id: "n-3",
      user_id: "u-admin",
      type: "review",
      title: "Ready for review",
      message: "Anika Sen marked Investor FAQ Carousel as Ready for Review.",
      read_at: new Date().toISOString(),
      action_type: null,
      created_at: stamp(-1, 16, 40),
    },
  ];

  return {
    users,
    clients,
    projects,
    deliverables,
    workItems,
    approvalItems,
    approvalWorkflows,
    approvalHistory,
    capacities,
    targets,
    projectTasks,
    projectTaskUpdates: [],
    notifications,
    counters: { project: projectNo, deliverable: deliverableNo, work: workNo, approval: approvalNo + 100 },
  };
};
