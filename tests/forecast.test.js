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

const EVENT_COLUMN = { ...CONFIG, JOURNAL: { HEADER_ROW: 1, DATE_HEADER: 'Date', DESCRIPTION_HEADER: 'Description', EVENT_HEADER: 'Event', AMOUNT_HEADER: 'Amount', DEFAULT_FEE: null } };

test('parses the journal below its header row, defaulting entries to Social Fee', () => {
  const { entries, issues } = parseJournal(readCsv('sample-data/journal-sample.csv'), CONFIG);
  assert.deepEqual(entries.map((e) => [e.row, e.feeKey, e.amount]), [
    [5, 'social', 1750], [6, 'social', 3000], [7, 'social', 4000], [8, 'formal', 2500]
  ]);
  assert.deepEqual(issues.map((i) => [i.row, i.type]), [[9, 'unrecognized_amount']]);
});

test('with an event column, matches on it and leaves unmatched entries unassigned', () => {
  const rows = [['Amount', 'Event', 'Description', 'Date'], [-300, 'Formal', 'Photographer', '10/1'], [150, '', 'Supplies', '10/2']];
  const { entries } = parseJournal(rows, EVENT_COLUMN);
  assert.deepEqual(entries.map((e) => [e.feeKey, e.amount, e.description]), [['formal', 300, 'Photographer'], [null, 150, 'Supplies']]);
});

test('a missing journal column is an error', () => {
  assert.throws(() => parseJournal([[], [], [], ['Date', 'Event / Use Case', 'Notes']], CONFIG), /"Cost" column/);
});

test('without budgets, compares projected income to spending so far', () => {
  const { entries } = parseJournal(readCsv('sample-data/journal-sample.csv'), CONFIG);
  const f = buildForecast(byFee, entries, CONFIG);
  assert.deepEqual(f.lines.map((l) => [l.label, l.projected, l.spent, l.net]), [
    ['Social Fee', 6500, 8750, -2250],
    ['Formal', 3750, 2500, 1250],
    ['Pig Roast', 1300, 0, 1300]
  ]);
  assert.equal(f.unassigned, 0);
  assert.equal(f.total.net, -2250 + 1250 + 1300);
});

test('spending not tied to a fee is subtracted from the total', () => {
  const f = buildForecast(byFee, [{ feeKey: null, amount: 150 }], CONFIG);
  assert.equal(f.unassigned, 150);
  assert.equal(f.total.net, 6500 + 3750 + 1300 - 150);
});

test('with budgets, compares projected income to the budget', () => {
  const config = { ...CONFIG, BUDGETS: { social: 7000, formal: null, pigRoast: 1300 }, EXPECTED_RECOVERY_RATE: 0.5 };
  const f = buildForecast(byFee, [], config);
  assert.deepEqual(f.lines.map((l) => [l.projected, l.budget, l.net]), [[6000, 7000, -1000], [3500, null, 3500], [1200, 1300, -100]]);
});

test('forecastRows shows the recovery assumption and a total line', () => {
  const rows = forecastRows(buildForecast(byFee, [{ feeKey: null, amount: 150 }], CONFIG), new Date('2026-11-10T12:00:00Z'));
  assert.match(rows[1][0], /75%/);
  assert.equal(rows.at(-1)[0], 'Total');
  assert.ok(rows.some((r) => r[0] === 'Spending not tied to an event'));
});
