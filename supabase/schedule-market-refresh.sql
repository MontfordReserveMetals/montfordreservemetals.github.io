create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Store these once in Vault before running the schedules below.
-- Dashboard path: Database -> Vault
--
-- Example SQL:
-- select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
-- select vault.create_secret('YOUR_SUPABASE_ANON_KEY', 'publishable_key');
-- select vault.create_secret('YOUR_MARKET_REFRESH_SECRET', 'market_refresh_secret');
--
-- These schedules are expressed in UTC so the database can remain on its default UTC timezone.
-- They are fixed to Eastern Standard Time (UTC-5):
--   15:30 UTC = 10:30 AM EST
--   01:00 UTC = 8:00 PM EST (previous calendar day in New York when viewed in UTC)
--
-- Important: during daylight saving time in New York (EDT, UTC-4), these same UTC jobs
-- will run at 11:30 AM and 9:00 PM local time.

select
  cron.schedule(
    'refresh-market-prices-1030-est',
    '30 15 * * *',
    $$
    select
      net.http_post(
        url:= (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/refresh-market-prices',
        headers:=jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
          'x-refresh-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'market_refresh_secret')
        ),
        body:=jsonb_build_object(
          'triggered_by', 'cron',
          'schedule_name', 'refresh-market-prices-1030-est',
          'scheduled_for', '10:30 AM EST'
        ),
        timeout_milliseconds:=10000
      ) as request_id;
    $$
  );

select
  cron.schedule(
    'refresh-market-prices-2000-est',
    '0 1 * * *',
    $$
    select
      net.http_post(
        url:= (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/refresh-market-prices',
        headers:=jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
          'x-refresh-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'market_refresh_secret')
        ),
        body:=jsonb_build_object(
          'triggered_by', 'cron',
          'schedule_name', 'refresh-market-prices-2000-est',
          'scheduled_for', '8:00 PM EST'
        ),
        timeout_milliseconds:=10000
      ) as request_id;
    $$
  );

-- Helpful checks after setup:
-- select jobid, jobname, schedule, active from cron.job order by jobname;
-- select * from cron.job_run_details order by start_time desc limit 20;
