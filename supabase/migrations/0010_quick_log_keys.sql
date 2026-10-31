-- Quick log keys: lets an iPhone Shortcut log a feed, diaper or nap without
-- opening the app (Profile > Quick log from your Lock Screen). The app makes
-- a random key on the phone, shows it once, and stores only its SHA-256
-- hash here. The quick-log edge function hashes the key it receives and
-- logs as the parent who owns it.

create table if not exists public.quick_log_keys (
  id bigint generated always as identity primary key,
  user_email text,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  label text not null default 'iPhone' check (char_length(label) between 1 and 40),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.quick_log_keys enable row level security;
-- Each parent sees and manages only their own keys.
drop policy if exists "own quick log keys" on public.quick_log_keys;
create policy "own quick log keys" on public.quick_log_keys
  for all
  using (public.is_family() and user_email = lower(auth.jwt() ->> 'email'))
  with check (public.is_family() and user_email = lower(auth.jwt() ->> 'email'));

create or replace function public.stamp_quick_log_key()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.user_email := lower(auth.jwt() ->> 'email');
  return new;
end; $$;
drop trigger if exists quick_log_keys_stamp on public.quick_log_keys;
create trigger quick_log_keys_stamp before insert on public.quick_log_keys
  for each row execute function public.stamp_quick_log_key();
