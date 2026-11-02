/**
 * Pure reminder-log logic: decide who is due for a reminder, given who was already emailed.
 * The Reminder Log tab holds one row per email actually sent:
 *   Timestamp | Name | Email | Total Owed | Subject
 */

var LOG_HEADER = ['Timestamp', 'Name', 'Email', 'Total Owed', 'Subject'];
var DAY_MS = 24 * 60 * 60 * 1000;

/** Read Reminder Log rows (header row included) into objects. */
function parseLog(rows) {
  return rows.slice(1)
    .filter(function (r) { return r[0] && r[2]; })
    .map(function (r) {
      return { timestamp: new Date(r[0]), name: String(r[1]), email: String(r[2]).trim().toLowerCase(), total: Number(r[3]) };
    });
}

/** Most recent send time per email address. */
function lastSentByEmail(log) {
  var last = {};
  log.forEach(function (entry) {
    if (!last[entry.email] || entry.timestamp > last[entry.email]) last[entry.email] = entry.timestamp;
  });
  return last;
}

/**
 * Split reminders into those due now and those still inside the cooldown window.
 * @param reminders  [{ member, owed, email }] (email = output of buildEmail)
 */
function applyCooldown(reminders, log, now, cooldownDays) {
  var last = lastSentByEmail(log);
  var due = [];
  var skipped = [];
  reminders.forEach(function (r) {
    var sentAt = last[r.member.email.toLowerCase()];
    if (sentAt && now - sentAt < cooldownDays * DAY_MS) {
      skipped.push({ reminder: r, lastSent: sentAt });
    } else {
      due.push(r);
    }
  });
  return { due: due, skipped: skipped };
}

function logRow(reminder, now) {
  return [now, reminder.member.name, reminder.member.email, reminder.owed.total, reminder.email.subject];
}

if (typeof module !== 'undefined') {
  module.exports = {
    LOG_HEADER: LOG_HEADER,
    parseLog: parseLog,
    applyCooldown: applyCooldown,
    logRow: logRow
  };
}
