/**
 * Apps Script entry points. This file only does sheet and mail I/O; all parsing and math
 * live in the pure files (Dues.js, Quality.js, Reminders.js, Reports.js).
 */

var PREVIEW_HEADER = ['Timestamp', 'Name', 'Email', 'Total Owed', 'Status', 'Subject', 'Body'];

/**
 * Main entry point. Builds a reminder for every member who owes money and has a valid
 * email, skips anyone still inside the cooldown, then either previews (DRY_RUN) or sends.
 * Always refreshes the report tabs afterwards.
 */
function sendDuesReminders() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var now = new Date();
  var roster = loadRoster_(ss);

  var reminders = roster.members
    .map(function (m, i) { return { member: m, owed: roster.owed[i] }; })
    .filter(function (r) { return r.owed.total > 0 && isValidEmail(r.member.email); })
    .map(function (r) { r.email = buildEmail(r.member, r.owed, CONFIG); return r; });

  var log = parseLog(readTab_(ss, CONFIG.SHEETS.LOG, LOG_HEADER));
  var split = applyCooldown(reminders, log, now, CONFIG.COOLDOWN_DAYS);

  if (CONFIG.DRY_RUN) {
    var rows = split.due.map(function (r) {
      return [now, r.member.name, r.member.email, r.owed.total, 'Would send', r.email.subject, r.email.body];
    }).concat(split.skipped.map(function (s) {
      var r = s.reminder;
      return [now, r.member.name, r.member.email, r.owed.total, 'Skipped: emailed ' + s.lastSent.toDateString(), r.email.subject, r.email.body];
    }));
    writeTab_(ss, CONFIG.SHEETS.PREVIEW, [PREVIEW_HEADER].concat(rows));
    Logger.log('DRY RUN: %s reminders previewed, %s skipped (cooldown). See the %s tab.',
      split.due.length, split.skipped.length, CONFIG.SHEETS.PREVIEW);
  } else {
    // Snapshot balances before sending, so the next run can measure what each reminder collected.
    appendRows_(ss, CONFIG.SHEETS.SNAPSHOTS, SNAPSHOT_HEADER, snapshotRows(roster.members, roster.owed, now));

    var quota = MailApp.getRemainingDailyQuota();
    var toSend = split.due.slice(0, quota);
    toSend.forEach(function (r) {
      MailApp.sendEmail({ to: r.email.to, subject: r.email.subject, body: r.email.body, name: CONFIG.SENDER_NAME });
      appendRows_(ss, CONFIG.SHEETS.LOG, LOG_HEADER, [logRow(r, now)]); // log each send immediately
    });
    Logger.log('Sent %s reminders, %s skipped (cooldown).', toSend.length, split.skipped.length);
    if (split.due.length > toSend.length) {
      Logger.log('Daily email quota reached: %s reminders not sent. They will go out on the next run.',
        split.due.length - toSend.length);
    }
  }

  var outstanding = roster.owed.reduce(function (sum, o) { return sum + o.total; }, 0);
  Logger.log('%s members, %s owing, %s outstanding.', roster.members.length,
    roster.owed.filter(function (o) { return o.total > 0; }).length, formatMoney(outstanding));

  refreshReports_(ss, roster, now);
}

/** Rebuild the Data Issues, Summary, Impact, and Forecast tabs without emailing anyone. */
function refreshReports() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  refreshReports_(ss, loadRoster_(ss), new Date());
}

/** Run sendDuesReminders every Monday morning. Re-running replaces the existing trigger. */
function installWeeklyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'sendDuesReminders'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendDuesReminders').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).create();
}

// ---------------------------------------------------------------------------------------

function loadRoster_(ss) {
  var sheet = ss.getSheetByName(CONFIG.SHEETS.PAYMENTS);
  if (!sheet) throw new Error('No tab named "' + CONFIG.SHEETS.PAYMENTS + '".');
  var parsed = parsePayments(sheet.getDataRange().getValues(), CONFIG);
  var owed = parsed.members.map(function (m) { return computeOwed(m, parsed.fees, CONFIG); });
  var totals = owed.map(function (o) { return o.total; });
  return {
    fees: parsed.fees,
    members: parsed.members,
    owed: owed,
    issues: parsed.issues.concat(findMemberIssues(parsed.members, totals))
  };
}

function refreshReports_(ss, roster, now) {
  var summary = summarizeCollections(roster.members, roster.owed, CONFIG);
  writeTab_(ss, CONFIG.SHEETS.SUMMARY, summaryRows(summary, now));

  var log = parseLog(readTab_(ss, CONFIG.SHEETS.LOG, LOG_HEADER));
  var snapshots = parseSnapshots(readTab_(ss, CONFIG.SHEETS.SNAPSHOTS, SNAPSHOT_HEADER));
  writeTab_(ss, CONFIG.SHEETS.IMPACT, impactRows(measureImpact(log, snapshots), outstandingTrend(snapshots), now));

  var issues = roster.issues;
  var journal = ss.getSheetByName(CONFIG.SHEETS.JOURNAL);
  if (journal) {
    try {
      var parsedJournal = parseJournal(journal.getDataRange().getValues(), CONFIG);
      issues = issues.concat(parsedJournal.issues.map(function (i) { i.field = 'Journal ' + i.field; return i; }));
      writeTab_(ss, CONFIG.SHEETS.FORECAST, forecastRows(buildForecast(summary.byFee, parsedJournal.entries, CONFIG), now));
    } catch (e) {
      writeTab_(ss, CONFIG.SHEETS.FORECAST, [['Budget forecast'], ['Could not read the Journal tab: ' + e.message]]);
    }
  }

  var issueTable = issueRows(issues);
  writeTab_(ss, CONFIG.SHEETS.ISSUES, [ISSUE_HEADER].concat(issueTable.length ? issueTable : [['', 'No issues found']]));
}

function readTab_(ss, name, header) {
  var sheet = ss.getSheetByName(name);
  return sheet && sheet.getLastRow() > 0 ? sheet.getDataRange().getValues() : [header];
}

function getOrCreateTab_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

/** Replace a tab's contents with rows (padded to a rectangle, as setValues requires). */
function writeTab_(ss, name, rows) {
  var sheet = getOrCreateTab_(ss, name);
  sheet.clearContents();
  var width = rows.reduce(function (w, r) { return Math.max(w, r.length); }, 1);
  var grid = rows.map(function (r) {
    var out = r.slice();
    while (out.length < width) out.push('');
    return out;
  });
  sheet.getRange(1, 1, grid.length, width).setValues(grid);
}

function appendRows_(ss, name, header, rows) {
  if (!rows.length) return;
  var sheet = getOrCreateTab_(ss, name);
  if (sheet.getLastRow() === 0) sheet.appendRow(header);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}
