# PT Revenue Radar — Full Fixed Version

This version fixes the JavaScript startup/login issue and includes the current client/package features.

Included:
- Login / signup with Supabase
- Add client with email and lead source
- Edit client name, phone and email
- Multiple packages per client
- Automatic package pricing
- Package purchase history
- Session tracking linked to packages
- Remaining sessions
- Revenue opportunity
- Delete client and linked data
- Mobile responsive layout

IMPORTANT: Do NOT overwrite your existing `config.js`, because it contains your Supabase Publishable key. `config.js.example` is only a template.


## v2 additions
- Add Client is now inside the All Clients panel.
- Monthly session calendar on the dashboard with previous/next month and Today controls.
- Booked sessions are shown on each calendar day; clicking a session opens the client.
- Existing config.js is intentionally not included in the ZIP; keep your current Supabase key.
