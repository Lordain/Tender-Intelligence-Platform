-- The deep link to the tender's own page on the source portal, captured by
-- the admin who pastes its schedule.
--
-- Why it cannot be derived: Peru's SEACE ficha de selección is addressed by a
-- UUID that appears nowhere in the OCDS record (see
-- lib/ingestion/seace-cronograma.ts), so `source_url` for a Peru tender is the
-- generic search page — the only URL the data can produce. That was tolerable
-- until 13 hand-entered deadlines were lost to an import on 2026-09-15 and
-- every one of them had to be found again by typing its procedure number into
-- SEACE's search. The admin pasting a cronograma is already looking at the
-- right page with its URL in the address bar; this is where it goes.
--
-- Admin-side only for now. It is NOT shown to customers: these URLs carry a
-- session-ish query parameter (ptoRetorno=LOCAL) and nobody has yet confirmed
-- one opens cleanly in a browser that has never visited SEACE. Promoting it to
-- the public 官方入口 is a separate decision, to be made after someone checks.
alter table tenders
  add column if not exists ficha_url text;

comment on column tenders.ficha_url is
  'Deep link to this tender''s page on the source portal, entered by an admin alongside a pasted cronograma. Not derivable from the feed (Peru fichas are keyed by a UUID the OCDS record does not carry). Admin-facing; not rendered on public pages.';
