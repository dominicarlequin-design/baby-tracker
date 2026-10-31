-- Well-child checkups: one row per visit Dom or Ysa marks done (Upcoming >
-- Checkups). `key` matches lib/checkups.js ('m6' = 6-month visit). The
-- schedule itself lives in the app; this only stores what happened.

create table if not exists public.baby_checkups (
  key text primary key check (key ~ '^[a-z0-9]{2,8}$'),
  visit_date date not null,
  notes text check (notes is null or char_length(notes) <= 500),
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.baby_checkups enable row level security;
drop policy if exists "family all checkups" on public.baby_checkups;
create policy "family all checkups" on public.baby_checkups
  for all using (public.is_family()) with check (public.is_family());

create or replace function public.stamp_checkup()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.jwt() ->> 'email' is not null then new.updated_by := lower(auth.jwt() ->> 'email'); end if;
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists baby_checkups_stamp on public.baby_checkups;
create trigger baby_checkups_stamp before insert or update on public.baby_checkups
  for each row execute function public.stamp_checkup();
