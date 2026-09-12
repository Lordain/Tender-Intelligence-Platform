-- Access to tender details is now decided by the Next.js server. The public
-- list and homepage remain visible because those pages read through the
-- service-role server client, while direct anon/authenticated REST queries can
-- no longer bypass the application's guest/subscriber authorization rules.
drop policy if exists "Public read access" on buyers;
drop policy if exists "Public read access" on industries;
drop policy if exists "Public read access" on tenders;
drop policy if exists "Public read access" on tender_requirements;
drop policy if exists "Public read access" on tender_key_dates;
drop policy if exists "Public read access" on tender_risks;
drop policy if exists "Public read access" on tender_documents;
