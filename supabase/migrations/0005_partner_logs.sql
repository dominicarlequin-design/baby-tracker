-- Keeps both parents in step so the same feed or diaper doesn't get logged
-- twice:
--  1. baby_events.logged_by records which family account made each log.
--  2. push_subscriptions.user_email records whose phone each alert
--     subscription belongs to, so the partner alert skips the person who
--     just logged.
--  3. baby_events goes into the realtime publication, so an open app sees
--     the other parent's log within a second (and RLS still applies).
--  4. A new log calls the notify-log Edge Function, which pushes
--     "Ysa logged a feed" to the other parent's phones.

alter table public.baby_events add column if not exists logged_by text;
alter table public.push_subscriptions add column if not exists user_email text;

-- Set from the signed-in account, never from the request body, so a log
-- can't claim to be from the other parent.
create or replace function public.stamp_logged_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.jwt() ->> 'email' is not null then
    new.logged_by := lower(auth.jwt() ->> 'email');
  end if;
  return new;
end;
$$;

drop trigger if exists baby_events_stamp_logged_by on public.baby_events;
create trigger baby_events_stamp_logged_by
  before insert on public.baby_events
  for each row execute function public.stamp_logged_by();

create or replace function public.stamp_push_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.jwt() ->> 'email' is not null then
    new.user_email := lower(auth.jwt() ->> 'email');
  end if;
  return new;
end;
$$;

drop trigger if exists push_subscriptions_stamp_owner on public.push_subscriptions;
create trigger push_subscriptions_stamp_owner
  before insert or update on public.push_subscriptions
  for each row execute function public.stamp_push_owner();

-- Realtime: the app listens for inserts/updates/deletes on baby_events.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'baby_events'
  ) then
    alter publication supabase_realtime add table public.baby_events;
  end if;
end;
$$;

-- Partner alert. pg_net sends it after the insert commits and never blocks
-- or fails the insert itself. Reuses the cron shared secret that already
-- guards check-overdue. Only app logs (with a known logger) alert.
create or replace function public.notify_partner_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
begin
  if new.logged_by is null then
    return new;
  end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_shared_secret';
  perform net.http_post(
    url := 'https://smfcfvzuytbnvqectrtf.supabase.co/functions/v1/notify-log',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := jsonb_build_object('record', to_jsonb(new))
  );
  return new;
end;
$$;

revoke all on function public.notify_partner_log() from public, anon, authenticated;

drop trigger if exists baby_events_notify_partner on public.baby_events;
create trigger baby_events_notify_partner
  after insert on public.baby_events
  for each row execute function public.notify_partner_log();
