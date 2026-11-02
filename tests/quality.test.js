const test = require('node:test');
const assert = require('node:assert/strict');
const { CONFIG } = require('../src/Config.js');
const { parsePayments, computeOwed } = require('../src/Dues.js');
const { isValidEmail, findMemberIssues, issueRows } = require('../src/Quality.js');
const { readCsv } = require('./helpers.js');

const member = (name, email, row) => ({ name, email, row });

test('isValidEmail accepts normal addresses and rejects junk', () => {
  assert.equal(isValidEmail('member01@example.com'), true);
  assert.equal(isValidEmail('member01-at-example.com'), false);
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail('a b@example.com'), false);
});

test('missing email is only flagged when the member owes money', () => {
  const issues = findMemberIssues([member('A', '', 6), member('B', '', 7)], [0, 650]);
  assert.deepEqual(issues.map((i) => [i.name, i.type]), [['B', 'missing_email']]);
});

test('flags invalid emails, duplicate names, and duplicate emails', () => {
  const issues = findMemberIssues([
    member('Member 01', 'm1@example.com', 6),
    member('Member 02', 'not-an-email', 7),
    member('member 01', 'other@example.com', 8),
    member('Member 03', 'M1@example.com', 9)
  ], [0, 0, 0, 0]);
  assert.deepEqual(issues.map((i) => [i.row, i.type]), [[7, 'invalid_email'], [8, 'duplicate_name'], [9, 'duplicate_email']]);
});

test('sample roster surfaces every planted problem, in row order', () => {
  const { fees, members, issues } = parsePayments(readCsv('sample-data/payments-sample.csv'), CONFIG);
  const totals = members.map((m) => computeOwed(m, fees, CONFIG).total);
  const rows = issueRows(issues.concat(findMemberIssues(members, totals)));
  assert.deepEqual(rows.map((r) => [r[1], r[3]]), [
    ['Member 04', 'missing_email'],
    ['Member 07', 'overpaid'],
    ['Member 09', 'unrecognized_value'],
    ['Member 14', 'invalid_email'],
    ['Member 06', 'duplicate_name'],
    ['Member 06', 'duplicate_email']
  ]);
});
