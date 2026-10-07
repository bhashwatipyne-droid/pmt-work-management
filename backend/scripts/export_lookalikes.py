"""Export the projects the app flags "Looks like ..." into CSVs, with their deliverables,
so each group can be reviewed side by side (keep / merge / collapse).

The look-alike test is the same one the Projects page uses (frontend/src/lib/lookalikes.js,
buildLookalikeIndex), run over the same projects: every visible (not hidden) project.
Projects that look like each other are put in one numbered group, so a chain
A~B, B~C comes out as one group of three.

Reads only. Writes two files into --out-dir (default: the folder you run it from):

  lookalikes_deliverables.csv   one row per deliverable (a project with none gets one row
                                with the deliverable columns blank), sorted by group
  lookalikes_projects.csv       one row per project: its group, counts, and which other
                                projects in the group it shares deliverable names with

Usage (backend folder; MONGO_URL and DB_NAME in backend/.env or the terminal):
    python scripts/export_lookalikes.py
    python scripts/export_lookalikes.py --out-dir C:\\Users\\DELL\\Desktop
"""
import argparse
import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _common import connect  # noqa: E402

# ---------------------------------------------------------------------------
# A line-for-line port of frontend/src/lib/lookalikes.js. Keep the two in step.
# ---------------------------------------------------------------------------
CLIENT_FILLER = {
    "mutual", "fund", "funds", "mf", "amc", "asset", "assets", "management",
    "managers", "investment", "investments", "ltd", "limited", "pvt", "private",
    "india", "co", "company", "the", "and",
}
PROJECT_FILLER = {"the", "and", "for", "of", "a", "an", "to", "new", "project", "campaign"}


def client_words(name):
    text = str(name or "").lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return [w for w in text.split() if w and w not in CLIENT_FILLER]


def edit_distance(a, b):
    m, n = len(a), len(b)
    if not m or not n:
        return max(m, n)
    prev = list(range(n + 1))
    for i in range(1, m + 1):
        cur = [i]
        for j in range(1, n + 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (0 if a[i - 1] == b[j - 1] else 1)))
        prev = cur
    return prev[n]


def words_near(w, x):
    if w == x:
        return True
    if len(w) >= 3 and x.startswith(w):
        return True
    if len(x) >= 3 and w.startswith(x):
        return True
    length = min(len(w), len(x))
    if length < 4:
        return False
    limit = 2 if length >= 7 else 1
    return edit_distance(w, x) <= limit or edit_distance(w, x[:len(w)]) <= limit


def client_tokens(client_name):
    words = client_words(client_name)
    tokens = set(words)
    if len(words) > 1:
        tokens.add("".join(w[0] for w in words))
    return tokens


def project_words(name, client_name=""):
    drop = client_tokens(client_name)
    text = str(name or "").lower()
    text = re.sub(r"[_\-\u2013\u00b7]+", " ", text)
    text = re.sub(r"[^a-z0-9 ]+", "", text)
    words = [w for w in text.split() if w and w not in PROJECT_FILLER and w not in drop]
    return [re.sub(r"s$", "", w) for w in words]


def find_similar_projects(name, client_id, projects, client_name_of):
    raw = str(name or "").strip().lower()
    if len(raw) < 3:
        return []
    q_words = project_words(name, client_name_of(client_id))
    q = " ".join(q_words)
    out = []
    for project in projects:
        same = bool(client_id) and project["client_id"] == client_id
        p_words = project_words(project["name"], client_name_of(project["client_id"]))
        p = " ".join(p_words)
        score = 0
        if str(project["name"] or "").strip().lower() == raw:
            score = 100
        elif q and q == p:
            score = 92
        else:
            shared = [w for w in q_words if len(w) >= 3 and any(words_near(w, x) for x in p_words)]
            ratio = 1 - edit_distance(q, p) / max(len(q), len(p), 1)
            if ratio >= 0.8 and len(q) >= 5:
                score = 80
            elif len(shared) >= 2 or (len(shared) == 1 and min(len(q_words), len(p_words)) == 1):
                score = 50 + len(shared) * 8
        if not score:
            continue
        if same:
            score += 10
        elif client_id:
            score -= 25
        if score >= 30:
            out.append((score, project))
    out.sort(key=lambda pair: -pair[0])
    return [project for _, project in out[:4]]


def build_lookalike_index(projects, client_name_of):
    by_client, by_name = defaultdict(list), defaultdict(list)
    for p in projects:
        by_client[p["client_id"]].append(p)
        by_name[str(p["name"] or "").strip().lower()].append(p)
    index = {}
    for p in projects:
        siblings = [x for x in by_client[p["client_id"]] if x["id"] != p["id"]]
        twins = find_similar_projects(p["name"], p["client_id"], siblings, client_name_of)
        for x in by_name[str(p["name"] or "").strip().lower()]:
            if x["id"] != p["id"] and x not in twins:
                twins.append(x)
        if twins:
            index[p["id"]] = twins
    return index


