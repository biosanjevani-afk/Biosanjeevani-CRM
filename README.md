# BioSanjeevani CRM

A responsive, static internal lead-management CRM built with HTML, CSS, vanilla JavaScript, and the Supabase JavaScript client.

## Configure locally

1. Copy `supabase-config.example.js` to `supabase-config.js`.
2. Add the Supabase project URL and its **publishable (or legacy anon) key**. Do not use a `service_role` key.
3. Serve the project from a local web server (ES modules cannot be loaded safely from `file://`). For example: `npx serve .`
4. Open the provided local URL and sign in using an existing Supabase Auth email/password user. There is intentionally no signup flow.

The app reads and writes only the existing `leads` table; it does not alter schemas, policies, or authentication settings. Ensure your existing Row Level Security policies allow authenticated users the intended access.

## Files

- `index.html` — application entry point
- `styles.css` — responsive green BioSanjeevani-style UI
- `js/supabase.js` — public Supabase client initialization
- `js/leads-api.js` — isolated `leads` CRUD data layer
- `js/ui.js` — rendering and UI helpers
- `js/app.js` — authentication, app state, and event handling
