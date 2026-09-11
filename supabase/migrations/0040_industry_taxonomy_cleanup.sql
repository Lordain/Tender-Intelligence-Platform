-- Industry taxonomy change, 2026-09-11, per the user:
--   1. 删除全站的教育、税务 — drop the "education" and "tax" tags entirely
--   2. 把矿业+能源合并，统称能矿 — merge "mining" into "energy", renamed
--      "energy_mining"
--
-- Why: the filter offered twelve categories while most had no tenders behind
-- them. Education and tax were empty by design — this platform's own exclude
-- rules remove school buildings, childcare, medical services, consulting and
-- tax-culture programs, which is essentially all those two categories ever
-- contained. Energy and mining were near-empty for a different reason:
-- governments here grant mining by concession rather than tendering it, and
-- oil & gas comes through a single small source. Two dead options are worse
-- than one live one.
--
-- Code side: lib/industry.ts no longer defines these keys and no longer
-- tags them, so anything re-imported or re-classified produces the new set
-- on its own. This migration is for the rows already stored — without it
-- they keep tags no filter can select, which is invisible in the UI but
-- shows up in exports and in the admin tagging form.
--
-- array_remove/array_replace and not array_agg over unnest: they preserve
-- the column's own ordering and cost one pass, and they are null-safe on
-- the '{}' default. The double array_remove after the replace collapses the
-- duplicate a row tagged BOTH energy and mining would otherwise end up with.
update tenders
set industries = (
  select array_remove(
    array_remove(
      array_replace(array_replace(industries, 'mining', 'energy_mining'), 'energy', 'energy_mining'),
      'education'),
    'tax')
)
where industries && array['education', 'tax', 'energy', 'mining'];

-- Collapse energy_mining appearing twice (a row that carried energy AND
-- mining). Done separately because array_replace cannot dedupe.
update tenders
set industries = (
  select array_agg(distinct value order by value)
  from unnest(industries) as value
)
where array_length(industries, 1) is not null
  and array_length(industries, 1) <> (select count(distinct value) from unnest(industries) as value);

-- Same three changes on saved notification preferences (email_notification_preferences, migration 0017),
-- so a subscriber who had asked for "energy" keeps getting those alerts
-- under the new key instead of silently receiving nothing.
update email_notification_preferences
set industries = (
  select array_remove(
    array_remove(
      array_replace(array_replace(industries, 'mining', 'energy_mining'), 'energy', 'energy_mining'),
      'education'),
    'tax')
)
where industries && array['education', 'tax', 'energy', 'mining'];
