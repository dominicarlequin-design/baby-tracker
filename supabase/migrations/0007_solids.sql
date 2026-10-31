-- Solids log ("Solids" card on Today).
-- A solid-food entry is a baby_events row with type 'solid', a food_name
-- ("Pumpkin") and an optional food_reaction ('none' | 'mild' | 'strong').
-- Every other screen and the overdue alerts look only at their own event
-- types, so solids never affect feeds, sleep, diapers or medicine.
-- Purely additive: older app versions ignore the new type and columns.

alter table public.baby_events add column if not exists food_name text;
alter table public.baby_events add column if not exists food_reaction text;

alter table public.baby_events drop constraint if exists baby_events_type_check;
alter table public.baby_events add constraint baby_events_type_check
  check (type = any (array['feed', 'nap_start', 'nap_end', 'diaper', 'medicine', 'sleep_start', 'sleep_end', 'custom', 'solid']));

alter table public.baby_events drop constraint if exists baby_events_food_check;
alter table public.baby_events add constraint baby_events_food_check
  check (
    (type = 'solid' and food_name is not null and length(btrim(food_name)) between 1 and 60
      and (food_reaction is null or food_reaction in ('none', 'mild', 'strong')))
    or (type <> 'solid' and food_name is null and food_reaction is null)
  );
