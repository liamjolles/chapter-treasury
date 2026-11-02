// Runs the real Apps Script entry points (src/Code.gs) in a Node VM against an in-memory
// fake of SpreadsheetApp and MailApp, loaded with the sample CSVs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { readCsv } = require('./helpers.js');

const SRC = ['Config.js', 'Dues.js', 'Quality.js', 'Reminders.js', 'Reports.js', 'Code.gs'];

function fakeSheet(name, values) {
  let grid = values.map((r) => r.slice());
  return {
    name,
    get grid() { return grid; },
    getDataRange: () => ({ getValues: () => grid.map((r) => r.slice()) }),
    getLastRow: () => grid.length,
    clearContents: () => { grid = []; },
    appendRow: (row) => { grid.push(row.slice()); },
    getRange: (row, col, numRows) => ({
      setValues: (rows) => {
        assert.equal(rows.length, numRows);
        const width = rows[0].length;
        assert.ok(rows.every((r) => r.length === width), 'setValues needs a rectangular grid');
        rows.forEach((r, i) => { grid[row - 1 + i] = r.slice(); });
      }
    })
  };
}

function loadApp({ dryRun, quota = 100, now }) {
  const sheets = {
    Payments: fakeSheet('Payments', readCsv('sample-data/payments-sample.csv')),
    Journal: fakeSheet('Journal', readCsv('sample-data/journal-sample.csv'))
  };
  const sent = [];
  const logs = [];
  const RealDate = Date;
  const context = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (n) => sheets[n] || null,
        insertSheet: (n) => (sheets[n] = fakeSheet(n, []))
      })
    },
    MailApp: { getRemainingDailyQuota: () => quota, sendEmail: (msg) => sent.push(msg) },
    Logger: { log: (...args) => logs.push(args) },
    Date: class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(now()); } }
  };
  vm.createContext(context);
  for (const file of SRC) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'), context, { filename: file });
  context.CONFIG.DRY_RUN = dryRun;
  return { context, sheets, sent, logs };
}

test('dry run previews every reminder and sends nothing', () => {
  const app = loadApp({ dryRun: true, now: () => '2026-11-02T15:00:00Z' });
  app.context.sendDuesReminders();
  assert.equal(app.sent.length, 0);
  const preview = app.sheets.Preview.grid;
  assert.equal(preview.length, 1 + 11); // 13 owe money; Member 04 (no email) and Member 14 (invalid) are skipped
  assert.ok(preview.slice(1).every((r) => r[4] === 'Would send'));
  assert.equal(preview.slice(1).reduce((s, r) => s + r[3], 0), 8950 - 650 - 550);
  assert.equal(app.sheets['Reminder Log'], undefined);
  assert.equal(app.sheets.Snapshots, undefined);
});

test('dry run builds every report tab', () => {
  const app = loadApp({ dryRun: true, now: () => '2026-11-02T15:00:00Z' });
  app.context.sendDuesReminders();
  for (const tab of ['Summary', 'Impact', 'Forecast', 'Data Issues']) assert.ok(app.sheets[tab].grid.length > 1, tab);
  const issueTypes = app.sheets['Data Issues'].grid.slice(1).map((r) => r[3]);
  assert.ok(issueTypes.includes('unrecognized_amount')); // from the Journal tab
  assert.ok(issueTypes.includes('missing_email'));
});

test('live mode sends, logs, snapshots, and respects the cooldown on re-run', () => {
  let clock = '2026-11-02T15:00:00Z';
  const app = loadApp({ dryRun: false, now: () => clock });
  app.context.sendDuesReminders();
  assert.equal(app.sent.length, 11);
  assert.equal(app.sent[0].name, 'Social Chair');
  assert.equal(app.sheets['Reminder Log'].grid.length, 1 + 11);
  assert.equal(app.sheets.Snapshots.grid.length, 1 + 20);

  clock = '2026-11-03T15:00:00Z'; // next day: everyone is inside the cooldown
  app.context.sendDuesReminders();
  assert.equal(app.sent.length, 11);

  clock = '2026-11-09T15:00:00Z'; // a week later: due again, and impact can now be measured
  app.context.sendDuesReminders();
  assert.equal(app.sent.length, 22);
  const impact = Object.fromEntries(app.sheets.Impact.grid.map((r) => [r[0], r[1]]));
  assert.equal(impact['Measured (a later snapshot exists)'], 11);
});

test('live mode stops at the daily email quota', () => {
  const app = loadApp({ dryRun: false, quota: 4, now: () => '2026-11-02T15:00:00Z' });
  app.context.sendDuesReminders();
  assert.equal(app.sent.length, 4);
  assert.equal(app.sheets['Reminder Log'].grid.length, 1 + 4);
  assert.ok(app.logs.some((l) => /quota reached/.test(l[0])));
});
