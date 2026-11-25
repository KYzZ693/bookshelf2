-- =============================================================================
-- Book Shelf :: 20261125 0100 :: More merchandise types
-- (New enum values must be committed before they are used, so they live in
-- their own migration; 0200 re-classifies existing rows.)
-- =============================================================================
alter type public.merch_type add value if not exists 'art_print';
alter type public.merch_type add value if not exists 'character_goods';
alter type public.merch_type add value if not exists 'collectible';
