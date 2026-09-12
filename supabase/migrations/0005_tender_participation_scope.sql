-- "Carácter del procedimiento" from the real Compras MX exports (contracts
-- and open tenders) — whether a foreign bidder can participate at all.
-- Nullable: only sources that carry this real field populate it; nothing
-- infers or fabricates a value. See TenderParticipationScope in
-- types/tender.ts for why the values are surfaced as-is rather than
-- interpreted.

alter table tenders
  add column if not exists participation_scope text
    check (participation_scope in ('national', 'international_treaty', 'international_open'));
