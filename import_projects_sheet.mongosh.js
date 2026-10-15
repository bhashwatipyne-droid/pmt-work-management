// Import the Projects Team Google Sheet ("Projects Team - Task List") into the
// Work Sheet's Projects tab.
// MongoDB Compass > mongosh:  use pmt  then paste.  Starts as a DRY RUN.
//
// The sheet copied the whole list to a new date block every day (368 rows, 17
// days). Here each real task is ONE row:
//  - start_date  = the first day it appears in the sheet
//  - still on the last day's list (13-Oct-2026) -> open; otherwise Done, with
//    done_date = the next day of the sheet (the day it dropped off the list)
//  - fields come from its LAST copy; the sheet's text is kept in `legacy`
//  - each day its Tracking Status / Remark changed -> that day's update note
//  - task types normalised, SPOC split out of "Client Call - Arvind" /
//    "ABSL - Ahsaan", Stakeholder -> owner + collaborators (first name written
//    is the owner), "Internal Follow-up with" -> teams / people / others
// A task renamed in the sheet ("SIP Calculator" -> "Swp + sip Calculator")
// shows as the old one Done and the new one starting that day.
//
// Clients and people are matched against the database below. Anything that
// does not match exactly one is reported and left blank, never guessed - fix
// CLIENTS / PEOPLE and re-run the dry run until the report is clean.
// Safe to re-run: tasks already imported (same legacy_key) are skipped.
// Writes only project_tasks and project_task_updates (never work_items).

const DRY_RUN = true; // set false to write

// Sheet short name -> patterns tried in order; the first that matches exactly
// one client wins.
const CLIENTS = {
  "IPru": [/^icici prudential mutual fund$/i, /icici pru/i],
  "ABSL Alt": [/^aditya birla alternative/i, /aditya birla.*altern/i],
  "ABSL": [/^aditya birla sun life mutual fund$/i, /^aditya birla sun life/i],
  "Invesco": [/^invesco mutual fund$/i, /^invesco$/i, /^invesco/i],
  "TATA": [/^tata mutual fund$/i, /^tata asset/i, /^tata/i],
  "PNB Housing": [/pnb housing/i],
  "SBI MF": [/^sbi mutual fund$/i, /^sbi (mf|funds)/i, /^sbi/i],
  "ITI MF": [/^iti mutual fund$/i, /^iti/i],
  "FT": [/^franklin templeton/i, /franklin/i],
  "Canara Robeco": [/canara robeco/i],
  "AMFI": [/^amfi/i, /association of mutual funds/i],
  "Muthoot": [/muthoot/i],
  "ASK": [/^ask\b/i],
  "Bajaj": [/^bajaj finserv (mutual fund|amc)/i, /^bajaj/i],
  "BNP": [/baroda bnp/i, /bnp/i],
  "Baroda": [/baroda bnp/i, /^bank of baroda/i],
  "Bandhan": [/^bandhan mutual fund$/i, /^bandhan/i],
};
// First names used in the sheet -> patterns on users.name.
const PEOPLE = {
  Shruti: [/^shruti\b/i],
  Sakshi: [/^sakshi\b/i],
  Gaurav: [/^gaurav mody$/i, /^gaurav\b/i],
  Sumeet: [/^sumeet\b/i],
  Nirav: [/^nirav\b/i],
};

