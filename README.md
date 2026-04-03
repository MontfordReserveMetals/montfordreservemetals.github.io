# Montford Reserve Metals Website

This repo contains the Montford Reserve Metals public website and client portal pattern, built for GitHub Pages with Supabase handling authentication and records.

## What this gives you

- A static marketing site with a restrained old-money visual direction
- A manual gold estimator driven by one config file
- A customer portal page that can run in preview mode immediately
- A staff-only admin dashboard for reviewing intake and updating portal-visible quote statuses
- A live Supabase integration path for magic-link login and status tracking
- A starter SQL schema with Row Level Security policies
- A GitHub Actions workflow that deploys the site to GitHub Pages

## File map

- `index.html`: public-facing homepage
- `process.html`: client process and shipping protocol page
- `terms.html`: working legal terms template
- `privacy.html`: privacy policy template
- `portal.html`: customer portal shell
- `admin.html`: staff-only office dashboard shell
- `css/site.css`: full visual system and responsive styles
- `js/site-shell.js`: shared brand, footer, and reveal logic
- `js/static-page.js`: shared behavior for non-interactive supporting pages
- `js/site-config.js`: edit this file with your contact info, pricing number, and Supabase details
- `js/main.js`: homepage interactions and estimator logic
- `js/portal.js`: Supabase login and customer dashboard rendering
- `js/admin.js`: staff login and office dashboard management UI
- `supabase/schema.sql`: starter tables, triggers, and RLS policies
- `supabase/schedule-market-refresh.sql`: ready-to-run cron setup for refreshing cached metals prices twice daily
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
   - `market_price_cache`
   - `profiles`
   - `staff_users`
   - `quotes`
   - `shipments`
   - `offers`
   - `payouts`
6. Add the function secrets you need:
   - `METALS_DEV_API_KEY`
   - `MARKET_REFRESH_SECRET`
   - `GOLD_PAYOUT_FACTOR`
   - `SB_PUBLISHABLE_KEY` if your website uses a modern `sb_publishable_...` client key
   - optional later: `SILVER_PAYOUT_FACTOR`, `PLATINUM_PAYOUT_FACTOR`, `PALLADIUM_PAYOUT_FACTOR`

## How to enable the staff admin dashboard

1. Re-run `supabase/schema.sql` so the latest `staff_users` table and staff RLS policies are in place.
2. In Supabase `Authentication -> Users`, create your staff account or sign up once with the email you want to use internally.
3. In the SQL editor, add that authenticated user to `staff_users`:

```sql
insert into public.staff_users (user_id, full_name, role)
values (
  'YOUR_AUTH_USER_UUID',
  'Your Name',
  'admin'
)
on conflict (user_id) do update
set
  full_name = excluded.full_name,
  role = excluded.role;
```

4. Open `admin.html` on your GitHub Pages site.
5. Sign in with that staff email and password.
6. The dashboard will then let you:
   - review `intake_requests`
   - mark requests as `new`, `reviewed`, `contacted`, `converted`, or `closed`
   - match requests to portal accounts by email
   - create `quotes` for matched customers
   - update the quote status and status detail that customers see in the portal

## How the market-price flow works

- `refresh-market-prices` calls `metals.dev` and caches spot prices in `market_price_cache`.
- `estimate-payout` reads the cached price and applies your private payout factor inside an Edge Function.
- The scrolling market banner reads the cached rows from `market_price_cache`, so public page views do not consume `metals.dev` requests.
- The website receives only the final customer-facing estimate, not your internal formula.
- This is a better fit for the `metals.dev` free tier because you can refresh the cache on a schedule instead of hitting the API on every page interaction.
- The backend is ready for `gold`, `silver`, `platinum`, and `palladium`, but the current public form still uses a gold-first `karat + weight` flow.
- When you want public silver or platinum estimates, add a metal selector and metal-specific purity options rather than reusing the gold-only karat dropdown.

## How to deploy the Edge Functions

1. Install the Supabase CLI if you have not already.
2. Log in and link your local project:
   - `supabase login`
   - `supabase link --project-ref YOUR_PROJECT_REF`
3. Set the required secrets:
   - `supabase secrets set METALS_DEV_API_KEY=YOUR_KEY`
   - `supabase secrets set MARKET_REFRESH_SECRET=YOUR_SECRET`
   - `supabase secrets set GOLD_PAYOUT_FACTOR=0.85`
4. Deploy the functions:
   - `supabase functions deploy refresh-market-prices`
   - `supabase functions deploy estimate-payout`
5. Prime the cache once after deploy:
   - call `refresh-market-prices` once with your `MARKET_REFRESH_SECRET`
6. If you want automated refreshes, run `supabase/schedule-market-refresh.sql` in the SQL editor after adding the needed Vault secrets.
7. After the cache is filled, the homepage can request private payout estimates through `estimate-payout`.

Example cache refresh request:

