/**
 * All settings live here. Column letters and row numbers match the sheet as you see it
 * (A = first column, row 1 = first row).
 */
var CONFIG = {
  SHEETS: {
    PAYMENTS: 'Payments'
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
  CLASS_NAMES: ['FRESHMEN', 'SOPHOMORE', 'JUNIOR', 'SENIOR']
};

if (typeof module !== 'undefined') {
  module.exports = { CONFIG: CONFIG };
}