# ---------------------------------------------------------------------------
def groups_from(index):
    """Connected groups of projects that look like each other: id -> group number."""
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for pid, twins in index.items():
        for t in twins:
            parent[find(pid)] = find(t["id"])
    members = defaultdict(list)
    for pid in list(parent):
        members[find(pid)].append(pid)
    return members


def norm(text):
    return re.sub(r"[\W_]+", " ", str(text or "").casefold()).strip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out-dir", default=".", help="folder for the two CSV files (default: here)")
    args = parser.parse_args()
    db = connect()

    clients = {c["id"]: c for c in db.clients.find({}, {"_id": 0})}
    projects = []
    for p in db.projects.find({"hidden": {"$ne": True}}, {"_id": 0}):
        p.setdefault("client_id", None)
        p["client_name"] = (clients.get(p["client_id"]) or {}).get("name", "")
        projects.append(p)
    by_id = {p["id"]: p for p in projects}
    client_name_of = lambda cid: (clients.get(cid) or {}).get("name", "")  # noqa: E731

    index = build_lookalike_index(projects, client_name_of)
    members = groups_from(index)
    print(f"{len(projects)} visible projects; {len(index)} flagged 'Looks like', in {len(members)} groups.")
    if not members:
        return 0

    ids = [pid for group in members.values() for pid in group]
    deliverables = defaultdict(list)
    for d in db.deliverables.find({"project_id": {"$in": ids}}, {"_id": 0}):
        deliverables[d["project_id"]].append(d)
    work = {
        row["_id"]: row["n"] for row in db.work_items.aggregate([
            {"$match": {"project_id": {"$in": ids}}}, {"$group": {"_id": "$project_id", "n": {"$sum": 1}}},
        ])
    }

    def contact(p):
        c = clients.get(p["client_id"]) or {}
        for person in c.get("contact_persons") or []:
            if p.get("poc_id") and person.get("id") == p["poc_id"]:
                return person.get("name", "")
        return c.get("contact_person", "") if not p.get("poc_id") else ""

    # Number the groups largest first, then by name, and order projects inside each.
    ordered = sorted(members.values(), key=lambda g: (-len(g), min(norm(by_id[i]["name"]) for i in g)))
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    f_deliv, f_proj = out_dir / "lookalikes_deliverables.csv", out_dir / "lookalikes_projects.csv"

    with open(f_deliv, "w", newline="", encoding="utf-8-sig") as fd, open(f_proj, "w", newline="", encoding="utf-8-sig") as fp:
        wd, wp = csv.writer(fd), csv.writer(fp)
        base = ["group", "project_id", "code", "project", "client", "status", "contact", "start_date", "end_date", "created",
                "imported_from_sheet", "deliverables", "work_items"]
        wd.writerow(base + ["deliverable", "type", "stage", "stage_status"])
        wp.writerow(base + ["same_name_as", "shares_deliverable_names_with"])

        for number, group in enumerate(ordered, start=1):
            group.sort(key=lambda i: (norm(by_id[i]["name"]), by_id[i].get("created_at") or ""))
            names_in = {i: {norm(d.get("name")) for d in deliverables[i] if norm(d.get("name"))} for i in group}
            for pid in group:
                p = by_id[pid]
                row = [number, pid, p.get("code") or "", p["name"], p["client_name"], p.get("status", ""), contact(p),
                       p.get("start_date") or "", p.get("end_date") or "", (p.get("created_at") or "")[:10],
                       "yes" if pid.startswith("PROJECT - ") else "", len(deliverables[pid]), work.get(pid, 0)]
                same = [o for o in group if o != pid and norm(by_id[o]["name"]) == norm(p["name"])]
                shares = [f"{o} ({len(names_in[pid] & names_in[o])})" for o in group
                          if o != pid and names_in[pid] & names_in[o]]
                wp.writerow(row + [", ".join(same), ", ".join(shares)])
                items = sorted(deliverables[pid], key=lambda d: (d.get("current_stage") or "", d.get("name") or ""))
                if not items:
                    wd.writerow(row + ["", "", "", ""])
                for d in items:
                    wd.writerow(row + [d.get("name", ""), d.get("type", ""), d.get("current_stage", ""), d.get("stage_status", "")])

    print(f"Written:\n  {f_deliv.resolve()}\n  {f_proj.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
