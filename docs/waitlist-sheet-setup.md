# Waitlist → Google Sheet + email: setup

Every new waitlist signup is sent from Supabase to a small Google Apps Script,
which adds a row to a Google Sheet and emails you. No edge function is involved.

Until you finish these steps the waitlist still works: emails are saved in the
`waitlist_signups` table (Supabase → Table Editor), you just don't get the sheet
row or the email.

## 1. Create the sheet

1. Go to https://sheets.new and name it **Olia waitlist**.
2. Leave it empty. The script writes the header row (Timestamp, Email, Source).
3. Share it with anyone who should see signups (Share → add their email).

## 2. Add the script

1. In the sheet: **Extensions → Apps Script**.
2. Delete everything in the editor, then paste the full contents of
   `docs/waitlist-sheet-apps-script.gs`.
3. Click the disk icon (**Save**).

## 3. Set the secret

1. Pick a long random string (for example the output of `openssl rand -hex 24`).
   This is your `<SECRET>`; keep it somewhere safe.
2. In Apps Script: **Project Settings** (gear icon, left) → **Script Properties**
   → **Add script property**.
3. Property: `SECRET`  Value: your `<SECRET>`  → **Save script properties**.

## 4. Deploy as a web app

1. Top right: **Deploy → New deployment**.
2. Click the gear next to "Select type" → **Web app**.
3. Description: `Olia waitlist`. **Execute as: Me**. **Who has access: Anyone**.
4. **Deploy**, then **Authorize access** and accept the Google permission
   prompts (it needs to edit the sheet and send email as you; if you see
   "Google hasn't verified this app", click Advanced → Go to Olia waitlist).
5. Copy the **Web app URL** (ends in `/exec`). This is your `<URL>`.

## 5. Tell Supabase where to send signups

In Supabase → SQL Editor, run this one statement with your two values:

```sql
INSERT INTO public.app_config (key, value) VALUES ('waitlist_webhook_url', '<URL>?secret=<SECRET>') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

## 6. Test it

Join the waitlist on oliahq.com with a test address. Within a few seconds you
should get an email "New Olia waitlist signup: …" and a new sheet row. Joining
again with the same address adds nothing and sends nothing.

## Notes

- If you change the script later: **Deploy → Manage deployments → pencil →
  Version: New version → Deploy** (the URL stays the same).
- If the sheet or script is down, signups still save in Supabase: the trigger
  only logs a warning and never blocks the visitor.
- To stop notifications: `DELETE FROM public.app_config WHERE key = 'waitlist_webhook_url';`
- To rotate the secret: change the `SECRET` Script Property, then re-run step 5.
- Emails are sent from your Google account and count towards Google's daily
  mail quota (about 100/day on a free account). The sheet row is always added
  first.
