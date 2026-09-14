-- Corrects 0048's description of what ficha_url is for.
--
-- 0048 stored the pasted ficha link as an admin-side convenience and said so,
-- explicitly leaving the public 官方入口 pointing at whatever the feed gave.
-- The user's answer to that, the same day (2026-09-15): 现在我们给的官方链接
-- 只有平台页，没有直达标书 — which is exactly right, and is the whole reason
-- the column exists. Pasting a ficha link now also writes `source_url`, so
-- the public entry point opens the tender itself rather than SEACE's search
-- page.
--
-- Nothing to migrate: ficha_url keeps holding the same value it did. Only the
-- comment was wrong, and a comment that describes a decision that has since
-- been reversed is worse than none.
comment on column tenders.ficha_url is
  'Deep link to this tender''s page on the source portal, entered by an admin alongside a pasted cronograma. Not derivable from the feed (Peru fichas are keyed by a UUID the OCDS record does not carry). Also copied into source_url when set, so the public 官方入口 deep-links to the tender; kept separately as the record of where the schedule itself was read from.';
