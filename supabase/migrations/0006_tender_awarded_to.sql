-- Winning supplier/contractor name for awarded contracts — "Proveedor o
-- contratista" in the real Compras MX Datos Abiertos contracts export
-- (100% populated across the full real 23,597-row 2025 file). Nullable:
-- only a source with real award data (the contracts export) populates it.

alter table tenders
  add column if not exists awarded_to text;
