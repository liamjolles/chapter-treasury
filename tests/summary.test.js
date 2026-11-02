const test = require('node:test');
const assert = require('node:assert/strict');
const { CONFIG } = require('../src/Config.js');
const { parsePayments, computeOwed } = require('../src/Dues.js');
const { summarizeCollections, summaryRows } = require('../src/Reports.js');
const { readCsv } = require('./helpers.js');

const FEES = { social: 100, formal: 200, pigRoast: 300 };
const members = [
  { name: 'A', classYear: 'FRESHMEN', fees: { social: 'Paid', formal: 'Not Paid', pigRoast: '' } },
  { name: 'B', classYear: 'FRESHMEN', fees: { social: 50, formal: 'Paid', pigRoast: 'Paid' } },
  { name: 'C', classYear: 'SENIOR', fees: { social: 'Not Paid', formal: 'Not Paid', pigRoast: 'Not Paid' } }
];
const owedList = members.map((m) => computeOwed(m, FEES, CONFIG));
const pick = (b) => [b.label, b.billed, b.collected, b.outstanding];

test('summarizes by fee, skipping unbilled cells', () => {
  const s = summarizeCollections(members, owedList, CONFIG);
  assert.deepEqual(s.byFee.map(pick), [
    ['Social Fee', 300, 150, 150],
    ['Formal', 600, 200, 400],
    ['Pig Roast', 600, 300, 300]
  ]);
});

test('summarizes by class and overall, with collection rate and members owing', () => {
  const s = summarizeCollections(members, owedList, CONFIG);
  assert.deepEqual(s.byClass.map(pick), [['FRESHMEN', 900, 650, 250], ['SENIOR', 600, 0, 600]]);
  assert.deepEqual(s.byClass.map((b) => b.membersOwing), [2, 1]);
  assert.deepEqual(pick(s.overall), ['All members', 1500, 650, 850]);
  assert.equal(s.overall.rate, 650 / 1500);
});

test('lists largest balances first', () => {
  const s = summarizeCollections(members, owedList, CONFIG);
  assert.deepEqual(s.topBalances.map((b) => [b.name, b.total]), [['C', 600], ['A', 200], ['B', 50]]);
});

test('overpayment never pushes collection rate above 100%', () => {
  const m = [{ name: 'X', classYear: 'JUNIOR', fees: { social: 500, formal: 'Paid', pigRoast: 'Paid' } }];
  const s = summarizeCollections(m, m.map((x) => computeOwed(x, FEES, CONFIG)), CONFIG);
  assert.equal(s.byFee[0].rate, 1);
});

test('sample roster: outstanding matches the sum of member balances', () => {
  const { fees, members: roster } = parsePayments(readCsv('sample-data/payments-sample.csv'), CONFIG);
  const s = summarizeCollections(roster, roster.map((m) => computeOwed(m, fees, CONFIG)), CONFIG);
  assert.equal(s.overall.outstanding, 8950);
  assert.equal(s.byClass.reduce((sum, b) => sum + b.outstanding, 0), 8950);
  assert.equal(s.overall.membersOwing, 13);
});

test('summaryRows lays out every section', () => {
  const rows = summaryRows(summarizeCollections(members, owedList, CONFIG), new Date('2026-11-10T12:00:00Z'));
  const labels = rows.map((r) => r[0]);
  for (const label of ['By fee', 'By class', 'All members', 'Largest balances']) assert.ok(labels.includes(label), label);
});
