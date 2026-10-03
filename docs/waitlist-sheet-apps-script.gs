/**
 * Olia waitlist → Google Sheet + email notification.
 *
 * Receives the JSON that the waitlist_signups trigger POSTs from Supabase:
 *   { "email": "...", "created_at": "2026-10-03T14:22:00Z", "source": "landing" }
 * to  <web app URL>?secret=<SECRET>
 *
 * - Rejects requests whose ?secret= doesn't match the Script Property SECRET.
 * - Appends [timestamp, email, source] to the active sheet, unless the email is
 *   already in column B (case-insensitive).
 * - Emails the sheet owner "New Olia waitlist signup: <email>".
 *
 * Setup: docs/waitlist-sheet-setup.md
 */

var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
var MAX_EMAIL = 254;

function doPost(e) {
  var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  var given = e && e.parameter ? e.parameter.secret : '';
  if (!secret || given !== secret) {
    return json_({ ok: false, error: 'unauthorized' });
  }

  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad json' });
  }

  var email = String(data.email || '').trim();
  if (!email || email.length > MAX_EMAIL || !EMAIL_RE.test(email)) {
    return json_({ ok: false, error: 'invalid email' });
  }
  var source = String(data.source || 'landing').slice(0, 40);
  var when = data.created_at ? new Date(data.created_at) : new Date();
  if (isNaN(when.getTime())) when = new Date();

  // One signup at a time, so two near-simultaneous posts can't both pass the
  // duplicate check.
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = SpreadsheetApp.getActiveSheet();
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp', 'Email', 'Source']);
    }

    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var existing = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
      var needle = email.toLowerCase();
      for (var i = 0; i < existing.length; i++) {
        if (String(existing[i][0]).trim().toLowerCase() === needle) {
          return json_({ ok: true, duplicate: true });
        }
      }
    }

    // A cell starting with = + - @ would be treated as a formula; keep it text.
    var safeEmail = /^[=+\-@]/.test(email) ? "'" + email : email;
    sheet.appendRow([when, safeEmail, source]);
  } finally {
    lock.releaseLock();
  }

  MailApp.sendEmail(
    Session.getEffectiveUser().getEmail(),
    'New Olia waitlist signup: ' + email,
    'New Olia waitlist signup: ' + email
  );

  return json_({ ok: true });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
