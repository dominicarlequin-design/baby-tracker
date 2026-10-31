-- Handoff note: one parent leaves a short note ("gave Tylenol at 11, she's
-- fussy") that sits at the top of the other parent's Today screen until
-- they tap "Got it". Writing a note pushes it to the other parent's phones
-- through notify-log, the same way partner logs do.

create table if not exists public.baby_handoff (
  id bigint generated always as identity primary key,
  note text not null check (char_length(btrim(note)) between 1 and 280),
  created_by text,
  created_at timestamptz not null default now(),
  seen_by text,
  seen_at timestamptz
);

alter table public.baby_handoff enable row level security;
drop policy if exists "family all handoff" on public.baby_handoff;
create policy "family all handoff" on public.baby_handoff
  for all using (public.is_family()) with check (public.is_family());

-- Who wrote it and who marked it seen come from the signed-in account,
-- never from the request body.
create or replace function public.stamp_handoff()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.jwt() ->> 'email' is not null then new.created_by := lower(auth.jwt() ->> 'email'); end if;
    new.seen_by := null;
    new.seen_at := null;
  elsif new.seen_at is not null and old.seen_at is null then
    if auth.jwt() ->> 'email' is not null then new.seen_by := lower(auth.jwt() ->> 'email'); end if;
  end if;
  return new;
end; $$;
drop trigger if exists baby_handoff_stamp on public.baby_handoff;
create trigger baby_handoff_stamp before insert or update on public.baby_handoff
  for each row execute function public.stamp_handoff();

-- Push the new note to the other parent's phones.
create or replace function public.handoff_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_shared_secret';
  perform net.http_post(
    url := 'https://smfcfvzuytbnvqectrtf.supabase.co/functions/v1/notify-log',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := jsonb_build_object('handoff', jsonb_build_object('id', new.id, 'note', new.note, 'created_by', new.created_by))
  );
  return new;
end; $$;
revoke all on function public.handoff_notify() from public, anon, authenticated;
drop trigger if exists baby_handoff_notify on public.baby_handoff;
create trigger baby_handoff_notify after insert on public.baby_handoff
  for each row execute function public.handoff_notify();

-- Live updates on both phones.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'baby_handoff'
  ) then
    alter publication supabase_realtime add table public.baby_handoff;
  end if;
end $$;
