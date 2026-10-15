// Fill the Stakeholder (owner + collaborators) on Management tasks imported
// from the Projects Team Google Sheet.
// MongoDB Compass > mongosh:  use pmt  then paste.  Starts as a DRY RUN.
//
// The first import matched people by first name only. "Sakshi" matched two
// users (Sakshi Agrawal, Content team, and Sakshi Chaurasia), so it left those
// tasks without a stakeholder rather than guess. This uses full names.
//
// Only tasks from the sheet (legacy_key) whose owner is still empty are
// changed, so stakeholders already set by hand in PMT are kept.
// Safe to re-run. Writes only project_tasks (and logs to project_task_activity).

const DRY_RUN = true; // set false to write

// Sheet first name -> exact PMT user name.
const PEOPLE = {
  Shruti: /^shruti gawde$/i,
  Sakshi: /^sakshi chaurasia$/i,
};

// From the sheet: each task's stakeholder (first name written is the owner).
const TASKS = [
  {"legacy_key":"ipru|discussion of contra nfo positioning routes campaign ideas mirae game to be pitched","owner":"Shruti","collaborators":[]},
  {"legacy_key":"ipru|4 btl mfd kit ideas costing to be shared","owner":"Shruti","collaborators":[]},
  {"legacy_key":"ipru|mfd kit idea abc of passives","owner":"Shruti","collaborators":[]},
  {"legacy_key":"muthoot|demo video","owner":"Shruti","collaborators":[]},
  {"legacy_key":"ft|gift city launch nfo deliverable plan","owner":"Shruti","collaborators":[]},
  {"legacy_key":"ft|senior citizen project pending deliverables closure","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"sbi mf|quarterly newsletter cost proposal","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"sbi mf|quarterly newsletter content follow up","owner":"Shruti","collaborators":["Sakshi"]},
  {"legacy_key":"invesco|all projects sheet updation","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"invesco|summit asset allocator long short fund idea finalisation follow up","owner":"Shruti","collaborators":[]},
  {"legacy_key":"invesco|wrapper ideas review","owner":"Shruti","collaborators":[]},
  {"legacy_key":"amfi|sip multilingual 2 languages leaflets","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"iti mf|4 performance creatives updation and resizing","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"iti mf|factsheet video client will update us rahul","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"pnb housing|design layout client follow up on updated data","owner":"Shruti","collaborators":[]},
  {"legacy_key":"ask|team briefing for idea generation","owner":"Shruti","collaborators":[]},
  {"legacy_key":"absl|sif idea discussion follow up with client","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"absl|equity championship kv delivery","owner":"Shruti","collaborators":[]},
  {"legacy_key":"absl|bse etf video delivery","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"absl alt|client follow up on ppt theme shortlisting","owner":"Shruti","collaborators":[]},
  {"legacy_key":"absl alt|flexi video edit delivery","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"|pmt project addition regularisation","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"iti mf|factsheet video taking update from rahul","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"ipru|contra nfo deliverables follow up","owner":"Shruti","collaborators":[]},
  {"legacy_key":"invesco|summit nfo deliverables as per timelines","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"pnb housing|pnb report","owner":"Shruti","collaborators":[]},
  {"legacy_key":"ft|ft gift city internal discussion","owner":"Sakshi","collaborators":["Shruti"]},
  {"legacy_key":"absl|absl spl invoicing","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"invesco|sip calculator and merchandise","owner":"Shruti","collaborators":["Sakshi"]},
  {"legacy_key":"absl alt|emerging market ppt","owner":"Shruti","collaborators":[]},
  {"legacy_key":"absl|equity champions league","owner":"Shruti","collaborators":[]},
  {"legacy_key":"tata|changes in units ke dhani reel 1 with external agency","owner":"Shruti","collaborators":[]},
  {"legacy_key":"absl|goal based collateral","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"pnb housing|design layout","owner":"Shruti","collaborators":[]},
  {"legacy_key":"tata|tata ukd reel reviews","owner":"Shruti","collaborators":[]},
  {"legacy_key":"absl|bse index videos","owner":"Shruti","collaborators":[]},
  {"legacy_key":"absl|hindu calendar","owner":"Shruti","collaborators":[]},
  {"legacy_key":"absl|salary sip video change delivery","owner":"Shruti","collaborators":[]},
  {"legacy_key":"ipru|contra teaser onepager delivery","owner":"Shruti","collaborators":[]},
  {"legacy_key":"|campaign plan alignment","owner":"Shruti","collaborators":[]},
  {"legacy_key":"invesco|ie content 1 2 ig delivery","owner":"Shruti","collaborators":["Sakshi"]},
  {"legacy_key":"absl|flexicap av delivery","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"|deliverables alignment with team","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"sbi mf|quarterly newsletter","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"absl|team introductory call","owner":"Sakshi","collaborators":["Shruti"]},
  {"legacy_key":"pnb housing|revised copy draft confirmation","owner":"Shruti","collaborators":[]},
  {"legacy_key":"ask|cost approval confirmation","owner":"Shruti","collaborators":[]},
  {"legacy_key":"absl alt|2nd ppt theme shortlisting and 1st ppt copy draft","owner":"Shruti","collaborators":[]},
  {"legacy_key":"absl|bse index videos changes","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"invesco|sales enabler","owner":"Shruti","collaborators":["Sakshi"]},
  {"legacy_key":"ipru|contra nfo meeting for rest 2 ideas","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"ft|30 years of ft","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"ft|gift city deliverables follow up","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"amfi|amfi translation","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"amfi|content draft","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"ipru|collaterals timeline","owner":"Shruti","collaborators":[]},
  {"legacy_key":"absl|apex sif campaign discussion","owner":"Shruti","collaborators":["Sakshi"]},
  {"legacy_key":"canara robeco|digital photo booth","owner":"Shruti","collaborators":[]},
  {"legacy_key":"ft|senior citizen project pending deliverables","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"invesco|midcap sales enabler","owner":"Shruti","collaborators":["Sakshi"]},
  {"legacy_key":"ipru|additional ideas if client approved","owner":"Shruti","collaborators":[]},
  {"legacy_key":"invesco|flexicap ppt delivery","owner":"Shruti","collaborators":["Sakshi"]},
  {"legacy_key":"bajaj|monthly outlook ppt redesign","owner":"Shruti","collaborators":["Sakshi"]},
  {"legacy_key":"tata|units ke dhani 3 reels final review","owner":"Shruti","collaborators":[]},
  {"legacy_key":"invesco|invesco city of arbitrage carousel review","owner":"Shruti","collaborators":[]},
  {"legacy_key":"|invoicing","owner":"Shruti","collaborators":[]},
  {"legacy_key":"pnb housing|pnb white paper follow up","owner":"Shruti","collaborators":[]},
  {"legacy_key":"absl|sif project plan","owner":"Shruti","collaborators":[]},
  {"legacy_key":"bnp|nfo video","owner":"Shruti","collaborators":[]},
  {"legacy_key":"|invoicing absl spl","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"ipru|pharma etf nfo","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"absl|apex sif deliverables","owner":"Shruti","collaborators":["Sakshi"]},
  {"legacy_key":"amfi|amfi translation punjabi gujarati","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"|invoicing absl spl completion","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"bandhan|bandhan new project","owner":"Shruti","collaborators":["Sakshi"]},
  {"legacy_key":"|merchandise sop review","owner":"Shruti","collaborators":[]},
  {"legacy_key":"|basics of passive btl kit","owner":"Shruti","collaborators":["Sakshi"]},
  {"legacy_key":"|gift city ppt theme discussion","owner":"Shruti","collaborators":["Sakshi"]},
  {"legacy_key":"absl alt|2nd ppt theme copy","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"ipru|basics of passive btl kit","owner":"Shruti","collaborators":["Sakshi"]},
  {"legacy_key":"absl|follow up for script approval","owner":"Shruti","collaborators":[]},
  {"legacy_key":"absl alt|ppt design emerging market","owner":"Shruti","collaborators":[]},
  {"legacy_key":"invesco|sip calculator","owner":"Shruti","collaborators":[]},
  {"legacy_key":"ipru|basics of passive btl kit delivery","owner":"Shruti","collaborators":[]},
  {"legacy_key":"canara robeco|vision board standee design","owner":"Shruti","collaborators":[]},
  {"legacy_key":"|pmt regularisation meeting","owner":"Sakshi","collaborators":["Shruti"]},
  {"legacy_key":"bandhan|kahani one idiot ki","owner":"Shruti","collaborators":[]},
  {"legacy_key":"ipru|diwali ideas","owner":"Shruti","collaborators":[]},
  {"legacy_key":"absl alt|update to client about the emerging market ppt and revised script","owner":"Shruti","collaborators":[]},
  {"legacy_key":"sbi mf|meeting for project updates","owner":"Shruti","collaborators":[]},
  {"legacy_key":"invesco|swp calculator","owner":"Shruti","collaborators":[]},
  {"legacy_key":"baroda|bbnpp mf handbook","owner":"Shruti","collaborators":[]},
  {"legacy_key":"invesco|multi asset sif ppt design changes","owner":"Shruti","collaborators":[]},
  {"legacy_key":"absl alt|ppt design emerging market changes","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"invesco|swp sip calculator","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"absl|gift city merchandise","owner":"Shruti","collaborators":[]},
  {"legacy_key":"|align nfo deliverables with teams","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"invesco|chitpad calculator","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"|pmt data cleaning and new projects and deliberately addition","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"|coordinate with clients and give status update","owner":"Sakshi","collaborators":[]},
  {"legacy_key":"absl|absl ppt theme discussion with client","owner":"Sakshi","collaborators":[]}
];

const ids = {};
let ok = true;
Object.entries(PEOPLE).forEach(([k, re]) => {
  const hits = db.users.find({ name: { $regex: re } }, { _id: 0, id: 1, name: 1 }).toArray();
  if (hits.length !== 1) {
    ok = false;
    print(`PROBLEM: ${k} ${re} matches ${hits.length} users: ${hits.map((h) => h.name).join(" / ") || "none"}`);
  } else {
    ids[k] = hits[0].id;
    print(`${k.padEnd(7)} -> ${hits[0].name}`);
  }
});
if (!ok) throw new Error("Fix PEOPLE above, then run again.");

const now = new Date().toISOString();
let fill = 0, kept = 0, missing = 0;
const log = [];
TASKS.forEach((t) => {
  const doc = db.project_tasks.findOne(
    { legacy_key: t.legacy_key },
    { _id: 0, id: 1, task: 1, owner_id: 1, collaborator_ids: 1 }
  );
  if (!doc) { missing += 1; return; }
  if (doc.owner_id) { kept += 1; return; }
  const owner = ids[t.owner];
  const collab = [...new Set([...(doc.collaborator_ids || []), ...t.collaborators.map((p) => ids[p])])]
    .filter((x) => x && x !== owner);
  fill += 1;
  const who = t.owner + (t.collaborators.length ? " + " + t.collaborators.join(", ") : "");
  print(`  ${who.padEnd(18)} ${doc.task}`);
  if (!DRY_RUN) {
    db.project_tasks.updateOne({ id: doc.id }, { $set: { owner_id: owner, collaborator_ids: collab, updated_at: now } });
    log.push({
      id: require("crypto").randomUUID(),
      task_id: doc.id,
      field: "owner_id",
      old_value: null,
      new_value: owner,
      changed_by: null,
      changed_at: now,
    });
  }
});
if (log.length) db.project_task_activity.insertMany(log);
print(`\n${fill} tasks ${DRY_RUN ? "would get" : "got"} a stakeholder; ${kept} already had one (kept); ${missing} not found.`);
if (DRY_RUN) print("DRY RUN - nothing written. Set DRY_RUN = false and paste again to write.");
