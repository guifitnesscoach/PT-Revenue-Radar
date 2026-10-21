# My Name Tracker v17

Changes in v17:
- Client list cards no longer show phone or email. Contact details and WhatsApp/Email actions are available on the client detail page.
- Package session list now has an Edit button.
- Edit session allows changing the date, time and notes of an already booked session.
- Rescheduling checks the same-time/same-day conflict rule and excludes the session being edited from the conflict check.
- No Supabase migration is required for these changes.
- Keep your existing `config.js`; do not replace it with `config.js.example`.


## v18 fix
Revenue opportunity is calculated per remaining session using the package total value divided by the package session count. Example: 10-session pack £950 with 7 remaining = £665 revenue opportunity.