const TASKS = [
 {
  "legacy_key": "ipru|discussion of contra nfo positioning routes campaign ideas mirae game to be pitched",
  "task": "Discussion of Contra NFO Positioning Routes + Campaign ideas (Mirae game to be pitched)",
  "task_type": "Client Meeting",
  "client_key": "IPru",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Content",
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": null,
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "11.30-12",
  "deliverable_count": null,
  "start_date": "2026-09-09",
  "done_date": "2026-09-11",
  "notes": [
   {
    "day": "2026-09-09",
    "note": "On track"
   }
  ],
  "legacy": {
   "task_type": "Client Meeting",
   "client": "IPru MF",
   "stakeholder": "Shruti",
   "follow_up_with": "Content, Design",
   "tracking_status": "On track"
  }
 },
 {
  "legacy_key": "ipru|4 btl mfd kit ideas costing to be shared",
  "task": "4 BTL MFD Kit ideas costing to be shared",
  "task_type": "Cost Proposal",
  "client_key": "IPru",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Accounts"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-09",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-09",
  "done_date": "2026-09-10",
  "notes": [
   {
    "day": "2026-09-09",
    "note": "1 Day Delay"
   }
  ],
  "legacy": {
   "task_type": "Cost Proposal",
   "client": "IPru MF",
   "stakeholder": "Shruti",
   "follow_up_with": "Accounts",
   "tracking_status": "1 Day Delay"
  }
 },
 {
  "legacy_key": "ipru|mfd kit idea abc of passives",
  "task": "MFD Kit idea - ABC of Passives",
  "task_type": "Internal Review",
  "client_key": "IPru",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-09",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-09",
  "done_date": "2026-09-10",
  "notes": [
   {
    "day": "2026-09-09",
    "note": "2 Days Delay"
   }
  ],
  "legacy": {
   "task_type": "Internal Review",
   "client": "IPru MF",
   "stakeholder": "Shruti",
   "follow_up_with": "Design",
   "tracking_status": "2 Days Delay"
  }
 },
 {
  "legacy_key": "muthoot|demo video",
  "task": "Demo Video",
  "task_type": "Internal Review",
  "client_key": "Muthoot",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Animation"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-09",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": 1,
  "start_date": "2026-09-09",
  "done_date": "2026-09-18",
  "notes": [
   {
    "day": "2026-09-09",
    "note": "On track"
   },
   {
    "day": "2026-09-10",
    "note": "Might get delayed"
   }
  ],
  "legacy": {
   "task_type": "Internal Review",
   "client": "Muthoot",
   "stakeholder": "Shruti",
   "follow_up_with": "Animation",
   "tracking_status": "Might get delayed"
  }
 },
 {
  "legacy_key": "ft|gift city launch nfo deliverable plan",
  "task": "Gift City Launch NFO Deliverable Plan",
  "task_type": "Internal Meeting",
  "client_key": "FT",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Content"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-09",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-09",
  "done_date": "2026-09-18",
  "notes": [
   {
    "day": "2026-09-09",
    "note": "1 Day Delay"
   },
   {
    "day": "2026-09-10",
    "note": "2 Day Delay"
   },
   {
    "day": "2026-09-11",
    "note": "3 Day Delay"
   }
  ],
  "legacy": {
   "task_type": "Internal Discussion",
   "client": "FT",
   "stakeholder": "Shruti",
   "follow_up_with": "Content",
   "tracking_status": "3 Day Delay"
  }
 },
 {
  "legacy_key": "ft|senior citizen project pending deliverables closure",
  "task": "Senior Citizen Project - pending deliverables closure",
  "task_type": "Internal Follow-up",
  "client_key": "FT",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [
   "Content",
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-23",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-09",
  "done_date": "2026-09-24",
  "notes": [
   {
    "day": "2026-09-09",
    "note": "On track"
   }
  ],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "FT",
   "stakeholder": "Sakshi",
   "follow_up_with": "Content, Design",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "sbi mf|quarterly newsletter cost proposal",
  "task": "Quarterly Newsletter Cost Proposal",
  "task_type": "Cost Proposal",
  "client_key": "SBI MF",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [
   "Accounts"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-10",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-09",
  "done_date": "2026-09-18",
  "notes": [
   {
    "day": "2026-09-09",
    "note": "1 Day Delay · Yet to discuss and send it"
   },
   {
    "day": "2026-09-10",
    "note": "2 Day Delay · Yet to discuss and send it"
   },
   {
    "day": "2026-09-11",
    "note": "3 Day Delay"
   }
  ],
  "legacy": {
   "task_type": "Cost Proposal",
   "client": "SBI MF",
   "stakeholder": "Sakshi",
   "follow_up_with": "Accounts",
   "tracking_status": "3 Day Delay"
  }
 },
 {
  "legacy_key": "sbi mf|quarterly newsletter content follow up",
  "task": "Quarterly Newsletter - Content follow up",
  "task_type": "Internal Follow-up",
  "client_key": "SBI MF",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [
   "Sakshi"
  ],
  "follow_up_teams": [
   "Content",
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-09",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-09",
  "done_date": "2026-09-18",
  "notes": [
   {
    "day": "2026-09-09",
    "note": "On track · will discuss after the cost is sent"
   },
   {
    "day": "2026-09-11",
    "note": "On track"
   }
  ],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "SBI MF",
   "stakeholder": "Shruti Sakshi",
   "follow_up_with": "Content, Design",
   "tracking_status": "On track"
  }
 },
 {
  "legacy_key": "invesco|all projects sheet updation",
  "task": "All Projects - Sheet Updation",
  "task_type": "Internal Follow-up",
  "client_key": "Invesco",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [
   "Content",
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-09",
  "client_follow_up_date": "2026-09-09",
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-09",
  "done_date": "2026-09-10",
  "notes": [
   {
    "day": "2026-09-09",
    "note": "On track"
   }
  ],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "Invesco",
   "stakeholder": "Sakshi",
   "follow_up_with": "Content, Design",
   "tracking_status": "On track"
  }
 },
 {
  "legacy_key": "invesco|summit asset allocator long short fund idea finalisation follow up",
  "task": "Summit Asset Allocator Long-Short Fund Idea finalisation follow-up",
  "task_type": "Client Follow-up",
  "client_key": "Invesco",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": null,
  "client_follow_up_date": "2026-09-09",
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-09",
  "done_date": "2026-09-10",
  "notes": [
   {
    "day": "2026-09-09",
    "note": "On track"
   }
  ],
  "legacy": {
   "task_type": "Client Follow-up",
   "client": "Invesco",
   "stakeholder": "Shruti",
   "follow_up_with": "-",
   "tracking_status": "On track"
  }
 },
 {
  "legacy_key": "invesco|wrapper ideas review",
  "task": "Wrapper Ideas Review",
  "task_type": "Internal Review",
  "client_key": "Invesco",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Content",
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-09",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-09",
  "done_date": "2026-09-10",
  "notes": [
   {
    "day": "2026-09-09",
    "note": "On track"
   }
  ],
  "legacy": {
   "task_type": "Internal Review",
   "client": "Invesco",
   "stakeholder": "Shruti",
   "follow_up_with": "Content, Design",
   "tracking_status": "On track"
  }
 },
 {
  "legacy_key": "amfi|sip multilingual 2 languages leaflets",
  "task": "SIP Multilingual - 2 languages leaflets",
  "task_type": "Quality Check",
  "client_key": "AMFI",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-09",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-09",
  "done_date": "2026-09-10",
  "notes": [
   {
    "day": "2026-09-09",
    "note": "On track"
   }
  ],
  "legacy": {
   "task_type": "Quality Check",
   "client": "AMFI",
   "stakeholder": "Sakshi",
   "follow_up_with": "Design",
   "tracking_status": "On track"
  }
 },
 {
  "legacy_key": "iti mf|4 performance creatives updation and resizing",
  "task": "4 Performance creatives updation and Resizing",
  "task_type": "Internal Follow-up",
  "client_key": "ITI MF",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-18",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "not recieved the factsheet",
  "meeting_time": "",
  "deliverable_count": 4,
  "start_date": "2026-09-09",
  "done_date": "2026-09-21",
  "notes": [
   {
    "day": "2026-09-09",
    "note": "On track"
   },
   {
    "day": "2026-09-10",
    "note": "1 Day Delay"
   },
   {
    "day": "2026-09-18",
    "note": "Delayed due to not recieved the factsheet"
   }
  ],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "ITI MF",
   "stakeholder": "Sakshi",
   "follow_up_with": "Design",
   "tracking_status": "Delayed due to not recieved the factsheet"
  }
 },
 {
  "legacy_key": "iti mf|factsheet video client will update us rahul",
  "task": "Factsheet Video - Client will update us (rahul)",
  "task_type": "Internal Follow-up",
  "client_key": "ITI MF",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [
   "Design",
   "Animation"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-09",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-09",
  "done_date": "2026-09-10",
  "notes": [
   {
    "day": "2026-09-09",
    "note": "On track"
   }
  ],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "ITI MF",
   "stakeholder": "Sakshi",
   "follow_up_with": "Design, Animation",
   "tracking_status": "On track"
  }
 },
 {
  "legacy_key": "pnb housing|design layout client follow up on updated data",
  "task": "Design Layout + Client Follow up on updated data",
  "task_type": "Internal Review",
  "client_key": "PNB Housing",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Content",
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-09",
  "client_follow_up_date": "2026-09-09",
  "status": "Done",
  "delay_reason": "Design layout",
  "meeting_time": "",
  "deliverable_count": 1,
  "start_date": "2026-09-09",
  "done_date": "2026-09-18",
  "notes": [
   {
    "day": "2026-09-09",
    "note": "On track"
   },
   {
    "day": "2026-09-10",
    "note": "1 Day Delay - Design layout"
   }
  ],
  "legacy": {
   "task_type": "Internal Review",
   "client": "PNB Housing",
   "stakeholder": "Shruti",
   "follow_up_with": "Content, Design",
   "tracking_status": "1 Day Delay - Design layout"
  }
 },
 {
  "legacy_key": "ask|team briefing for idea generation",
  "task": "Team briefing for idea generation",
  "task_type": "Internal Briefing",
  "client_key": "ASK",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Content",
   "Design",
   "Animation"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": null,
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-09",
  "done_date": "2026-09-21",
  "notes": [
   {
    "day": "2026-09-10",
    "note": "1 Day Delay"
   },
   {
    "day": "2026-09-11",
    "note": "2 Day Delay"
   },
   {
    "day": "2026-09-18",
    "note": "4 Day Delay"
   }
  ],
  "legacy": {
   "task_type": "Internal Briefing",
   "client": "ASK",
   "stakeholder": "Shruti",
   "follow_up_with": "All 3",
   "tracking_status": "4 Day Delay"
  }
 },
 {
  "legacy_key": "absl|sif idea discussion follow up with client",
  "task": "SIF Idea discussion follow-up with client",
  "task_type": "Client Follow-up",
  "client_key": "ABSL",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [
   "Content"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-09",
  "client_follow_up_date": "2026-09-09",
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "TBD",
  "deliverable_count": null,
  "start_date": "2026-09-09",
  "done_date": "2026-09-10",
  "notes": [
   {
    "day": "2026-09-09",
    "note": "1 Day Delay · Start work after the cost is approved"
   }
  ],
  "legacy": {
   "task_type": "Client Follow-up",
   "client": "ABSL",
   "stakeholder": "Sakshi",
   "follow_up_with": "Content",
   "tracking_status": "1 Day Delay"
  }
 },
 {
  "legacy_key": "absl|equity championship kv delivery",
  "task": "Equity Championship - KV delivery",
  "task_type": "Internal Review",
  "client_key": "ABSL",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Content",
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-09",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": 1,
  "start_date": "2026-09-09",
  "done_date": "2026-09-18",
  "notes": [
   {
    "day": "2026-09-10",
    "note": "1 Day Delay"
   }
  ],
  "legacy": {
   "task_type": "Internal Review",
   "client": "ABSL",
   "stakeholder": "Shruti",
   "follow_up_with": "Content, Design",
   "tracking_status": "1 Day Delay"
  }
 },
 {
  "legacy_key": "absl|bse etf video delivery",
  "task": "BSE - ETF Video Delivery",
  "task_type": "Internal Follow-up",
  "client_key": "ABSL",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [
   "Animation"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-09",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-09",
  "done_date": "2026-09-10",
  "notes": [
   {
    "day": "2026-09-09",
    "note": "On track"
   }
  ],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "ABSL",
   "stakeholder": "Sakshi",
   "follow_up_with": "Animation",
   "tracking_status": "On track"
  }
 },
 {
  "legacy_key": "absl alt|client follow up on ppt theme shortlisting",
  "task": "Client follow-up on PPT theme shortlisting",
  "task_type": "Client Follow-up",
  "client_key": "ABSL Alt",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": null,
  "client_follow_up_date": "2026-09-09",
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-09",
  "done_date": "2026-09-21",
  "notes": [
   {
    "day": "2026-09-09",
    "note": "On track"
   }
  ],
  "legacy": {
   "task_type": "Client Follow-up",
   "client": "ABSL Alt",
   "stakeholder": "Shruti",
   "follow_up_with": "-",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "absl alt|flexi video edit delivery",
  "task": "Flexi Video edit - delivery",
  "task_type": "Internal Follow-up",
  "client_key": "ABSL Alt",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [
   "Animation"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-09",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": 1,
  "start_date": "2026-09-09",
  "done_date": "2026-09-18",
  "notes": [
   {
    "day": "2026-09-10",
    "note": "1 Day Delay"
   }
  ],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "ABSL Alt",
   "stakeholder": "Sakshi",
   "follow_up_with": "Animation",
   "tracking_status": "1 Day Delay"
  }
 },
 {
  "legacy_key": "|pmt project addition regularisation",
  "task": "PMT Project Addition + Regularisation",
  "task_type": "Internal Follow-up",
  "client_key": "",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [
   "Content",
   "Design",
   "Animation"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-13",
  "client_follow_up_date": null,
  "status": "On track",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-09",
  "done_date": null,
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "FinAce",
   "stakeholder": "Sakshi",
   "follow_up_with": "All 3",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "iti mf|factsheet video taking update from rahul",
  "task": "Factsheet Video - Taking update from rahul",
  "task_type": "Client Follow-up",
  "client_key": "ITI MF",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": null,
  "client_follow_up_date": "2026-09-11",
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-10",
  "done_date": "2026-09-18",
  "notes": [
   {
    "day": "2026-09-10",
    "note": "On track"
   }
  ],
  "legacy": {
   "task_type": "Client Follow-up",
   "client": "ITI MF",
   "stakeholder": "Sakshi",
   "follow_up_with": "-",
   "tracking_status": "On track"
  }
 },
 {
  "legacy_key": "ipru|contra nfo deliverables follow up",
  "task": "Contra nfo deliverables follow up",
  "task_type": "Internal Follow-up",
  "client_key": "IPru",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Content",
   "Design",
   "Animation"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-09",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-10",
  "done_date": "2026-10-13",
  "notes": [
   {
    "day": "2026-09-11",
    "note": "On track"
   }
  ],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "IPru MF",
   "stakeholder": "Shruti",
   "follow_up_with": "All 3",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "invesco|summit nfo deliverables as per timelines",
  "task": "Summit nfo deliverables - as per timelines",
  "task_type": "Internal Follow-up",
  "client_key": "Invesco",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [
   "Content",
   "Design",
   "Animation"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-13",
  "client_follow_up_date": null,
  "status": "On track",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-10",
  "done_date": null,
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "Invesco",
   "stakeholder": "Sakshi",
   "follow_up_with": "All 3",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "pnb housing|pnb report",
  "task": "pnb report",
  "task_type": "Client & Internal Follow-up",
  "client_key": "PNB Housing",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Content"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-10",
  "client_follow_up_date": "2026-09-10",
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-10",
  "done_date": "2026-09-18",
  "notes": [
   {
    "day": "2026-09-11",
    "note": "On track"
   }
  ],
  "legacy": {
   "task_type": "Client & Internal Follow-up",
   "client": "PNB Housing",
   "stakeholder": "Shruti",
   "follow_up_with": "Content",
   "tracking_status": "On track"
  }
 },
 {
  "legacy_key": "ft|ft gift city internal discussion",
  "task": "FT GIFT City Internal Discussion",
  "task_type": "Internal Briefing",
  "client_key": "FT",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [
   "Shruti"
  ],
  "follow_up_teams": [
   "Content"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-10",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-10",
  "done_date": "2026-09-11",
  "notes": [],
  "legacy": {
   "task_type": "Internal Briefing",
   "client": "FT",
   "stakeholder": "Sakshi & Shruti",
   "follow_up_with": "Content",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "absl|absl spl invoicing",
  "task": "ABSL SPL Invoicing",
  "task_type": "Admin",
  "client_key": "ABSL",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-10",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-10",
  "done_date": "2026-09-11",
  "notes": [],
  "legacy": {
   "task_type": "Internal",
   "client": "ABSL",
   "stakeholder": "Sakshi",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "invesco|sip calculator and merchandise",
  "task": "SIP Calculator and Merchandise",
  "task_type": "Internal Meeting",
  "client_key": "Invesco",
  "spoc": "Shivaji",
  "owner": "Shruti",
  "collaborators": [
   "Sakshi"
  ],
  "follow_up_teams": [
   "Content",
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-05",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-11",
  "done_date": "2026-10-06",
  "notes": [],
  "legacy": {
   "task_type": "Internal Meeting",
   "client": "Invesco - Shivaji",
   "stakeholder": "Shruti sakshi",
   "follow_up_with": "Content, Design",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "absl alt|emerging market ppt",
  "task": "Emerging Market PPT",
  "task_type": "Client Call",
  "client_key": "ABSL Alt",
  "spoc": "Arvind",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-05",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-11",
  "done_date": "2026-10-06",
  "notes": [],
  "legacy": {
   "task_type": "Client Call - Arvind",
   "client": "ABSL Alt",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "absl|equity champions league",
  "task": "Equity Champions League",
  "task_type": "Internal Follow-up",
  "client_key": "ABSL",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-23",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-11",
  "done_date": "2026-09-24",
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "ABSL",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "tata|changes in units ke dhani reel 1 with external agency",
  "task": "changes in units ke dhani reel 1 with external agency",
  "task_type": "Internal Follow-up",
  "client_key": "TATA",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Content"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-11",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": 1,
  "start_date": "2026-09-11",
  "done_date": "2026-09-18",
  "notes": [
   {
    "day": "2026-09-11",
    "note": "1 Day Delay"
   }
  ],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "TATA MF",
   "stakeholder": "Shruti",
   "follow_up_with": "Content",
   "tracking_status": "1 Day Delay"
  }
 },
 {
  "legacy_key": "absl|goal based collateral",
  "task": "Goal based collateral",
  "task_type": "Vendor Follow-up",
  "client_key": "ABSL",
  "spoc": "Ahsaan",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [
   "Sumeet",
   "Nirav",
   "Gaurav"
  ],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-08",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-11",
  "done_date": "2026-10-09",
  "notes": [
   {
    "day": "2026-09-11",
    "note": "On track"
   },
   {
    "day": "2026-09-18",
    "note": "Delayed"
   }
  ],
  "legacy": {
   "task_type": "Vendor Follow-up",
   "client": "ABSL - Ahsaan",
   "stakeholder": "Sakshi",
   "follow_up_with": "Sumeet, Nirav, gaurav sir",
   "tracking_status": "Delayed"
  }
 },
 {
  "legacy_key": "pnb housing|design layout",
  "task": "Design Layout",
  "task_type": "Internal Review",
  "client_key": "PNB Housing",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Content",
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-18",
  "client_follow_up_date": "2026-09-09",
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": 1,
  "start_date": "2026-09-18",
  "done_date": "2026-09-21",
  "notes": [],
  "legacy": {
   "task_type": "Internal Review",
   "client": "PNB Housing",
   "stakeholder": "Shruti",
   "follow_up_with": "Content, Design",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "tata|tata ukd reel reviews",
  "task": "Tata UKD reel reviews",
  "task_type": "Internal Follow-up",
  "client_key": "TATA",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Video"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-23",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-18",
  "done_date": "2026-09-24",
  "notes": [],
  "legacy": {
   "task_type": "Internal",
   "client": "TATA MF",
   "stakeholder": "Shruti",
   "follow_up_with": "Video",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "absl|bse index videos",
  "task": "BSE Index videos",
  "task_type": "Internal Follow-up",
  "client_key": "ABSL",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Animation"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-18",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": 2,
  "start_date": "2026-09-18",
  "done_date": "2026-09-23",
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "ABSL",
   "stakeholder": "Shruti",
   "follow_up_with": "Animation",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "absl|hindu calendar",
  "task": "Hindu calendar",
  "task_type": "Client & Internal Follow-up",
  "client_key": "ABSL",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-28",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-18",
  "done_date": "2026-09-29",
  "notes": [],
  "legacy": {
   "task_type": "Client & Internal Follow-up",
   "client": "ABSL",
   "stakeholder": "Shruti",
   "follow_up_with": "Design",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "absl|salary sip video change delivery",
  "task": "Salary sip video change delivery",
  "task_type": "Internal Follow-up",
  "client_key": "ABSL",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-18",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-18",
  "done_date": "2026-09-23",
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "ABSL",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "ipru|contra teaser onepager delivery",
  "task": "Contra teaser onepager delivery",
  "task_type": "Internal Follow-up",
  "client_key": "IPru",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-18",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-18",
  "done_date": "2026-09-23",
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "IPru MF",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "|campaign plan alignment",
  "task": "Campaign plan alignment",
  "task_type": "Internal Follow-up",
  "client_key": "",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-21",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-18",
  "done_date": "2026-09-23",
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "invesco|ie content 1 2 ig delivery",
  "task": "IE content 1-2 IG delivery",
  "task_type": "Internal Follow-up",
  "client_key": "Invesco",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [
   "Sakshi"
  ],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-21",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-18",
  "done_date": "2026-09-23",
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "Invesco SIF",
   "stakeholder": "Shruti sakshi",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "absl|flexicap av delivery",
  "task": "Flexicap AV delivery",
  "task_type": "Internal Follow-up",
  "client_key": "ABSL",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-21",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-18",
  "done_date": "2026-09-23",
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "ABSL AMC",
   "stakeholder": "Sakshi",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "|deliverables alignment with team",
  "task": "Deliverables alignment with team",
  "task_type": "Internal Follow-up",
  "client_key": "",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [
   "Content",
   "Design",
   "Animation"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-24",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-18",
  "done_date": "2026-09-28",
  "notes": [],
  "legacy": {
   "task_type": "Internal",
   "client": "All",
   "stakeholder": "Sakshi",
   "follow_up_with": "All 3",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "sbi mf|quarterly newsletter",
  "task": "Quarterly newsletter",
  "task_type": "Client Follow-up",
  "client_key": "SBI MF",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": null,
  "client_follow_up_date": "2026-09-23",
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-18",
  "done_date": "2026-09-24",
  "notes": [],
  "legacy": {
   "task_type": "Client Follow-up",
   "client": "SBI MF",
   "stakeholder": "sakshi",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "absl|team introductory call",
  "task": "Team introductory call",
  "task_type": "Client Call",
  "client_key": "ABSL",
  "spoc": "Simran",
  "owner": "Sakshi",
  "collaborators": [
   "Shruti"
  ],
  "follow_up_teams": [
   "Content",
   "Design",
   "Animation"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-18",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "3 - 3:30",
  "deliverable_count": null,
  "start_date": "2026-09-18",
  "done_date": "2026-09-23",
  "notes": [],
  "legacy": {
   "task_type": "Client Call - Simran",
   "client": "ABSL AMC",
   "stakeholder": "Sakshi shruti",
   "follow_up_with": "All",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "pnb housing|revised copy draft confirmation",
  "task": "Revised Copy Draft confirmation",
  "task_type": "Internal Review",
  "client_key": "PNB Housing",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": null,
  "client_follow_up_date": "2026-09-22",
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": 1,
  "start_date": "2026-09-21",
  "done_date": "2026-09-23",
  "notes": [
   {
    "day": "2026-09-21",
    "note": "On track"
   }
  ],
  "legacy": {
   "task_type": "Internal Review",
   "client": "PNB Housing",
   "stakeholder": "Shruti",
   "follow_up_with": "-",
   "tracking_status": "On track"
  }
 },
 {
  "legacy_key": "ask|cost approval confirmation",
  "task": "Cost approval confirmation",
  "task_type": "Internal Follow-up",
  "client_key": "ASK",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Accounts"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": null,
  "client_follow_up_date": "2026-09-23",
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-21",
  "done_date": "2026-09-24",
  "notes": [
   {
    "day": "2026-09-21",
    "note": "On track"
   }
  ],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "ASK",
   "stakeholder": "Shruti",
   "follow_up_with": "Accounts",
   "tracking_status": "On track"
  }
 },
 {
  "legacy_key": "absl alt|2nd ppt theme shortlisting and 1st ppt copy draft",
  "task": "2nd PPT theme shortlisting and 1st PPT copy draft",
  "task_type": "Internal Follow-up",
  "client_key": "ABSL Alt",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Content"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-01",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-21",
  "done_date": "2026-10-05",
  "notes": [
   {
    "day": "2026-09-21",
    "note": "On track"
   }
  ],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "ABSL Alt",
   "stakeholder": "Shruti",
   "follow_up_with": "Content",
   "tracking_status": "On track"
  }
 },
 {
  "legacy_key": "absl|bse index videos changes",
  "task": "BSE Index videos changes",
  "task_type": "Internal Follow-up",
  "client_key": "ABSL",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [
   "Animation"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-21",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": 2,
  "start_date": "2026-09-21",
  "done_date": "2026-09-23",
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "ABSL",
   "stakeholder": "Sakshi",
   "follow_up_with": "Animation",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "invesco|sales enabler",
  "task": "Sales enabler",
  "task_type": "Internal Follow-up",
  "client_key": "Invesco",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [
   "Sakshi"
  ],
  "follow_up_teams": [
   "Content",
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-23",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-21",
  "done_date": "2026-09-24",
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "Invesco",
   "stakeholder": "Shruti sakshi",
   "follow_up_with": "Content, Design",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "ipru|contra nfo meeting for rest 2 ideas",
  "task": "Contra nfo meeting for rest 2 ideas",
  "task_type": "Client Follow-up",
  "client_key": "IPru",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-21",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-21",
  "done_date": "2026-09-23",
  "notes": [],
  "legacy": {
   "task_type": "Client Follow-up",
   "client": "IPru",
   "stakeholder": "sakshi",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "ft|30 years of ft",
  "task": "30 years of FT",
  "task_type": "Internal Follow-up",
  "client_key": "FT",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [
   "Content",
   "Animation"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-05",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-23",
  "done_date": "2026-10-06",
  "notes": [
   {
    "day": "2026-09-29",
    "note": "On track"
   }
  ],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "FT",
   "stakeholder": "Sakshi",
   "follow_up_with": "Content, Animation",
   "tracking_status": "On track"
  }
 },
 {
  "legacy_key": "ft|gift city deliverables follow up",
  "task": "Gift City deliverables follow up",
  "task_type": "Internal Follow-up",
  "client_key": "FT",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [
   "Content",
   "Design",
   "Animation"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-13",
  "client_follow_up_date": null,
  "status": "On track",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-23",
  "done_date": null,
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "FT",
   "stakeholder": "Sakshi",
   "follow_up_with": "All 3",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "amfi|amfi translation",
  "task": "AMFI Translation",
  "task_type": "Internal Follow-up",
  "client_key": "AMFI",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-29",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-23",
  "done_date": "2026-09-30",
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "AMFI",
   "stakeholder": "sakshi",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "amfi|content draft",
  "task": "Content Draft",
  "task_type": "Internal Follow-up",
  "client_key": "AMFI",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-24",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-23",
  "done_date": "2026-09-28",
  "notes": [],
  "legacy": {
   "task_type": "Internal",
   "client": "AMFI",
   "stakeholder": "Sakshi",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "ipru|collaterals timeline",
  "task": "Collaterals Timeline",
  "task_type": "Internal Follow-up",
  "client_key": "IPru",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-23",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-23",
  "done_date": "2026-09-24",
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "IPru",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "absl|apex sif campaign discussion",
  "task": "Apex sif campaign discussion",
  "task_type": "Client Meeting",
  "client_key": "ABSL",
  "spoc": "Ahsaan",
  "owner": "Shruti",
  "collaborators": [
   "Sakshi"
  ],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-28",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-23",
  "done_date": "2026-09-29",
  "notes": [],
  "legacy": {
   "task_type": "Client Meeting - Ahsaan",
   "client": "ABSL",
   "stakeholder": "Shruti sakshi",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "canara robeco|digital photo booth",
  "task": "Digital photo booth",
  "task_type": "Client Call",
  "client_key": "Canara Robeco",
  "spoc": "Prajakta",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": null,
  "client_follow_up_date": "2026-09-23",
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-23",
  "done_date": "2026-09-24",
  "notes": [],
  "legacy": {
   "task_type": "Client call - Prajakta",
   "client": "Canara Robeco",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "ft|senior citizen project pending deliverables",
  "task": "Senior Citizen Project - pending deliverables",
  "task_type": "Internal Follow-up",
  "client_key": "FT",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [
   "Content",
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-05",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "priotizing gift city",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-24",
  "done_date": "2026-10-06",
  "notes": [
   {
    "day": "2026-09-28",
    "note": "Delayed due to priotizing gift city"
   }
  ],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "FT",
   "stakeholder": "Sakshi",
   "follow_up_with": "Content, Design",
   "tracking_status": "Delayed due to priotizing gift city"
  }
 },
 {
  "legacy_key": "invesco|midcap sales enabler",
  "task": "Midcap Sales enabler",
  "task_type": "Internal Follow-up",
  "client_key": "Invesco",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [
   "Sakshi"
  ],
  "follow_up_teams": [
   "Content",
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-28",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-24",
  "done_date": "2026-09-29",
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "Invesco",
   "stakeholder": "Shruti sakshi",
   "follow_up_with": "Content, Design",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "ipru|additional ideas if client approved",
  "task": "Additional Ideas - if client approved",
  "task_type": "Internal Follow-up",
  "client_key": "IPru",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-24",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-24",
  "done_date": "2026-09-28",
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "IPru",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "invesco|flexicap ppt delivery",
  "task": "Flexicap PPT delivery",
  "task_type": "Internal Follow-up",
  "client_key": "Invesco",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [
   "Sakshi"
  ],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-24",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-24",
  "done_date": "2026-09-28",
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "Invesco",
   "stakeholder": "Shruti sakshi",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "|deliverables qc",
  "task": "Deliverables QC",
  "task_type": "Quality Check",
  "client_key": "",
  "spoc": "",
  "owner": "",
  "collaborators": [],
  "follow_up_teams": [
   "Content",
   "Design",
   "Animation"
  ],
  "follow_up_people": [],
  "follow_up_others": "Team TL",
  "internal_follow_up_date": "2026-10-13",
  "client_follow_up_date": null,
  "status": "On track",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-24",
  "done_date": null,
  "notes": [],
  "legacy": {
   "task_type": "All",
   "client": "All",
   "stakeholder": "Team TL",
   "follow_up_with": "All 3",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "bajaj|monthly outlook ppt redesign",
  "task": "Monthly Outlook PPT - Redesign",
  "task_type": "Client Call",
  "client_key": "Bajaj",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [
   "Sakshi"
  ],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-24",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-24",
  "done_date": "2026-09-28",
  "notes": [],
  "legacy": {
   "task_type": "Client Call",
   "client": "Bajaj",
   "stakeholder": "Shruti sakshi",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "tata|units ke dhani 3 reels final review",
  "task": "Units ke dhani 3 reels final review",
  "task_type": "Internal Follow-up",
  "client_key": "TATA",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-24",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-24",
  "done_date": "2026-09-28",
  "notes": [],
  "legacy": {
   "task_type": "Internal",
   "client": "TATA",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "invesco|invesco city of arbitrage carousel review",
  "task": "Invesco city of arbitrage carousel review",
  "task_type": "Internal Follow-up",
  "client_key": "Invesco",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-24",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-24",
  "done_date": "2026-09-28",
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "Invesco",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "|invoicing",
  "task": "invoicing",
  "task_type": "Admin",
  "client_key": "",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-24",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-24",
  "done_date": "2026-09-28",
  "notes": [],
  "legacy": {
   "task_type": "Internal",
   "client": "All",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "pnb housing|pnb white paper follow up",
  "task": "PNB white paper follow up",
  "task_type": "Client Call",
  "client_key": "PNB Housing",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": null,
  "client_follow_up_date": "2026-09-24",
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-24",
  "done_date": "2026-09-28",
  "notes": [],
  "legacy": {
   "task_type": "Client Call",
   "client": "PNB",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "absl|sif project plan",
  "task": "Sif project plan",
  "task_type": "Client & Internal Follow-up",
  "client_key": "ABSL",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-24",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-24",
  "done_date": "2026-09-28",
  "notes": [],
  "legacy": {
   "task_type": "Client & Internal Follow-up",
   "client": "ABSL",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "bnp|nfo video",
  "task": "NFO Video",
  "task_type": "Client & Internal Follow-up",
  "client_key": "BNP",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-24",
  "client_follow_up_date": "2026-09-24",
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-24",
  "done_date": "2026-09-28",
  "notes": [],
  "legacy": {
   "task_type": "Client & Internal Follow-up",
   "client": "BNP",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "|invoicing absl spl",
  "task": "invoicing - absl spl",
  "task_type": "Admin",
  "client_key": "",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-29",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-28",
  "done_date": "2026-09-30",
  "notes": [],
  "legacy": {
   "task_type": "Internal",
   "client": "All",
   "stakeholder": "Sakshi",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "ipru|pharma etf nfo",
  "task": "Pharma ETF NFO",
  "task_type": "Client Call",
  "client_key": "IPru",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-13",
  "client_follow_up_date": null,
  "status": "On track",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-29",
  "done_date": null,
  "notes": [],
  "legacy": {
   "task_type": "internal and client call",
   "client": "IPru MF",
   "stakeholder": "Sakshi",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "absl|apex sif deliverables",
  "task": "Apex sif Deliverables",
  "task_type": "Client Meeting",
  "client_key": "ABSL",
  "spoc": "Ahsaan",
  "owner": "Shruti",
  "collaborators": [
   "Sakshi"
  ],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-30",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-29",
  "done_date": "2026-10-01",
  "notes": [],
  "legacy": {
   "task_type": "Client Meeting - Ahsaan",
   "client": "ABSL",
   "stakeholder": "Shruti sakshi",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "amfi|amfi translation punjabi gujarati",
  "task": "AMFI Translation - Punjabi & Gujarati",
  "task_type": "Internal Follow-up",
  "client_key": "AMFI",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-30",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-30",
  "done_date": "2026-10-01",
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "AMFI",
   "stakeholder": "sakshi",
   "follow_up_with": "Design",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "|invoicing absl spl completion",
  "task": "invoicing - absl spl completion",
  "task_type": "Admin",
  "client_key": "",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-09-30",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-30",
  "done_date": "2026-10-01",
  "notes": [
   {
    "day": "2026-09-30",
    "note": "1 day delayed"
   }
  ],
  "legacy": {
   "task_type": "Internal",
   "client": "All",
   "stakeholder": "Sakshi",
   "follow_up_with": "",
   "tracking_status": "1 day delayed"
  }
 },
 {
  "legacy_key": "bandhan|bandhan new project",
  "task": "Bandhan New project",
  "task_type": "Internal Briefing",
  "client_key": "Bandhan",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [
   "Sakshi"
  ],
  "follow_up_teams": [],
  "follow_up_people": [
   "Gaurav"
  ],
  "follow_up_others": "Team",
  "internal_follow_up_date": "2026-10-01",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-30",
  "done_date": "2026-10-05",
  "notes": [],
  "legacy": {
   "task_type": "Internal Briefing",
   "client": "Bandhan",
   "stakeholder": "Shruti sakshi",
   "follow_up_with": "Gaurav sir, Team",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "|merchandise sop review",
  "task": "Merchandise sop Review",
  "task_type": "Internal Follow-up",
  "client_key": "",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-07",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-30",
  "done_date": "2026-10-08",
  "notes": [
   {
    "day": "2026-10-01",
    "note": "1 day delayed"
   }
  ],
  "legacy": {
   "task_type": "Internal",
   "client": "",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": "1 day delayed"
  }
 },
 {
  "legacy_key": "|finace process optimisation",
  "task": "FinAce process optimisation",
  "task_type": "Internal Follow-up",
  "client_key": "",
  "spoc": "",
  "owner": "",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "Core Team",
  "internal_follow_up_date": "2026-09-30",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-09-30",
  "done_date": "2026-10-01",
  "notes": [],
  "legacy": {
   "task_type": "Internal",
   "client": "",
   "stakeholder": "Core Team",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "amfi|amfi translation gujarati",
  "task": "AMFI Translation - Gujarati",
  "task_type": "Internal Follow-up",
  "client_key": "AMFI",
  "spoc": "",
  "owner": "",
  "collaborators": [],
  "follow_up_teams": [
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-05",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-01",
  "done_date": "2026-10-06",
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "AMFI",
   "stakeholder": "",
   "follow_up_with": "Design",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "|finace process optimisation to share timelines after discussion",
  "task": "FinAce process optimisation to share timelines after discussion",
  "task_type": "Internal Follow-up",
  "client_key": "",
  "spoc": "",
  "owner": "",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "Core Team",
  "internal_follow_up_date": "2026-10-05",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-01",
  "done_date": "2026-10-06",
  "notes": [],
  "legacy": {
   "task_type": "Internal",
   "client": "",
   "stakeholder": "Core Team",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "|basics of passive btl kit",
  "task": "Basics of passive - BTL Kit",
  "task_type": "Internal Follow-up",
  "client_key": "",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [
   "Sakshi"
  ],
  "follow_up_teams": [
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-01",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-01",
  "done_date": "2026-10-05",
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "",
   "stakeholder": "Shruti sakshi",
   "follow_up_with": "Design",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "|gift city ppt theme discussion",
  "task": "Gift city ppt theme discussion",
  "task_type": "Client Call",
  "client_key": "",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [
   "Sakshi"
  ],
  "follow_up_teams": [
   "Content"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-01",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-01",
  "done_date": "2026-10-05",
  "notes": [],
  "legacy": {
   "task_type": "internal and client call",
   "client": "",
   "stakeholder": "Shruti sakshi",
   "follow_up_with": "Content",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "absl alt|2nd ppt theme copy",
  "task": "2nd PPT Theme Copy",
  "task_type": "Internal Follow-up",
  "client_key": "ABSL Alt",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [
   "Content"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-05",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-05",
  "done_date": "2026-10-06",
  "notes": [
   {
    "day": "2026-10-05",
    "note": "On track"
   }
  ],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "ABSL Alt",
   "stakeholder": "Sakshi",
   "follow_up_with": "Content",
   "tracking_status": "On track"
  }
 },
 {
  "legacy_key": "ipru|basics of passive btl kit",
  "task": "Basics of passive - BTL Kit",
  "task_type": "Internal Follow-up",
  "client_key": "IPru",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [
   "Sakshi"
  ],
  "follow_up_teams": [
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-05",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-05",
  "done_date": "2026-10-06",
  "notes": [
   {
    "day": "2026-10-05",
    "note": "1 Day Delayed"
   }
  ],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "IPru MF",
   "stakeholder": "Shruti sakshi",
   "follow_up_with": "Design",
   "tracking_status": "1 Day Delayed"
  }
 },
 {
  "legacy_key": "absl|follow up for script approval",
  "task": "Follow up for script approval",
  "task_type": "Client Call",
  "client_key": "ABSL",
  "spoc": "Ahsaan",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": null,
  "client_follow_up_date": "2026-10-07",
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-05",
  "done_date": "2026-10-08",
  "notes": [],
  "legacy": {
   "task_type": "Client Call - Ahsaan",
   "client": "ABSL",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "absl alt|ppt design emerging market",
  "task": "PPT Design - Emerging market",
  "task_type": "Internal Follow-up",
  "client_key": "ABSL Alt",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Content"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-08",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-06",
  "done_date": "2026-10-09",
  "notes": [
   {
    "day": "2026-10-06",
    "note": "On track"
   }
  ],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "ABSL Alt",
   "stakeholder": "Shruti",
   "follow_up_with": "Content",
   "tracking_status": "On track"
  }
 },
 {
  "legacy_key": "invesco|sip calculator",
  "task": "SIP Calculator",
  "task_type": "Internal Meeting",
  "client_key": "Invesco",
  "spoc": "Shivaji",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Content",
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-07",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-06",
  "done_date": "2026-10-08",
  "notes": [
   {
    "day": "2026-10-06",
    "note": "2 day delayed"
   }
  ],
  "legacy": {
   "task_type": "Internal Meeting",
   "client": "Invesco - Shivaji",
   "stakeholder": "Shruti",
   "follow_up_with": "Content, Design",
   "tracking_status": "2 day delayed"
  }
 },
 {
  "legacy_key": "amfi|amfi translation assamese hindi",
  "task": "AMFI Translation - Assamese, Hindi",
  "task_type": "Internal Follow-up",
  "client_key": "AMFI",
  "spoc": "",
  "owner": "",
  "collaborators": [],
  "follow_up_teams": [
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-07",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-06",
  "done_date": "2026-10-08",
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "AMFI",
   "stakeholder": "",
   "follow_up_with": "Design",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "ipru|basics of passive btl kit delivery",
  "task": "Basics of passive - BTL Kit Delivery",
  "task_type": "Internal Follow-up",
  "client_key": "IPru",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-08",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-06",
  "done_date": "2026-10-09",
  "notes": [
   {
    "day": "2026-10-06",
    "note": "1 Day Delayed"
   }
  ],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "IPru MF",
   "stakeholder": "Shruti",
   "follow_up_with": "Design",
   "tracking_status": "1 Day Delayed"
  }
 },
 {
  "legacy_key": "canara robeco|vision board standee design",
  "task": "Vision Board & Standee Design",
  "task_type": "Internal Follow-up",
  "client_key": "Canara Robeco",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-08",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-06",
  "done_date": "2026-10-09",
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "Canara Robeco",
   "stakeholder": "Shruti",
   "follow_up_with": "Design",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "|pmt regularisation meeting",
  "task": "PMT Regularisation Meeting",
  "task_type": "Internal Meeting",
  "client_key": "",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [
   "Shruti"
  ],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-09",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-06",
  "done_date": "2026-10-13",
  "notes": [],
  "legacy": {
   "task_type": "Internal Meeting",
   "client": "",
   "stakeholder": "Sakshi Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "bandhan|kahani one idiot ki",
  "task": "Kahani One Idiot Ki",
  "task_type": "Client Meeting",
  "client_key": "Bandhan",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-07",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-06",
  "done_date": "2026-10-08",
  "notes": [],
  "legacy": {
   "task_type": "Client Meeting",
   "client": "Bandhan",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "ipru|diwali ideas",
  "task": "Diwali ideas",
  "task_type": "Client Meeting",
  "client_key": "IPru",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-07",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-07",
  "done_date": "2026-10-08",
  "notes": [],
  "legacy": {
   "task_type": "Client Meeting",
   "client": "IPru MF",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "absl alt|update to client about the emerging market ppt and revised script",
  "task": "Update to client about the emerging market ppt and revised script",
  "task_type": "Client Call",
  "client_key": "ABSL Alt",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-07",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-07",
  "done_date": "2026-10-08",
  "notes": [],
  "legacy": {
   "task_type": "Client call",
   "client": "ABSL Alt",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "sbi mf|meeting for project updates",
  "task": "Meeting for project updates",
  "task_type": "Client Call",
  "client_key": "SBI MF",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": null,
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-07",
  "done_date": "2026-10-08",
  "notes": [],
  "legacy": {
   "task_type": "Client call",
   "client": "SBI MF",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "invesco|swp calculator",
  "task": "Swp Calculator",
  "task_type": "Internal Meeting",
  "client_key": "Invesco",
  "spoc": "Shivaji",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Content",
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-08",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-08",
  "done_date": "2026-10-09",
  "notes": [
   {
    "day": "2026-10-08",
    "note": "2 day delayed"
   }
  ],
  "legacy": {
   "task_type": "Internal Meeting",
   "client": "Invesco - Shivaji",
   "stakeholder": "Shruti",
   "follow_up_with": "Content, Design",
   "tracking_status": "2 day delayed"
  }
 },
 {
  "legacy_key": "baroda|bbnpp mf handbook",
  "task": "BBNPP MF Handbook",
  "task_type": "Client Meeting",
  "client_key": "Baroda",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": null,
  "client_follow_up_date": "2026-10-08",
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-08",
  "done_date": "2026-10-09",
  "notes": [],
  "legacy": {
   "task_type": "Client Meeting",
   "client": "Baroda",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "invesco|multi asset sif ppt design changes",
  "task": "Multi asset & SIF PPT Design changes",
  "task_type": "Internal Follow-up",
  "client_key": "Invesco",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-09",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-08",
  "done_date": "2026-10-13",
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "Invesco",
   "stakeholder": "Shruti",
   "follow_up_with": "Design",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "absl alt|ppt design emerging market changes",
  "task": "PPT Design - Emerging market Changes",
  "task_type": "Internal Follow-up",
  "client_key": "ABSL Alt",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [
   "Content"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-13",
  "client_follow_up_date": null,
  "status": "On track",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-09",
  "done_date": null,
  "notes": [
   {
    "day": "2026-10-09",
    "note": "On track"
   }
  ],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "ABSL Alt",
   "stakeholder": "Sakshi",
   "follow_up_with": "Content",
   "tracking_status": "On track"
  }
 },
 {
  "legacy_key": "invesco|swp sip calculator",
  "task": "Swp + sip Calculator",
  "task_type": "Internal Meeting",
  "client_key": "Invesco",
  "spoc": "Shivaji",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [
   "Content",
   "Design"
  ],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-13",
  "client_follow_up_date": null,
  "status": "On track",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-09",
  "done_date": null,
  "notes": [
   {
    "day": "2026-10-09",
    "note": "On track"
   }
  ],
  "legacy": {
   "task_type": "Internal Meeting",
   "client": "Invesco - Shivaji",
   "stakeholder": "Sakshi",
   "follow_up_with": "Content, Design",
   "tracking_status": "On track"
  }
 },
 {
  "legacy_key": "absl|gift city merchandise",
  "task": "Gift city Merchandise",
  "task_type": "Internal Meeting",
  "client_key": "ABSL",
  "spoc": "",
  "owner": "Shruti",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-09",
  "client_follow_up_date": null,
  "status": "Done",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-09",
  "done_date": "2026-10-13",
  "notes": [],
  "legacy": {
   "task_type": "Internal Meeting",
   "client": "ABSL",
   "stakeholder": "Shruti",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "|align nfo deliverables with teams",
  "task": "Align nfo deliverables with teams",
  "task_type": "Internal Follow-up",
  "client_key": "",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-13",
  "client_follow_up_date": null,
  "status": "On track",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-13",
  "done_date": null,
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "",
   "stakeholder": "Sakshi",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "invesco|chitpad calculator",
  "task": "chitpad calculator",
  "task_type": "Internal Follow-up",
  "client_key": "Invesco",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-13",
  "client_follow_up_date": null,
  "status": "On track",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-13",
  "done_date": null,
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "Invesco",
   "stakeholder": "Sakshi",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "|pmt data cleaning and new projects and deliberately addition",
  "task": "PMT Data cleaning and new projects and deliberately addition",
  "task_type": "Internal Follow-up",
  "client_key": "",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-13",
  "client_follow_up_date": null,
  "status": "On track",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-13",
  "done_date": null,
  "notes": [],
  "legacy": {
   "task_type": "Internal",
   "client": "",
   "stakeholder": "Sakshi",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "|coordinate with clients and give status update",
  "task": "Coordinate with clients and give status update",
  "task_type": "Internal Follow-up",
  "client_key": "",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": "2026-10-13",
  "client_follow_up_date": null,
  "status": "On track",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-13",
  "done_date": null,
  "notes": [],
  "legacy": {
   "task_type": "Internal Follow-up",
   "client": "ALL",
   "stakeholder": "Sakshi",
   "follow_up_with": "",
   "tracking_status": ""
  }
 },
 {
  "legacy_key": "absl|absl ppt theme discussion with client",
  "task": "Absl ppt theme discussion with client",
  "task_type": "Client Follow-up",
  "client_key": "ABSL",
  "spoc": "",
  "owner": "Sakshi",
  "collaborators": [],
  "follow_up_teams": [],
  "follow_up_people": [],
  "follow_up_others": "",
  "internal_follow_up_date": null,
  "client_follow_up_date": "2026-10-13",
  "status": "On track",
  "delay_reason": "",
  "meeting_time": "",
  "deliverable_count": null,
  "start_date": "2026-10-13",
  "done_date": null,
  "notes": [],
  "legacy": {
   "task_type": "Client follow up",
   "client": "ABSL",
   "stakeholder": "Sakshi",
   "follow_up_with": "",
   "tracking_status": ""
  }
 }
];

const problems = [];
function resolve(map, collection, filter, key, what) {
  const pats = map[key];
  if (!pats) { problems.push(`${what} "${key}": no pattern - add it to ${what === "client" ? "CLIENTS" : "PEOPLE"}`); return null; }
  for (const re of pats) {
    const hits = db[collection].find({ ...filter, name: { $regex: re } }, { _id: 0, id: 1, name: 1 }).toArray();
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) { problems.push(`${what} "${key}": ${re} matches ${hits.map((h) => h.name).join(" / ")} - make it stricter`); return null; }
  }
  problems.push(`${what} "${key}": no match in ${collection}`);
  return null;
}
const clientIds = {}, clientNames = {};
[...new Set(TASKS.map((t) => t.client_key).filter(Boolean))].forEach((k) => {
  const c = resolve(CLIENTS, "clients", {}, k, "client");
  clientIds[k] = c ? c.id : null; clientNames[k] = c ? c.name : "(unmatched)";
});
const userIds = {};
Object.keys(PEOPLE).forEach((k) => {
  const u = resolve(PEOPLE, "users", { active: { $ne: false } }, k, "person");
  userIds[k] = u ? u.id : null;
  if (u) print(`person  ${k.padEnd(8)} -> ${u.name}`);
});
Object.keys(clientIds).forEach((k) => print(`client  ${k.padEnd(14)} -> ${clientNames[k]}`));

const existing = new Set(db.project_tasks.distinct("legacy_key", { legacy_key: { $ne: null } }));
const now = new Date().toISOString();
const taskDocs = [], noteDocs = [];
TASKS.forEach((t) => {
  if (existing.has(t.legacy_key)) return;
  const id = require("crypto").randomUUID();
  const owner = t.owner ? userIds[t.owner] : null;
  const doc = {
    id,
    task: t.task,
    task_type: t.task_type,
    client_id: t.client_key ? clientIds[t.client_key] : null,
    project_id: null,
    spoc: t.spoc,
    owner_id: owner,
    collaborator_ids: t.collaborators.map((p) => userIds[p]).filter((x) => x && x !== owner),
    follow_up_teams: t.follow_up_teams,
    follow_up_user_ids: t.follow_up_people.map((p) => userIds[p]).filter(Boolean),
    follow_up_others: t.follow_up_others,
    internal_follow_up_date: t.internal_follow_up_date,
    client_follow_up_date: t.client_follow_up_date,
    status: t.status,
    delay_reason: t.delay_reason,
    meeting_time: t.meeting_time,
    deliverable_count: t.deliverable_count,
    start_date: t.start_date,
    done_date: t.done_date,
    created_by: owner,
    created_at: `${t.start_date}T09:00:00+05:30`,
    updated_at: now,
    updated_by: null,
    legacy_key: t.legacy_key,
    legacy: t.legacy,
    imported_from: "Projects Team - Task List (Google Sheet)",
  };
  // people who are not PMT users stay as text
  const notUsers = t.follow_up_people.filter((p) => !userIds[p]);
  if (notUsers.length) doc.follow_up_others = [doc.follow_up_others, ...notUsers].filter(Boolean).join(", ");
  // the sheet's client name stays visible when it isn't a known client
  if (t.client_key && !doc.client_id) doc.follow_up_others = [doc.follow_up_others, `Client: ${t.legacy.client}`].filter(Boolean).join(", ");
  taskDocs.push(doc);
  t.notes.forEach((n) => noteDocs.push({
    id: `${id}-${n.day}`, task_id: id, day: n.day, note: n.note, user_id: owner, updated_at: `${n.day}T18:00:00+05:30`,
  }));
});

print(`\n${TASKS.length} tasks in the sheet, ${existing.size} already imported -> ${taskDocs.length} to add (${taskDocs.filter((d) => !d.done_date).length} open), ${noteDocs.length} update notes`);
if (problems.length) { print("\nPROBLEMS (left blank if you write now):"); problems.forEach((p) => print("  - " + p)); }
else print("No matching problems.");

if (DRY_RUN) {
  print("\nDRY RUN - nothing written. Open tasks:");
  taskDocs.filter((d) => !d.done_date).forEach((d) => print(`  ${d.task_type.padEnd(20)} ${(clientNames[TASKS.find((t) => t.legacy_key === d.legacy_key).client_key] || "Internal").slice(0, 28).padEnd(28)} ${d.task}`));
} else if (taskDocs.length) {
  db.project_tasks.insertMany(taskDocs);
  if (noteDocs.length) db.project_task_updates.insertMany(noteDocs);
  print(`Written: ${taskDocs.length} tasks, ${noteDocs.length} notes.`);
}
