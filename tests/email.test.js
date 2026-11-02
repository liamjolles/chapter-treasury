const test = require('node:test');
const assert = require('node:assert/strict');
const { CONFIG } = require('../src/Config.js');
const { computeOwed, buildEmail, formatMoney } = require('../src/Dues.js');

const FEES = { social: 650, formal: 550, pigRoast: 350 };
const member = { name: 'Member 08', email: 'member08@example.com', fees: { social: 'Not Paid', formal: 'Paid', pigRoast: 100 } };

test('formatMoney adds dollar sign, commas, and cents', () => {
  assert.equal(formatMoney(1550), '$1,550.00');
  assert.equal(formatMoney(99.5), '$99.50');
  assert.equal(formatMoney(0), '$0.00');
});

test('email itemizes only fees owed and the total matches', () => {
  const owed = computeOwed(member, FEES, CONFIG);
  const email = buildEmail(member, owed, CONFIG);
  assert.equal(email.to, 'member08@example.com');
  assert.equal(email.subject, 'Reminder: $900.00 outstanding for 2026-2027 social dues');
  assert.match(email.body, /^Hi Member,/);
  assert.match(email.body, /  Social Fee: \$650\.00\n/);
  assert.match(email.body, /  Pig Roast: \$250\.00 \(paid \$100\.00 of \$350\.00\)\n/);
  assert.doesNotMatch(email.body, /Formal/);
  assert.match(email.body, /  Total: \$900\.00/);
});

test('email includes the payment link and sender from config', () => {
  const config = { ...CONFIG, SENDER_NAME: 'Treasurer', PAYMENT_LINK: 'https://www.billhighway.com/pay' };
  const email = buildEmail(member, computeOwed(member, FEES, config), config);
  assert.match(email.body, /through Billhighway:\nhttps:\/\/www\.billhighway\.com\/pay\n/);
  assert.match(email.body, /Thanks,\nTreasurer$/);
});
