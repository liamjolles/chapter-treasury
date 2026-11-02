/**
 * Pure reporting logic: collections summary, reminder impact, and budget forecast.
 * Inputs are already-parsed members and their computeOwed results.
 */

function round2(n) {
  return Math.round(n * 100) / 100;
}

function emptyBucket(label) {
  return { label: label, billed: 0, collected: 0, outstanding: 0, membersOwing: 0 };
}

function finishBucket(b) {
  b.billed = round2(b.billed);
  b.collected = round2(b.collected);
  b.outstanding = round2(b.outstanding);
  b.rate = b.billed > 0 ? b.collected / b.billed : 0;
  return b;
}

/**
 * Billed / collected / outstanding / collection rate, by fee, by class, and overall,
 * plus the largest outstanding balances. Collected is capped at the fee, so an
 * overpayment never pushes a collection rate above 100%.
 */
function summarizeCollections(members, owedList, config) {
  var byFee = {};
  var byClass = {};
  var overall = emptyBucket('All members');
  config.FEES.forEach(function (f) { byFee[f.key] = emptyBucket(f.label); });

  members.forEach(function (m, idx) {
    var owed = owedList[idx];
    if (!byClass[m.classYear]) byClass[m.classYear] = emptyBucket(m.classYear);
    var cls = byClass[m.classYear];

    owed.items.forEach(function (item) {
      if (!item.billed) return;
      var collected = Math.min(item.paid, item.fee);
      [byFee[item.key], cls, overall].forEach(function (b) {
        b.billed += item.fee;
        b.collected += collected;
        b.outstanding += item.owed;
      });
    });
    if (owed.total > 0) { cls.membersOwing++; overall.membersOwing++; }
  });

  var topBalances = members
    .map(function (m, idx) { return { name: m.name, classYear: m.classYear, total: owedList[idx].total }; })
    .filter(function (b) { return b.total > 0; })
    .sort(function (a, b) { return b.total - a.total; })
    .slice(0, config.TOP_BALANCES);

  return {
    byFee: config.FEES.map(function (f) { return finishBucket(byFee[f.key]); }),
    byClass: config.CLASS_NAMES
      .filter(function (c) { return byClass[c.toUpperCase()]; })
      .map(function (c) { return finishBucket(byClass[c.toUpperCase()]); }),
    overall: finishBucket(overall),
    topBalances: topBalances
  };
}

/** Rows for the Summary tab. */
function summaryRows(summary, now) {
  var header = ['', 'Billed', 'Collected', 'Outstanding', 'Collection rate', 'Members owing'];
  var line = function (b, showOwing) {
    return [b.label, b.billed, b.collected, b.outstanding, b.rate, showOwing ? b.membersOwing : ''];
  };
  var rows = [['Collections summary', 'Updated ' + now.toISOString()], []];
  rows.push(['By fee'].concat(header.slice(1)));
  summary.byFee.forEach(function (b) { rows.push(line(b, false)); });
  rows.push([]);
  rows.push(['By class'].concat(header.slice(1)));
  summary.byClass.forEach(function (b) { rows.push(line(b, true)); });
  rows.push(line(summary.overall, true));
  rows.push([]);
  rows.push(['Largest balances', 'Class', 'Owed']);
  summary.topBalances.forEach(function (b) { rows.push([b.name, b.classYear, b.total]); });
  return rows;
}

// ---------------------------------------------------------------------------------------
// Impact: did reminders lead to payments?
// Each run appends one Snapshots row per member. A reminder's effect is measured against
// that member's next snapshot after the email went out.
// ---------------------------------------------------------------------------------------

var SNAPSHOT_HEADER = ['Timestamp', 'Name', 'Email', 'Class', 'Total Owed'];

function memberKey(name, email, classYear) {
  return email ? String(email).trim().toLowerCase() : (name + '|' + classYear).toLowerCase();
}

function snapshotRows(members, owedList, now) {
  return members.map(function (m, idx) {
    return [now, m.name, m.email, m.classYear, owedList[idx].total];
  });
}

function parseSnapshots(rows) {
  return rows.slice(1)
    .filter(function (r) { return r[0] && r[1]; })
    .map(function (r) {
      return { timestamp: new Date(r[0]), key: memberKey(r[1], r[2], r[3]), total: Number(r[4]) };
    });
}

/**
 * @param log        parsed Reminder Log entries (parseLog)
 * @param snapshots  parsed Snapshots rows (parseSnapshots)
 */
function measureImpact(log, snapshots) {
  var byKey = {};
  snapshots.forEach(function (s) { (byKey[s.key] = byKey[s.key] || []).push(s); });
  Object.keys(byKey).forEach(function (k) { byKey[k].sort(function (a, b) { return a.timestamp - b.timestamp; }); });

  var result = { remindersSent: log.length, measured: 0, pending: 0, responded: 0, paidInFull: 0, recovered: 0 };
  log.forEach(function (entry) {
    var next = (byKey[entry.email] || []).filter(function (s) { return s.timestamp > entry.timestamp; })[0];
    if (!next) { result.pending++; return; }
    result.measured++;
    var paid = Math.max(0, entry.total - next.total);
    if (paid > 0) result.responded++;
    if (next.total === 0) result.paidInFull++;
    result.recovered += paid;
  });
  result.recovered = round2(result.recovered);
  result.responseRate = result.measured > 0 ? result.responded / result.measured : 0;
  return result;
}

/** Total outstanding and members owing at each snapshot run, oldest first. */
function outstandingTrend(snapshots) {
  var runs = {};
  snapshots.forEach(function (s) {
    var t = s.timestamp.getTime();
    var run = runs[t] = runs[t] || { timestamp: s.timestamp, outstanding: 0, membersOwing: 0 };
    run.outstanding += s.total;
    if (s.total > 0) run.membersOwing++;
  });
  return Object.keys(runs)
    .map(function (t) { var r = runs[t]; r.outstanding = round2(r.outstanding); return r; })
    .sort(function (a, b) { return a.timestamp - b.timestamp; });
}

/** Rows for the Impact tab. */
function impactRows(impact, trend, now) {
  var rows = [
    ['Reminder impact', 'Updated ' + now.toISOString()],
    [],
    ['Reminders sent', impact.remindersSent],
    ['Measured (a later snapshot exists)', impact.measured],
    ['Awaiting next snapshot', impact.pending],
    ['Paid something after reminder', impact.responded],
    ['Paid in full after reminder', impact.paidInFull],
    ['Response rate', impact.responseRate],
    ['Collected after reminders', impact.recovered],
    [],
    ['Snapshot', 'Total outstanding', 'Members owing']
  ];
  trend.forEach(function (r) { rows.push([r.timestamp, r.outstanding, r.membersOwing]); });
  return rows;
}

if (typeof module !== 'undefined') {
  module.exports = {
    summarizeCollections: summarizeCollections,
    summaryRows: summaryRows,
    SNAPSHOT_HEADER: SNAPSHOT_HEADER,
    snapshotRows: snapshotRows,
    parseSnapshots: parseSnapshots,
    measureImpact: measureImpact,
    outstandingTrend: outstandingTrend,
    impactRows: impactRows
  };
}
