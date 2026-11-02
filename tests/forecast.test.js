const test = require('node:test');
const assert = require('node:assert/strict');
const { CONFIG } = require('../src/Config.js');
const { parseJournal, buildForecast, forecastRows } = require('../src/Reports.js');
const { readCsv } = require('./helpers.js');

const byFee = [
  { label: 'Social Fee', collected: 5000, outstanding: 2000 },
  { label: 'Formal', collected: 3000, outstanding: 1000 },
  { label: 'Pig Roast', collected: 1000, outstanding: 400 }
];

test('parses the journal, matching entries to fees by event name', () => {
  const { entries, issues } = parseJournal(readCsv('sample-data/journal-sample.csv'), CONFIG);
  assert.deepEqual(entries.map((e) => [e.feeKey, e.amount]), [
    ['social', 800], ['formal', 2000], ['pigRoast', 1200], ['pigRoast', 250], [null, 150]
  ]);
  assert.deepEqual(issues.map((i) => [i.row, i.type]), [[7, 'unrecognized_amount']]);
});

test('finds columns by header text, in any order', () => {
  const rows = [['Amount', 'Event', 'Description', 'Date'], [-300, 'Formal', 'Photographer', '2026-10-01']];
  const { entries } = parseJournal(rows, CONFIG);
  assert.deepEqual(entries.map((e) => [e.feeKey, e.amount, e.description]), [['formal', 300, 'Photographer']]);
});

test('a missing journal column is an error', () => {
  assert.throws(() => parseJournal([['Date', 'Description', 'Amount']], CONFIG), /"Event" column/);
});

test('without budgets, compares projected income to spending so far', () => {
  const { entries } = parseJournal(readCsv('sample-data/journal-sample.csv'), CONFIG);
  const f = buildForecast(byFee, entries, CONFIG);
  assert.deepEqual(f.lines.map((l) => [l.label, l.projected, l.spent, l.net]), [
    ['Social Fee', 6500, 800, 5700],
    ['Formal', 3750, 2000, 1750],
    ['Pig Roast', 1300, 1450, -150]
  ]);
  assert.equal(f.unassigned, 150);
  assert.equal(f.total.net, 5700 + 1750 - 150 - 150);
});

test('with budgets, compares projected income to the budget', () => {
  const config = { ...CONFIG, BUDGETS: { social: 7000, formal: null, pigRoast: 1300 }, EXPECTED_RECOVERY_RATE: 0.5 };
  const f = buildForecast(byFee, [], config);
  assert.deepEqual(f.lines.map((l) => [l.projected, l.budget, l.net]), [[6000, 7000, -1000], [3500, null, 3500], [1200, 1300, -100]]);
});

test('forecastRows shows the recovery assumption and a total line', () => {
  const { entries } = parseJournal(readCsv('sample-data/journal-sample.csv'), CONFIG);
  const rows = forecastRows(buildForecast(byFee, entries, CONFIG), new Date('2026-11-10T12:00:00Z'));
  assert.match(rows[1][0], /75%/);
  assert.equal(rows.at(-1)[0], 'Total');
  assert.ok(rows.some((r) => r[0] === 'Spending not tied to an event'));
});
