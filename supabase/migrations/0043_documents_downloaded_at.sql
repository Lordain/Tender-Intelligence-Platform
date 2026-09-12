-- Lets an admin mark "I have already downloaded this tender's bid documents."
--
-- The /admin/documents-needed worklist is a list of tenders with no attachment
-- logged yet, and working it means leaving the page: download the ZIP (or hunt
-- the documents down by hand on the official platform), come back, and have no
-- way to tell which rows were already dealt with. With a few dozen rows and a
-- session that spans days, that is guesswork (user, 2026-09-11: 我每下载一份就
-- 点这个项目的标记，方便识别哪些标书已经下载，哪些还没有).
--
-- Why this is NOT documents_unavailable, which already exists: that one means
-- "this source has no obtainable documents at all" and REMOVES the row from
-- the worklist for good. This one means "I have the files in hand, the
-- analysis step is next" — the row stays, because it is still waiting for its
-- attachments to be uploaded, and the marker has to be undoable when a fresh
-- bases integradas supersedes what was downloaded.
--
-- A timestamp rather than a boolean, for the same reason: a Peruvian tender's
-- documents are republished after the consultas round, so "downloaded" is only
-- meaningful next to when. Null means not downloaded.
alter table tenders add column if not exists documents_downloaded_at timestamptz;

-- The worklist reads this column on every row it renders; partial index
-- because the common query is "which of these are still outstanding".
create index if not exists tenders_documents_downloaded_at_idx
  on tenders (documents_downloaded_at)
  where documents_downloaded_at is not null;
