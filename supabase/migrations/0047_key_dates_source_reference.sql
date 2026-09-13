-- Where in the bid document a key date was read.
--
-- The extraction schema already demands one for every date it returns
-- ("página 7, Capítulo II, Cronograma" — same bar as every requirement and
-- risk: no citation, no entry), and lib/db/extracted-key-dates.ts then threw
-- it away, because this table had nowhere to put it. Requirements and risks
-- both keep theirs (`source_reference`), and key dates are the field where
-- it matters most: a requirement a customer doubts costs them a phone call,
-- while a deadline they doubt costs them the bid — and a deadline with no
-- citation cannot be checked against the document at all, only believed.
--
-- Admin-facing. The public 关键日期 timeline stays a schedule and shows no
-- page numbers; this exists so that the person validating an extraction can
-- open the right page, and so `npm run review:key-dates` can print it next
-- to the date it is questioning.
--
-- Nullable with no default: every date already in the table came either from
-- a source feed or from a person typing it, and neither has a page number.
alter table tender_key_dates
  add column if not exists source_reference text;

comment on column tender_key_dates.source_reference is
  'For extracted_from_document rows, where in the document the date was read (e.g. "página 7, Cronograma"). Null for source-feed and hand-entered dates.';
