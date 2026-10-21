# PT Revenue Radar — Final

A mobile-first static MVP for Personal Trainers.

## What is included

- Daily revenue-opportunity dashboard
- At-risk client detection
- Renewal detection
- Lead follow-up detection
- Frequency-drop detection
- Search and filters
- Client details
- Recommended action
- Ready-to-send WhatsApp message
- Copy message / open WhatsApp
- Mark follow-up done
- Add and delete clients
- Local data persistence
- Export/import JSON backup
- Installable PWA shell
- Mobile responsive design

## Important

This is the **final front-end MVP**. It runs entirely in the browser and stores data locally on the device.

It is **not yet a cloud SaaS**: there is no user login, shared database, Stripe subscription or real OpenAI API connection. Those require a backend and are the next separate production stage.

## GitHub Pages

Upload/replace these files in your repository root:

- index.html
- styles.css
- app.js
- manifest.json
- sw.js

Then wait for GitHub Pages to rebuild.

## Reset demo data

Open browser storage for the site and remove the `ptrr_final_v1` localStorage key.
