/**
 * Pure dues logic. No SpreadsheetApp / MailApp calls in this file, so the same code runs
 * inside Apps Script (as globals) and in Node (via module.exports) for unit tests.
 */

var STATUS = {
  PAID: 'paid',
  NOT_PAID: 'not_paid',
  PARTIAL: 'partial',
  BLANK: 'blank',
  UNKNOWN: 'unknown'
};

/** 'A' -> 0, 'F' -> 5, 'AA' -> 26 */
function columnIndex(letter) {
  var s = String(letter).trim().toUpperCase();
  var n = 0;
  for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n - 1;
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

/** Strict money parse for payment cells: 300, "300", "$1,250.50". Anything else -> null. */
function parseMoney(value) {
  if (typeof value === 'number') return isFinite(value) ? value : null;
  var s = String(value).trim().replace(/[$,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** Loose parse for the fee row, which may read "650", "$650", or "Social Fee $650". */
function parseFeeAmount(value) {
  if (typeof value === 'number') return isFinite(value) ? value : null;
  var m = String(value).match(/\$\s*(\d[\d,]*(?:\.\d+)?)/) || String(value).match(/(\d[\d,]*(?:\.\d+)?)/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

/** Interpret one fee cell: "Paid", "Not Paid", a number (amount paid so far), or blank. */
function classifyCell(value) {
  if (isBlank(value)) return { status: STATUS.BLANK };
  var text = String(value).trim().toLowerCase().replace(/\s+/g, ' ');
  if (text === 'paid') return { status: STATUS.PAID };
  if (text === 'not paid' || text === 'unpaid') return { status: STATUS.NOT_PAID };
  var amount = parseMoney(value);
  if (amount !== null) return { status: STATUS.PARTIAL, amount: amount };
  return { status: STATUS.UNKNOWN };
}

function cellText(row, index) {
  var v = row[index];
  return isBlank(v) ? '' : String(v).trim();
}

/**
 * Parse the Payments tab (a 2D array of cell values) into fees, members, and data issues.
 * Class blocks are found by their header rows, not by fixed row numbers.
 */
function parsePayments(rows, config) {
  var nameCol = columnIndex(config.NAME_COLUMN);
  var emailCol = columnIndex(config.EMAIL_COLUMN);
  var notesCol = columnIndex(config.NOTES_COLUMN);
  var feeRow = rows[config.FEE_ROW - 1] || [];
  var classNames = config.CLASS_NAMES.map(function (c) { return c.toUpperCase(); });

  var fees = {};
  config.FEES.forEach(function (f) {
    var amount = parseFeeAmount(feeRow[columnIndex(f.column)]);
    if (amount === null || amount <= 0) {
      throw new Error('Could not read the ' + f.label + ' amount from row ' + config.FEE_ROW +
        ', column ' + f.column + '.');
    }
    fees[f.key] = amount;
  });

  var members = [];
  var issues = [];
  var currentClass = null;

  for (var i = config.FEE_ROW; i < rows.length; i++) {
    var row = rows[i] || [];
    var rowNumber = i + 1;
    var name = cellText(row, nameCol);

    if (classNames.indexOf(name.toUpperCase()) !== -1) {
      currentClass = name.toUpperCase();
      continue;
    }
    if (name.toLowerCase() === 'name') continue; // column header row

    var feeCells = config.FEES.map(function (f) { return row[columnIndex(f.column)]; });
    var hasData = feeCells.some(function (v) { return !isBlank(v); }) || !isBlank(row[emailCol]);

    if (!name) {
      if (hasData) issues.push(issue(rowNumber, '', 'Name', 'missing_name', '', 'Row has payment data but no name.'));
      continue;
    }
    if (!currentClass) {
      issues.push(issue(rowNumber, name, 'Name', 'outside_class_block', name,
        'Row is above the first class header, so it was not counted.'));
      continue;
    }

    var member = {
      name: name,
      classYear: currentClass,
      email: cellText(row, emailCol),
      notes: cellText(row, notesCol),
      row: rowNumber,
      fees: {}
    };

    config.FEES.forEach(function (f, idx) {
      var raw = feeCells[idx];
      member.fees[f.key] = raw;
      var c = classifyCell(raw);
      if (c.status === STATUS.UNKNOWN) {
        issues.push(issue(rowNumber, name, f.label, 'unrecognized_value', raw,
          'Expected "Paid", "Not Paid", an amount, or blank. Not counted until fixed.'));
      } else if (c.status === STATUS.PARTIAL && c.amount < 0) {
        issues.push(issue(rowNumber, name, f.label, 'negative_amount', raw, 'Amount paid is negative.'));
      } else if (c.status === STATUS.PARTIAL && c.amount > fees[f.key]) {
        issues.push(issue(rowNumber, name, f.label, 'overpaid', raw,
          'Paid more than the ' + f.label + ' amount ($' + fees[f.key] + ').'));
      }
    });

    members.push(member);
  }

  return { fees: fees, members: members, issues: issues };
}

function issue(row, name, field, type, value, message) {
  return { row: row, name: name, field: field, type: type, value: value, message: message };
}

if (typeof module !== 'undefined') {
  module.exports = {
    STATUS: STATUS,
    columnIndex: columnIndex,
    isBlank: isBlank,
    parseMoney: parseMoney,
    parseFeeAmount: parseFeeAmount,
    classifyCell: classifyCell,
    parsePayments: parsePayments
  };
}
