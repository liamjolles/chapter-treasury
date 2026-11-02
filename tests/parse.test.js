const test = require('node:test');
const assert = require('node:assert/strict');
const { CONFIG } = require('../src/Config.js');
const { parsePayments, classifyCell, columnIndex, STATUS } = require('../src/Dues.js');
const { readCsv } = require('./helpers.js');

const HEADER = ['Name', 'Social Fee', 'Formal', 'Pig Roast', 'Notes', 'Email'];

function sheet(feeRow, blocks) {
  const rows = [['Title'], ['Instructions'], feeRow];
  for (const [className, members] of blocks) {
    rows.push([className], HEADER, ...members, []);
  }
  return rows;
}

test('columnIndex converts letters to zero-based indexes', () => {
  assert.equal(columnIndex('A'), 0);
  assert.equal(columnIndex('F'), 5);
  assert.equal(columnIndex('AA'), 26);
});

test('classifyCell recognizes every cell format', () => {
  assert.equal(classifyCell('Paid').status, STATUS.PAID);
  assert.equal(classifyCell(' paid ').status, STATUS.PAID);
  assert.equal(classifyCell('Not Paid').status, STATUS.NOT_PAID);
  assert.deepEqual(classifyCell(300), { status: STATUS.PARTIAL, amount: 300 });
  assert.deepEqual(classifyCell('$1,250.50'), { status: STATUS.PARTIAL, amount: 1250.5 });
  assert.equal(classifyCell('').status, STATUS.BLANK);
  assert.equal(classifyCell(null).status, STATUS.BLANK);
  assert.equal(classifyCell('pd').status, STATUS.UNKNOWN);
});

test('fee amounts are read from the fee row, not hardcoded', () => {
  const rows = sheet(['Fees', 100, '$200', 'Pig Roast $75.50'], [['FRESHMEN', [['Member 01', 'Paid', 'Paid', 'Paid']]]]);
  assert.deepEqual(parsePayments(rows, CONFIG).fees, { social: 100, formal: 200, pigRoast: 75.5 });
});

test('a missing fee amount is an error, not a silent zero', () => {
  const rows = sheet(['Fees', 650, '', 350], []);
  assert.throws(() => parsePayments(rows, CONFIG), /Formal amount/);
});

test('detects all four class blocks regardless of row position', () => {
  const rows = sheet(['Fees', 650, 550, 350], [
    ['FRESHMEN', [['A1', 'Paid'], ['A2', 'Paid']]],
    ['Sophomore', [['B1', 'Paid']]],
    ['JUNIOR', [['C1', 'Paid'], ['C2', 'Paid'], ['C3', 'Paid']]],
    ['SENIOR', [['D1', 'Paid']]]
  ]);
  const byClass = {};
  for (const m of parsePayments(rows, CONFIG).members) byClass[m.classYear] = (byClass[m.classYear] || 0) + 1;
  assert.deepEqual(byClass, { FRESHMEN: 2, SOPHOMORE: 1, JUNIOR: 3, SENIOR: 1 });
});

test('member rows capture name, email, notes, sheet row, and raw fee cells', () => {
  const rows = sheet(['Fees', 650, 550, 350], [['FRESHMEN', [['Member 01', 'Paid', 300, '', 'note', ' m1@example.com ']]]]);
  const [m] = parsePayments(rows, CONFIG).members;
  assert.deepEqual(m, {
    name: 'Member 01', classYear: 'FRESHMEN', email: 'm1@example.com', notes: 'note', row: 6,
    fees: { social: 'Paid', formal: 300, pigRoast: '' }
  });
});

test('flags unrecognized, overpaid, negative, nameless, and out-of-block rows', () => {
  const rows = [['Title'], ['Instructions'], ['Fees', 650, 550, 350],
    ['Stray Person', 'Paid'],
    ['FRESHMEN'], HEADER,
    ['Member 01', 'pd', 700, -5],
    ['', 'Paid', 'Paid']];
  const types = parsePayments(rows, CONFIG).issues.map((i) => i.type);
  assert.deepEqual(types, ['outside_class_block', 'unrecognized_value', 'overpaid', 'negative_amount', 'missing_name']);
});

test('ignores stray cells to the right of the email column', () => {
  const rows = sheet(['Fees', 650, 550, 350], [['FRESHMEN', [['Member 01', 'Paid', 'Paid', 'Paid', '', 'm@example.com', 'stray', 99]]]]);
  const { members, issues } = parsePayments(rows, CONFIG);
  assert.equal(members.length, 1);
  assert.equal(issues.length, 0);
});

test('parses the sample roster', () => {
  const { fees, members } = parsePayments(readCsv('sample-data/payments-sample.csv'), CONFIG);
  assert.deepEqual(fees, { social: 650, formal: 550, pigRoast: 350 });
  assert.equal(members.length, 20);
});
