const test = require('node:test');
const assert = require('node:assert/strict');
const { CONFIG } = require('../src/Config.js');
const { parsePayments, computeOwed } = require('../src/Dues.js');
const { readCsv } = require('./helpers.js');

const FEES = { social: 650, formal: 550, pigRoast: 350 };

function owed(social, formal, pigRoast, config = CONFIG) {
  return computeOwed({ fees: { social, formal, pigRoast } }, FEES, config);
}

test('Paid owes nothing, Not Paid owes the full fee', () => {
  const r = owed('Paid', 'Not Paid', 'Paid');
  assert.deepEqual(r.items.map((i) => i.owed), [0, 550, 0]);
  assert.equal(r.total, 550);
});

test('a partial amount owes the remainder', () => {
  const r = owed(300, '$100.50', 'Paid');
  assert.deepEqual(r.items.map((i) => i.owed), [350, 449.5, 0]);
  assert.deepEqual(r.items.map((i) => i.paid), [300, 100.5, 350]);
  assert.equal(r.total, 799.5);
});

test('an overpaid partial owes zero, not a negative amount', () => {
  const r = owed(700, 'Paid', 'Paid');
  assert.equal(r.items[0].owed, 0);
  assert.equal(r.total, 0);
});

test('blank cells are not billed by default', () => {
  const r = owed('', 'Not Paid', null);
  assert.deepEqual(r.items.map((i) => i.billed), [false, true, false]);
  assert.equal(r.total, 550);
});

test('blank cells can be treated as Not Paid via config', () => {
  const r = owed('', 'Paid', '', { ...CONFIG, BLANK_MEANS_NOT_PAID: true });
  assert.equal(r.total, 1000);
});

test('unrecognized values are not counted as owed', () => {
  const r = owed('pd', 'Paid', 'Paid');
  assert.equal(r.items[0].billed, false);
  assert.equal(r.total, 0);
});

test('sample roster produces the expected owed totals', () => {
  const { fees, members } = parsePayments(readCsv('sample-data/payments-sample.csv'), CONFIG);
  const totals = Object.fromEntries(members.map((m) => [m.name + ' ' + m.classYear, computeOwed(m, fees, CONFIG).total]));
  assert.deepEqual(totals, {
    'Member 01 FRESHMEN': 0, 'Member 02 FRESHMEN': 1550, 'Member 03 FRESHMEN': 350,
    'Member 04 FRESHMEN': 650, 'Member 05 FRESHMEN': 350,
    'Member 06 SOPHOMORE': 0, 'Member 07 SOPHOMORE': 550, 'Member 08 SOPHOMORE': 900,
    'Member 09 SOPHOMORE': 0, 'Member 10 SOPHOMORE': 350,
    'Member 11 JUNIOR': 0, 'Member 12 JUNIOR': 1200, 'Member 13 JUNIOR': 325,
    'Member 14 JUNIOR': 550, 'Member 15 JUNIOR': 0,
    'Member 16 SENIOR': 0, 'Member 17 SENIOR': 1550, 'Member 18 SENIOR': 275,
    'Member 06 SENIOR': 0, 'Member 19 SENIOR': 350
  });
  assert.equal(Object.values(totals).reduce((a, b) => a + b, 0), 8950);
});