```bash
curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/refresh-market-prices" \
  -H "Content-Type: application/json" \
  -H "x-refresh-secret: YOUR_MARKET_REFRESH_SECRET"
```

That request format works cleanly with Supabase's function gateway and keeps the real refresh permission behind your private `MARKET_REFRESH_SECRET`.

If your project uses the newer `sb_publishable_...` client key format, do not send that value in the `Authorization: Bearer ...` header to a function with JWT verification enabled. This repo now sets `verify_jwt = false` for the two included functions in [supabase/config.toml](/home/ethan/Gold_silver_business/supabase/config.toml#L1), and `estimate-payout` accepts either the legacy `anon` JWT key or an `SB_PUBLISHABLE_KEY` function secret.

## Suggested refresh cadence for metals.dev free tier

- `metals.dev` gives you 100 API calls per month on the free tier.
- The refresh function does not run on its own unless you schedule it. By default, it runs only when you invoke it.
- Refreshing cached prices once every 8 hours uses about 90 calls in a 30-day month.
- Refreshing once every 12 hours uses about 60 calls in a 30-day month.
- Refreshing once per day uses about 30 calls in a 30-day month.
- For bootstrap mode, once or twice per day is the safest starting point.
- The included schedule file sets two jobs per day, which is about 60 calls in a 30-day month.
- Those jobs are pinned to fixed EST times using UTC cron expressions: `15:30 UTC` and `01:00 UTC`.
- On March 29, 2026, New York is on EDT (UTC-4), so those fixed EST jobs would currently fire at `11:30 AM` and `9:00 PM` local New York time.
- When New York returns to EST (UTC-5), they will fire at `10:30 AM` and `8:00 PM` local time again.

## Important security rule

The Supabase anon key is public and is meant to be used in the browser. The Supabase service-role key is not public and must never be placed in a GitHub Pages site.

## How the public intake works

- The homepage estimator writes public requests into `intake_requests`.
- That table has an insert-only policy for `anon` and `authenticated` visitors.
- Customers do not need an account to request an estimate.
- When that same customer later signs into the portal with the same email address, the portal can automatically claim matching `intake_requests` and create portal-visible `quotes` with status `submitted`.
- The portal now also lets signed-in customers upload outbound shipment tracking, the amount they paid for shipping, and a receipt image or PDF.
- When the Edge Functions are deployed, the public estimate should come from the private `estimate-payout` function instead of an exposed browser-side formula.
- You review `intake_requests` inside the Supabase dashboard and decide which ones move forward.

## How the portal works

- GitHub Pages serves the static HTML, CSS, and JavaScript.
- Supabase Auth sends magic-link sign-in emails.
- The first successful sign-in creates a row in `profiles` automatically through the trigger in `supabase/schema.sql`.
- On sign-in, the portal also runs `claim_portal_intake_requests()` to pull in matching anonymous homepage requests for that same email and show them as `submitted` client files.
- Signed-in customers can mark a package `in_transit` by uploading tracking, shipping cost, and a receipt image.
- When a final offer is sent, the customer can accept or decline it from the portal.
- Row Level Security ensures customers can only read rows that belong to their own user id.
- Staff can manage intake and quote status from `admin.html`, while deeper table work can still be done in Supabase directly when needed.

## Rest of the build

1. Replace the placeholder brand, contact info, and house buy price in `js/site-config.js`.
2. Run `supabase/schema.sql`.
3. Push to GitHub and enable Pages with GitHub Actions.
4. Test the homepage form and confirm a row lands in `intake_requests`.
5. Review leads in Supabase and manually mark the strong ones as `reviewed` or `contacted`.
6. Have the customer use the portal magic-link flow when you are ready to give them account access.
7. On that portal sign-in, matching anonymous homepage requests for the same email can appear automatically as `submitted` client files.
8. Use `admin.html` to review the intake request, confirm the linked file, record inspection details, send the final offer, and move the portal status forward from there.
9. Customers can upload shipment proof and accept or decline final offers from `portal.html`.
10. Use `admin.html` or Supabase directly to mark payout and deeper case-management details while volume is low.
11. Add legal pages, mailing instructions, and your real operating copy before launch.
12. Only after real volume exists, add shipping-label automation, email automation, and payout automation.

## Supporting pages included now

- `process.html` gives you a public operations and shipping protocol page.
- `terms.html` gives you a strong working structure for estimates, inspection, offers, and settlement terms.
- `privacy.html` gives you a privacy template aligned with GitHub Pages and Supabase.
- These pages are intentionally polished, but they are still templates and should be reviewed against your real process and legal requirements before launch.

## Suggested next steps in code

1. Extend the admin dashboard to manage shipments, final offers, and payouts in addition to quotes.
2. Add branded transactional email once the intake flow is working reliably.
3. Add optional document upload or ID upload once you know exactly when you need it.
4. Add bot protection such as Turnstile or hCaptcha if the public intake form starts attracting spam.

## Local preview

If you want to preview locally without installing anything else, from this folder run:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.
