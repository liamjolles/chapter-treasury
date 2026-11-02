const test = require('node:test');
const assert = require('node:assert/strict');
const { LOG_HEADER, parseLog, applyCooldown, logRow } = require('../src/Reminders.js');

const NOW = new Date('2026-11-10T12:00:00Z');
const reminder = (name, email) => ({ member: { name, email }, owed: { total: 650 }, email: { subject: 'Reminder' } });

test('parseLog reads sheet rows, skipping the header and empty rows', () => {
  const log = parseLog([LOG_HEADER, ['2026-11-01T12:00:00Z', 'Member 01', ' Member01@Example.com ', 650, 'Reminder'], ['', '', '', '', '']]);
  assert.equal(log.length, 1);
  assert.equal(log[0].email, 'member01@example.com');
  assert.equal(log[0].timestamp.toISOString(), '2026-11-01T12:00:00.000Z');
});

test('members emailed inside the cooldown are skipped; others are due', () => {
  const log = parseLog([LOG_HEADER,
    ['2026-11-08T12:00:00Z', 'Member 01', 'member01@example.com', 650, 'Reminder'],
    ['2026-11-01T12:00:00Z', 'Member 02', 'member02@example.com', 650, 'Reminder']]);
  const { due, skipped } = applyCooldown(
    [reminder('Member 01', 'member01@example.com'), reminder('Member 02', 'member02@example.com'), reminder('Member 03', 'member03@example.com')],
    log, NOW, 6);
  assert.deepEqual(due.map((r) => r.member.name), ['Member 02', 'Member 03']);
  assert.deepEqual(skipped.map((s) => s.reminder.member.name), ['Member 01']);
});

test('the most recent send is the one that counts', () => {
  const log = parseLog([LOG_HEADER,
    ['2026-10-01T12:00:00Z', 'Member 01', 'member01@example.com', 650, 'Reminder'],
    ['2026-11-09T12:00:00Z', 'Member 01', 'member01@example.com', 650, 'Reminder']]);
  assert.equal(applyCooldown([reminder('Member 01', 'member01@example.com')], log, NOW, 6).skipped.length, 1);
});

test('a weekly run a few minutes early is not blocked', () => {
  const log = parseLog([LOG_HEADER, ['2026-11-03T12:05:00Z', 'Member 01', 'member01@example.com', 650, 'Reminder']]);
  assert.equal(applyCooldown([reminder('Member 01', 'member01@example.com')], log, NOW, 6).due.length, 1);
});

test('logRow matches the log header', () => {
  const row = logRow(reminder('Member 01', 'member01@example.com'), NOW);
  assert.equal(row.length, LOG_HEADER.length);
  assert.deepEqual(row, [NOW, 'Member 01', 'member01@example.com', 650, 'Reminder']);
});
