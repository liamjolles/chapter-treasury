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

if (typeof module !== 'undefined') {
  module.exports = {
    summarizeCollections: summarizeCollections,
    summaryRows: summaryRows
  };
}
