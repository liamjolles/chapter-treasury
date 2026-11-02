const test = require('node:test');
const assert = require('node:assert/strict');
const { SNAPSHOT_HEADER, snapshotRows, parseSnapshots, measureImpact, outstandingTrend, impactRows } = require('../src/Reports.js');
const { LOG_HEADER, parseLog } = require('../src/Reminders.js');

const WEEK1 = '2026-11-03T12:00:00Z';
const WEEK2 = '2026-11-10T12:00:00Z';
const WEEK3 = '2026-11-17T12:00:00Z';

// Week 1: three members owe; reminders go out to all three in the same run.
// Week 2: A paid in full, B paid part, C paid nothing. Week 3 has no reminders yet to measure.
const snapshots = parseSnapshots([SNAPSHOT_HEADER,
  [WEEK1, 'A', 'a@example.com', 'FRESHMEN', 650],
  [WEEK1, 'B', 'b@example.com', 'FRESHMEN', 900],
  [WEEK1, 'C', 'c@example.com', 'SENIOR', 350],
  [WEEK1, 'D', '', 'SENIOR', 0],
  [WEEK2, 'A', 'a@example.com', 'FRESHMEN', 0],
  [WEEK2, 'B', 'b@example.com', 'FRESHMEN', 250],
  [WEEK2, 'C', 'c@example.com', 'SENIOR', 350],
  [WEEK2, 'D', '', 'SENIOR', 0]
]);
const log = parseLog([LOG_HEADER,
  [WEEK1, 'A', 'a@example.com', 650, 'Reminder'],
  [WEEK1, 'B', 'b@example.com', 900, 'Reminder'],
  [WEEK1, 'C', 'c@example.com', 350, 'Reminder'],
  [WEEK2, 'B', 'b@example.com', 250, 'Reminder']
]);

test('measures each reminder against the member\'s next snapshot', () => {
  const impact = measureImpact(log, snapshots);
  assert.equal(impact.remindersSent, 4);
  assert.equal(impact.measured, 3);
  assert.equal(impact.pending, 1); // week-2 reminder to B has no later snapshot yet
  assert.equal(impact.responded, 2);
  assert.equal(impact.paidInFull, 1);
  assert.equal(impact.recovered, 650 + 650);
  assert.equal(impact.responseRate, 2 / 3);
});

test('a snapshot taken in the same run as the send does not count as "after"', () => {
  const impact = measureImpact(parseLog([LOG_HEADER, [WEEK2, 'A', 'a@example.com', 650, 'R']]), snapshots);
  assert.equal(impact.measured, 0);
});

test('outstanding trend totals each run, oldest first', () => {
  const trend = outstandingTrend(snapshots);
  assert.deepEqual(trend.map((r) => [r.timestamp.toISOString(), r.outstanding, r.membersOwing]), [
    ['2026-11-03T12:00:00.000Z', 1900, 3],
    ['2026-11-10T12:00:00.000Z', 600, 2]
  ]);
});

test('snapshotRows round-trips through parseSnapshots', () => {
  const now = new Date(WEEK3);
  const rows = snapshotRows([{ name: 'A', email: 'A@example.com', classYear: 'FRESHMEN' }], [{ total: 100 }], now);
  assert.deepEqual(parseSnapshots([SNAPSHOT_HEADER, ...rows]), [{ timestamp: now, key: 'a@example.com', total: 100 }]);
});

test('impactRows includes headline numbers and the trend', () => {
  const rows = impactRows(measureImpact(log, snapshots), outstandingTrend(snapshots), new Date(WEEK3));
  assert.deepEqual(rows.find((r) => r[0] === 'Collected after reminders'), ['Collected after reminders', 1300]);
  assert.equal(rows.length, 11 + 2);
});
