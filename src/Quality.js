/**
 * Pure data-quality checks across members. Cell-level problems (unrecognized values,
 * overpayments, rows outside a class block) are found by parsePayments; these checks look
 * for problems that only show up across the whole roster.
 */

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

/**
 * @param members  parsed members (from parsePayments)
 * @param totals   amount owed per member, same order as members
 */
function findMemberIssues(members, totals) {
  var issues = [];
  var seenNames = {};
  var seenEmails = {};

  members.forEach(function (m, i) {
    if (!m.email) {
      if (totals[i] > 0) {
        issues.push(memberIssue(m, 'Email', 'missing_email', '', 'Owes $' + totals[i] + ' but has no email, so no reminder can be sent.'));
      }
    } else if (!isValidEmail(m.email)) {
      issues.push(memberIssue(m, 'Email', 'invalid_email', m.email, 'Email address looks invalid; no reminder will be sent.'));
    }

    var nameKey = m.name.toLowerCase();
    if (seenNames[nameKey]) {
      issues.push(memberIssue(m, 'Name', 'duplicate_name', m.name, 'Same name as row ' + seenNames[nameKey] + '.'));
    } else {
      seenNames[nameKey] = m.row;
    }

    var emailKey = m.email.toLowerCase();
    if (emailKey) {
      if (seenEmails[emailKey]) {
        issues.push(memberIssue(m, 'Email', 'duplicate_email', m.email, 'Same email as row ' + seenEmails[emailKey] + '.'));
      } else {
        seenEmails[emailKey] = m.row;
      }
    }
  });

  return issues;
}

function memberIssue(m, field, type, value, message) {
  return { row: m.row, name: m.name, field: field, type: type, value: value, message: message };
}

/** Combine parser and roster issues into rows for the Data Issues tab, ordered by sheet row. */
function issueRows(issues) {
  return issues.slice()
    .sort(function (a, b) { return a.row - b.row; })
    .map(function (i) { return [i.row, i.name, i.field, i.type, i.value, i.message]; });
}

var ISSUE_HEADER = ['Row', 'Name', 'Field', 'Issue', 'Value', 'Details'];

if (typeof module !== 'undefined') {
  module.exports = {
    isValidEmail: isValidEmail,
    findMemberIssues: findMemberIssues,
    issueRows: issueRows,
    ISSUE_HEADER: ISSUE_HEADER
  };
}
