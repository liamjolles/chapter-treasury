/**
 * All settings live here. Column letters and row numbers match the sheet as you see it
 * (A = first column, row 1 = first row).
 */
var CONFIG = {
  // true: write would-be emails to the Preview tab and send nothing.
  // false: send reminders by email and record them in the Reminder Log.
  DRY_RUN: true,

  SHEETS: {
    PAYMENTS: 'Payments',
    JOURNAL: 'Journal',
    PREVIEW: 'Preview',
    LOG: 'Reminder Log',
    ISSUES: 'Data Issues',
    SUMMARY: 'Summary',
    SNAPSHOTS: 'Snapshots',
    IMPACT: 'Impact',
    FORECAST: 'Forecast'
  },

  // Row holding the fee amounts (Social Fee / Formal / Pig Roast). Amounts are read from
  // here, never hardcoded, so changing a fee in the sheet changes every calculation.
  FEE_ROW: 3,

  FEES: [
    { key: 'social', label: 'Social Fee', column: 'B' },
    { key: 'formal', label: 'Formal', column: 'C' },
    { key: 'pigRoast', label: 'Pig Roast', column: 'D' }
  ],

  NAME_COLUMN: 'A',
  NOTES_COLUMN: 'E',
  EMAIL_COLUMN: 'F',

  // Header rows that start each class block (matched case-insensitively in the name column).
  CLASS_NAMES: ['FRESHMEN', 'SOPHOMORE', 'JUNIOR', 'SENIOR'],

  // A blank fee cell means "not billed yet" by default, so nobody is chased for a fee that
  // doesn't apply to them. Set to true to treat blanks the same as "Not Paid".
  BLANK_MEANS_NOT_PAID: false,

  // Reminder email content.
  DUES_LABEL: '2026-2027 social dues',
  SENDER_NAME: 'Social Chair',
  PAYMENT_INSTRUCTIONS: 'You can pay your balance through Billhighway:',
  PAYMENT_LINK: 'https://www.billhighway.com',

  // Don't email the same person again within this many days. Six (not seven) so a weekly
  // trigger that fires a few minutes early still sends.
  COOLDOWN_DAYS: 6,

  // How many of the largest outstanding balances to list on the Summary tab.
  TOP_BALANCES: 10,

  // Journal tab (event spending log). Columns are found by header text, so order doesn't matter.
  // An entry counts toward a fee when it mentions that fee (e.g. "Formal venue deposit"), in
  // the EVENT_HEADER column if there is one, otherwise in the description. Everything else
  // counts toward DEFAULT_FEE.
  JOURNAL: {
    HEADER_ROW: 4,
    DATE_HEADER: 'Date',
    DESCRIPTION_HEADER: 'Event / Use Case',
    EVENT_HEADER: null,
    AMOUNT_HEADER: 'Cost',
    DEFAULT_FEE: 'social'
  },

  // Planned total spend per event. Leave null to compare against spending logged so far.
  BUDGETS: { social: null, formal: null, pigRoast: null },

  // Share of today's outstanding balance the forecast expects to still come in (0 to 1).
  EXPECTED_RECOVERY_RATE: 0.75
};

if (typeof module !== 'undefined') {
  module.exports = { CONFIG: CONFIG };
}
