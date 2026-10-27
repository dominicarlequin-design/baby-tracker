-- Supplies: counts of diapers, wipes, formula... with a "running low" point,
-- plus a shopping list both parents share.
--
-- - Logging a diaper takes one off the Diapers count (track = 'diaper');
--   undoing/deleting that log puts it back. Done here in the database so
--   both phones always agree.
-- - adjust_supply() changes a count by +/- n atomically, so two phones
--   tapping at once never lose an update.
-- - When a count drops to its low point, the item goes on the shopping list
--   (if it isn't already) and notify-log pushes "Running low" to both phones.

create table if not exists public.baby_supplies (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 40),
  unit text not null default '' check (char_length(unit) <= 20),
  count integer check (count >= 0), -- null = not counted yet
  low_at integer not null default 0 check (low_at >= 0),
  track text check (track in ('diaper')),
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.baby_shopping (
  id bigint generated always as identity primary key,
  item text not null check (char_length(item) between 1 and 60),
  done boolean not null default false,
  added_by text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);

alter table public.baby_supplies enable row level security;
alter table public.baby_shopping enable row level security;
drop policy if exists "family all supplies" on public.baby_supplies;
create policy "family all supplies" on public.baby_supplies for all using (public.is_family()) with check (public.is_family());
drop policy if exists "family all shopping" on public.baby_shopping;
create policy "family all shopping" on public.baby_shopping for all using (public.is_family()) with check (public.is_family());

-- Who added a shopping item, from the signed-in account.
create or replace function public.stamp_shopping_added_by()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.jwt() ->> 'email' is not null then new.added_by := lower(auth.jwt() ->> 'email'); end if;
  return new;
end; $$;
drop trigger if exists baby_shopping_stamp on public.baby_shopping;
create trigger baby_shopping_stamp before insert on public.baby_shopping
  for each row execute function public.stamp_shopping_added_by();

-- Atomic +/- for a count (never below zero). Runs as the caller, so RLS applies.
create or replace function public.adjust_supply(supply_id bigint, delta integer)
returns public.baby_supplies language sql set search_path = '' as $$
  update public.baby_supplies
     set count = greatest(coalesce(count, 0) + delta, 0), updated_at = now()
   where id = supply_id
  returning *;
$$;

-- Diaper logs move the tracked diaper count.
create or replace function public.track_diaper_supply()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.type = 'diaper' then
    update public.baby_supplies set count = greatest(count - 1, 0), updated_at = now() where track = 'diaper' and count is not null;
  elsif tg_op = 'DELETE' and old.type = 'diaper' then
    update public.baby_supplies set count = count + 1, updated_at = now() where track = 'diaper' and count is not null;
  end if;
  return null;
end; $$;
revoke all on function public.track_diaper_supply() from public, anon, authenticated;
drop trigger if exists baby_events_track_diapers on public.baby_events;
create trigger baby_events_track_diapers after insert or delete on public.baby_events
  for each row execute function public.track_diaper_supply();

-- Crossing the low point: add to the shopping list and push to both phones.
create or replace function public.supply_ran_low()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  secret text;
begin
  if new.count is not null and new.count <= new.low_at
     and (old.count is null or old.count > old.low_at) then
    if not exists (select 1 from public.baby_shopping where not done and lower(item) = lower(new.name)) then
      insert into public.baby_shopping (item, added_by) values (new.name, 'app');
    end if;
    select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_shared_secret';
    perform net.http_post(
      url := 'https://smfcfvzuytbnvqectrtf.supabase.co/functions/v1/notify-log',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
      body := jsonb_build_object('supply', jsonb_build_object('id', new.id, 'name', new.name, 'count', new.count, 'unit', new.unit))
    );
  end if;
  return new;
end; $$;
revoke all on function public.supply_ran_low() from public, anon, authenticated;
drop trigger if exists baby_supplies_low on public.baby_supplies;
create trigger baby_supplies_low after update of count on public.baby_supplies
  for each row execute function public.supply_ran_low();

-- Live updates on both phones.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'baby_supplies') then
    alter publication supabase_realtime add table public.baby_supplies;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'baby_shopping') then
    alter publication supabase_realtime add table public.baby_shopping;
  end if;
end; $$;

-- Starting items (not counted yet; you enter what you have).
insert into public.baby_supplies (name, unit, count, low_at, track, sort)
select * from (values
  ('Diapers', 'diapers', null::int, 15, 'diaper', 1),
  ('Wipes', 'packs', null::int, 1, null, 2),
  ('Formula', 'cans', null::int, 1, null, 3)
) as v(name, unit, count, low_at, track, sort)
where not exists (select 1 from public.baby_supplies);
