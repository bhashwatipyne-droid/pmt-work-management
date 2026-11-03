// Mark existing Animation "Data Updation" Work Sheet rows as Non-Core.
// MongoDB Compass > mongosh:  use pmt  then paste.  Starts as a DRY RUN.
//
// Data Updation is a Non-Core activity for the Animation team only (Content and
// Design keep it as Core). New and edited rows are handled by the app; this is
// for rows saved earlier, which still say work_category "Core". Efficiency
// already reads them as Non-Core, so only the Work Sheet's Category column and
// its category filter are affected.
//
// Only rows on the Animate stage with the Data Updation type are changed.
// Safe to re-run. Writes only work_items (work_category).

const DRY_RUN = true; // set false to write

const filter = {
  stage: "Animate",
  deliverable_type: "Data Updation",
  work_category: { $ne: "Non-Core" },
};

const matching = db.work_items.countDocuments(filter);
print(`Animation Data Updation rows still marked Core: ${matching}`);
db.work_items
  .aggregate([{ $match: filter }, { $group: { _id: "$month", rows: { $sum: 1 } } }, { $sort: { _id: 1 } }])
  .forEach((m) => print(`  ${m._id}: ${m.rows}`));

if (DRY_RUN) {
  print("DRY RUN - nothing written. Set DRY_RUN = false and run again to apply.");
} else {
  const res = db.work_items.updateMany(filter, { $set: { work_category: "Non-Core" } });
  print(`Updated ${res.modifiedCount} rows.`);
}
