# PT Revenue Radar / My Name Tracker

Current version: v27

## What's included
- Client and prospect management
- Prospect contact history
- Non-contacted vs contacted lead tabs
- Select individual prospects or Select all
- Bulk email composer for selected non-contacted prospects
- Each prospect receives a separate personalised email (no recipient list is exposed)
- `{{first_name}}`, `{{name}}`, and `{{sender_name}}` placeholders
- Successful bulk emails are automatically recorded as Email contacts and move the prospect to Contacted leads
- Existing package/session tracking, dashboard, salary calculator and session calendar
- Account deletion flow

## Important: keep config.js
Keep your existing `config.js` with your Supabase URL and publishable key. The ZIP only contains `config.js.example` so your real key is not overwritten.

## Bulk email setup
The bulk-email feature sends through the Supabase Edge Function `send-prospect-emails` and Resend. The Resend API key is never placed in the browser.

1. Create a Resend account and verify the domain/email address you want to use as the sender.
2. In Supabase Dashboard → Edge Functions → Secrets, add:
   - `RESEND_API_KEY` = your Resend API key
   - `RESEND_FROM_EMAIL` = the verified sender email address, for example `hello@yourdomain.com`
3. The Edge Function is already deployed as `send-prospect-emails`.
4. In the app, open Prospect Clients → Non-contacted leads → select leads → Send email to selected.

The app sends one email per prospect, with the prospect's first name inserted when `{{first_name}}` is used. Replies are directed to the logged-in account email.

## No database migration required
The existing `prospect_contacts` table is reused to record successful email sends.
