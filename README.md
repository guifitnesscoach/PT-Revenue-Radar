# PT Revenue Radar — Salary Prediction v7

This version keeps the existing Supabase setup and adds:

- Clients moved into the main menu.
- Active Clients / Not Active tabs.
- Prospect Clients area for Fitness Manager leads.
- Prospect contact tracking with contacted date/time.
- Add prospect, delete prospect, and export prospects to CSV.
- Add package & convert a prospect into a client in one flow.
- Converted prospects become normal clients with an active package.
- Salary Calculator, Sessions Calendar, daily calendar breakdown, package management and session time booking retained.

IMPORTANT: keep your existing `config.js` with your Supabase URL and Publishable Key. Do not replace it with `config.js.example`.


## Prospect spreadsheet import
The Prospect Clients page supports importing CSV, XLSX, and XLS files. Use columns named Name and Email; Phone and Notes are optional. Duplicate prospect emails are skipped. Imported prospects are saved as Fitness Manager leads and do not create client accounts until converted with a package.


## Account-specific branding
The header and menu now use the account owner's full name from the Supabase profile (for example, “Guilherme Tracker”). If no name is available, the app falls back to the email name.


Update: client pages now show packages only; session booking/history are handled inside each package page.
