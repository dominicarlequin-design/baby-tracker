-- Custom log entries ("Custom" button on Today).
-- A custom event is a baby_events row with type 'custom' and a free-text
-- custom_label (e.g. "Vitamin D", "Tummy time"). Every other screen and the
-- overdue alerts look only at their own specific types, so custom rows
-- never affect feeds, sleep, diapers, medicine or their averages.

alter table public.baby_events add column if not exists custom_label text;

alter table public.baby_events drop constraint if exists baby_events_type_check;
alter table public.baby_events add constraint baby_events_type_check
  check (type = any (array['feed', 'nap_start', 'nap_end', 'diaper', 'medicine', 'sleep_start', 'sleep_end', 'custom']));

alter table public.baby_events add constraint baby_events_custom_label_check
  check (
    (type = 'custom' and custom_label is not null and length(btrim(custom_label)) between 1 and 60)
    or (type <> 'custom' and custom_label is null)
  );
