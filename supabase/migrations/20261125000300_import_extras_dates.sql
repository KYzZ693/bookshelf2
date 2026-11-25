-- =============================================================================
-- Book Shelf :: 20261125 0300 :: import_book_extras also sets release dates
-- Items: [{ "ref": "...", "bonus_items": [...]?, "publication_date": "YYYY-MM-DD"? }]
-- bonus_items is replaced when given; publication_date only fills an empty date
-- (an admin's correction is kept).
-- =============================================================================
create or replace function public.import_book_extras(p_items jsonb)
returns integer
language sql
set search_path = ''
as $$
  with src as (
    select x ->> 'ref' as ref,
           x ? 'bonus_items' as has_items,
           coalesce((select array_agg(v) from jsonb_array_elements_text(x -> 'bonus_items') v), '{}') as items,
           case when (x ->> 'publication_date') ~ '^\d{4}-\d{2}-\d{2}$' then (x ->> 'publication_date')::date end as pub
      from jsonb_array_elements(p_items) x
  ), upd as (
    update public.books b
       set bonus_items      = case when src.has_items then src.items else b.bonus_items end,
           publication_date = coalesce(b.publication_date, src.pub)
      from src
     where b.source_ref = src.ref
       and ((src.has_items and b.bonus_items is distinct from src.items)
            or (b.publication_date is null and src.pub is not null))
    returning 1
  )
  select count(*)::integer from upd;
$$;
revoke execute on function public.import_book_extras(jsonb) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.import_book_extras(jsonb) to service_role;
  end if;
end;
$$;
