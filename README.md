# Montford Reserve Metals Website

This repo contains the Montford Reserve Metals public website and client portal pattern, built for GitHub Pages with Supabase handling authentication and records.

## What this gives you

- A static marketing site with a restrained old-money visual direction
- A manual gold estimator driven by one config file
- A customer portal page that can run in preview mode immediately
- A live Supabase integration path for magic-link login and status tracking
- A starter SQL schema with Row Level Security policies
- A GitHub Actions workflow that deploys the site to GitHub Pages

## File map

- `index.html`: public-facing homepage
- `process.html`: client process and shipping protocol page
- `terms.html`: working legal terms template
- `privacy.html`: privacy policy template
- `portal.html`: customer portal shell
- `css/site.css`: full visual system and responsive styles
- `js/site-shell.js`: shared brand, footer, and reveal logic
- `js/static-page.js`: shared behavior for non-interactive supporting pages
- `js/site-config.js`: edit this file with your contact info, pricing number, and Supabase details
- `js/main.js`: homepage interactions and estimator logic
- `js/portal.js`: Supabase login and customer dashboard rendering
- `supabase/schema.sql`: starter tables, triggers, and RLS policies
- `.github/workflows/pages.yml`: GitHub Pages deployment workflow

## How to publish on GitHub Pages

1. Create a GitHub repository and push these files to the `main` branch.
2. In GitHub, open `Settings -> Pages`.
3. Set the source to `GitHub Actions`.
4. Push to `main` and let the bundled workflow deploy the static site.
5. Your site URL will usually be:
   - `https://USERNAME.github.io/REPO-NAME/`
   - Or your custom domain if you attach one later.

## How to connect Supabase

1. Create a Supabase project.
2. In the Supabase SQL editor, run `supabase/schema.sql`.
3. In Supabase `Authentication -> URL Configuration`, set:
   - Site URL to your GitHub Pages base URL
   - Redirect URL to your exact portal page, for example `https://USERNAME.github.io/REPO-NAME/portal.html`
4. Open `js/site-config.js` and replace:
   - `YOUR_SUPABASE_URL`
   - `YOUR_SUPABASE_ANON_KEY`
   - `YOUR-GITHUB-PAGES-URL/portal.html`
5. In the Supabase table editor, confirm these tables now exist:
   - `intake_requests`
   - `profiles`
   - `quotes`
   - `shipments`
   - `offers`
   - `payouts`

## Important security rule

The Supabase anon key is public and is meant to be used in the browser. The Supabase service-role key is not public and must never be placed in a GitHub Pages site.

## How the public intake works

- The homepage estimator writes public requests into `intake_requests`.
- That table has an insert-only policy for `anon` and `authenticated` visitors.
- Customers do not need an account to request an estimate.
- You review `intake_requests` inside the Supabase dashboard and decide which ones move forward.

## How the portal works

- GitHub Pages serves the static HTML, CSS, and JavaScript.
- Supabase Auth sends magic-link sign-in emails.
- The first successful sign-in creates a row in `profiles` automatically through the trigger in `supabase/schema.sql`.
- Row Level Security ensures customers can only read rows that belong to their own user id.
- While you are small, you can manage quotes, shipments, offers, and payouts from the Supabase dashboard directly.

## Rest of the build

1. Replace the placeholder brand, contact info, and house buy price in `js/site-config.js`.
2. Run `supabase/schema.sql`.
3. Push to GitHub and enable Pages with GitHub Actions.
4. Test the homepage form and confirm a row lands in `intake_requests`.
5. Review leads in Supabase and manually mark the strong ones as `reviewed` or `contacted`.
6. Have the customer use the portal magic-link flow when you are ready to give them account access.
7. After that first sign-in creates their `profiles` row, create a `quotes` row in Supabase with `user_id` set to that `profiles.id`.
8. Update shipments, offers, and payouts manually in Supabase while volume is low.
9. Add legal pages, mailing instructions, and your real operating copy before launch.
10. Only after real volume exists, add shipping-label automation, email automation, and payout automation.

## Supporting pages included now

- `process.html` gives you a public operations and shipping protocol page.
- `terms.html` gives you a strong working structure for estimates, inspection, offers, and settlement terms.
- `privacy.html` gives you a privacy template aligned with GitHub Pages and Supabase.
- These pages are intentionally polished, but they are still templates and should be reviewed against your real process and legal requirements before launch.

## Suggested next steps in code

1. Add a dedicated internal admin page later if you want to stop living in the Supabase dashboard.
2. Add branded transactional email once the intake flow is working reliably.
3. Add optional document upload or ID upload once you know exactly when you need it.
4. Add bot protection such as Turnstile or hCaptcha if the public intake form starts attracting spam.

## Local preview

If you want to preview locally without installing anything else, from this folder run:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.
