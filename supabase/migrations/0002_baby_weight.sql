-- Her weight in lbs, set on the Profile tab. Drives the daily milk target
-- (lib/milk.js): weight x 2.5 oz, capped at 32 oz a day. Nullable: until
-- it's set, the Feedings card just shows its plain "Total: N oz" line.
-- Run once in the Supabase SQL editor (same as 0001).
alter table baby_config add column if not exists weight_lbs numeric;
