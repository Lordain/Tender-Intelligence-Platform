-- A procurement category the SOURCE never published is not "services".
--
-- scope_type has been `not null` with a five-value check since 0001, so every
-- mapper facing a source with no category field had to pick one, and each
-- picked the blandest: chile-busca-mapper.ts and chile-ocds-mapper.ts both
-- write "services" with a comment saying the door publishes no category at
-- all. The row then claims, to a reader and to the 采购类型 filter, that this
-- is a services contract. A Chilean motorway (AVO II) and seven lots of the
-- 34th PPP round are filed as services today.
--
-- The cost is not cosmetic: filtering for 工程 returns nothing from that
-- source while works ARE present, and nothing on the page says so. Missing
-- data shown as a confident wrong value is worse than missing data shown as
-- missing.
--
-- So 'unknown' becomes a sixth legal value, meaning "the source published no
-- category", distinct from all five real ones. Existing rows are untouched:
-- this only widens what the constraint accepts, so nothing already stored can
-- become invalid, and no row changes value here.
alter table tenders drop constraint if exists tenders_scope_type_check;

alter table tenders
  add constraint tenders_scope_type_check
  check (scope_type in ('equipment', 'services', 'equipment_services', 'works', 'consulting', 'unknown'));
