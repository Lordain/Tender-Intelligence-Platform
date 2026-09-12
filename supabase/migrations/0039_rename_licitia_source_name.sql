-- Renames the source shown on every tender discovered through the Compras
-- MX vigentes feed, from the old provenance-flavoured string to plain
-- "Compras MX" (2026-09-10, per the user: 不要写来源 LicitIA，直接写
-- ComprasMX).
--
-- The rows are fetched through LicitIA Abierto's open mirror of the Compras
-- MX / CompraNet Datos Abiertos feed, and the old name said so. But this
-- column is what the public detail page prints under 官方投标平台, right
-- above a link to comprasmx.buengobierno.gob.mx — so naming the mirror
-- there made the tender look like it came from somewhere other than the
-- platform a bidder actually has to use. The transport is now recorded in
-- lib/ingestion/discover-comprasmx-vigente.ts's comment instead.
--
-- Matches on the exact old string only, so it cannot touch the two other
-- Compras MX-derived sources ("Compras MX — Difusión de procedimientos
-- (exportación pública)" and "Contrataciones Abiertas (OCDS) — Compras MX"),
-- which are genuinely different feeds and keep their own names.
update tenders
set source_name = 'Compras MX'
where source_name = 'LicitIA Abierto (espejo de ComprasMX/CompraNet Datos Abiertos)';
