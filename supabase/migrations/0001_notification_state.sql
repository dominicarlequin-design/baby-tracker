-- Tracks the last time each overdue category (feed/diaper/nap/sleep/
-- medicine) fired a push notification, so app/api/check-overdue can tell a
-- brand-new overdue episode (send once) from a category that's still
-- overdue ten minutes later (don't resend every poll) from one that's been
-- overdue for hours (resend as a reminder). No RLS policy is added on
-- purpose — only the service-role key (lib/supabaseAdmin.js) ever touches
-- this table, from the server-side check-overdue route.
create table if not exists notification_state (
  category text primary key,
  last_notified_at timestamptz not null default now()
);

-- This repo has no prior tracked migrations (the existing baby_config/
-- baby_events/push_subscriptions tables were created ad hoc via the
-- Supabase dashboard) — this file is just the first one to actually get
-- committed, run it once in the Supabase SQL editor.
