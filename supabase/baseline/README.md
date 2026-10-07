# Baseline schema

The tables in here were created directly in Supabase before the
migrations folder existed. Nothing in `supabase/migrations/` creates
them, so a database built by replaying migrations does not have them
and never did.

They are kept as `pg_dump --schema-only` output, byte for byte as the
database produced it. That is deliberate: a hand-tidied copy is a copy
that can quietly drift from what is actually running, and the whole
point of these files is to be the truth about production.

## Do not replay these against the live database

They are `CREATE TABLE`, not `CREATE TABLE IF NOT EXISTS`, and they
carry no guards. Running `gis_tables.sql` against the live database
fails on the first statement. It is reference material, and the
starting point for any *new* database — a second environment, a test
copy, or the separate GIS application.

## What is here

`gis_tables.sql` — the six GIS tables with no committed DDL:
`GIS_Feature`, `GIS_Layer`, `GIS_Line_Type`, `GIS_Surface_Type`,
`GIS_Basemap`, `GIS_Source`, with their sequences, indexes, triggers
and constraints.

Worth knowing from it:

- Geometry is JSONB arrays of coordinate pairs. There is no PostGIS
  dependency anywhere in the GIS schema.
- Four foreign keys cross from GIS into business tables, all cascading:
  `GIS_Feature.Project_ID`, `GIS_Feature.Plot_ID`,
  `GIS_Basemap.Project_ID` and `GIS_Source.Project_ID`. Deleting a plot
  deletes the features drawn on it.
- `GIS_Feature` carries two check constraints. `Feature_Role` has 25
  permitted values and is the constraint fifteen migrations have edited.

## Regenerating

    pg_dump -h <host> -p 5432 -U <user> -d postgres \
      --schema-only --no-owner --no-privileges \
      -t '"GIS_Feature"' -t '"GIS_Layer"' -t '"GIS_Line_Type"' \
      -t '"GIS_Surface_Type"' -t '"GIS_Basemap"' -t '"GIS_Source"' \
      > supabase/baseline/gis_tables.sql

Functions are a separate problem and live in migrations instead, so
they can be replayed: see `0259_recover_gis_functions.sql`.
`gis/find_uncommitted_functions.sql` asks the database which functions
are still missing from this repository.
