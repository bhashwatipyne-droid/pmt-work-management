/**
 * TFP Premium Content Planner -> PMT.
 * Sends the rows of the "Premium Content" tab to PMT. PMT only ADDS rows it
 * does not have yet (project per month, deliverable per row); it never edits or
 * deletes anything, so running this twice is harmless.
 *
 * Setup (once): Extensions > Apps Script > paste this file >
 *   Project Settings > Script properties:
 *     PMT_URL    = https://pmt-backend-txlt.onrender.com/api   (no trailing slash)
 *     SYNC_TOKEN = the same value as SHEET_SYNC_TOKEN on Render
 *   then run installTrigger() once and approve the permissions.
 * Use the "PMT" menu > "Dry run" to preview without writing.
 */
var TAB = 'Premium Content';
var FIRST_DATA_ROW = 2;
// Column letters in the sheet (Month & Year = B ... Animation Delivery Date = U).
var ID_COL = 25; // column Y holds each row's permanent id (you can hide it)
var COL = { month: 2, format: 4, title: 5, status: 8, content_date: 13, design_date: 17, animation_date: 21 };
var BATCH = 400;
var FROM_DATE = '2026-10-01'; // older months are already in PMT; do not send them

function onOpen() {
  SpreadsheetApp.getUi().createMenu('PMT')
    .addItem('Sync new rows to PMT', 'syncToPmt')
    .addItem('Dry run (preview only)', 'dryRun')
    .addToUi();
}

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncToPmt') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncToPmt').timeBased().everyMinutes(15).create();
}

function dryRun() { return run_(true); }
function syncToPmt() { return run_(false); }

function cell_(v) {
  // Dates travel as yyyy-mm-dd text so time zones cannot shift them.
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return v === '' ? null : v;
}

function run_(dry) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('PMT_URL'), token = props.getProperty('SYNC_TOKEN');
  if (!url || !token) throw new Error('Set PMT_URL and SYNC_TOKEN in Script properties.');

  var sheet = SpreadsheetApp.getActive().getSheetByName(TAB);
  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) return;
  var values = sheet.getRange(FIRST_DATA_ROW, 1, last - FIRST_DATA_ROW + 1, ID_COL).getValues();
  var ids = values.map(function (r) { return [r[ID_COL - 1]]; });
  var idsChanged = false, seenIds = {};
  var rows = [];
  values.forEach(function (r, i) {
    if (!r[COL.title - 1]) return; // blank / untitled rows are not sent
    var m = cell_(r[COL.month - 1]);
    if (typeof m === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m) && m < FROM_DATE) return; // old month
    // a missing id, or one copied along with a duplicated row, gets a fresh id
    if (!r[ID_COL - 1] || seenIds[r[ID_COL - 1]]) { ids[i][0] = Utilities.getUuid(); idsChanged = true; }
    seenIds[ids[i][0]] = true;
    var o = { row: FIRST_DATA_ROW + i, sheet_id: ids[i][0] };
    Object.keys(COL).forEach(function (k) { o[k] = cell_(r[COL[k] - 1]); });
    rows.push(o);
  });

  if (idsChanged && !dry) sheet.getRange(FIRST_DATA_ROW, ID_COL, ids.length, 1).setValues(ids);

  var totals = { created: 0, updated: 0, exists: 0, skipped: 0 }, notes = [];
  for (var i = 0; i < rows.length; i += BATCH) {
    var res = UrlFetchApp.fetch(url + '/integrations/premium-sheet/sync', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'X-Sync-Token': token },
      payload: JSON.stringify({ rows: rows.slice(i, i + BATCH), dry_run: dry })
    });
    if (res.getResponseCode() !== 200) throw new Error('PMT said ' + res.getResponseCode() + ': ' + res.getContentText());
    var body = JSON.parse(res.getContentText());
    totals.created += body.created; totals.updated += body.updated; totals.exists += body.exists; totals.skipped += body.skipped;
    body.report.forEach(function (x) {
      if (x.result === 'skipped' && !/is before|not a single month/.test(x.reason)) notes.push('Row ' + x.row + ': ' + x.reason);
      if (x.result === 'updated' || x.result === 'would_update') notes.push('Row ' + x.row + ' ' + x.result.replace('_', ' ') + ': ' + x.changes.join(', '));
      if (x.result === 'would_create') notes.push('Row ' + x.row + ' would be added to ' + x.project);
    });
  }
  Logger.log(JSON.stringify(totals) + '\n' + notes.join('\n'));
  if (dry) {
    try { // popups only work when started from the sheet's PMT menu, not the editor's Run button
      SpreadsheetApp.getUi().alert('Dry run\n' + JSON.stringify(totals) + '\n\n' + notes.slice(0, 25).join('\n'));
    } catch (e) { /* the result is in the execution log */ }
  }
  return totals;
}
